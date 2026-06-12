import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { toUtcIso } from './_datetime.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The id of the post to update.'),
  caption: z.string().min(1).max(10_000).optional().describe('Replace the caption.'),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('New scheduled time as ISO 8601 with offset.'),
  attachment_ids: z
    .array(z.string().min(1))
    .optional()
    .describe('Replace the attachment list.'),
  category_id: z.string().optional().describe('Replace the category id.'),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'update_post',
  description:
    'Update an existing scheduled post — change the caption, schedule time, attachments, or category. Provide only the fields you want to change. Cannot update a post that has already been published.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('update_post', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    // Fetch current post to preserve channel_id and other fields the API
    // requires on update. The Viraly API's CreatePostViewModel is reused for
    // PUT and validates ScheduleAction against ScheduledAt — picking the
    // right action based on the post's current status (and whether the
    // caller is scheduling a draft) is what determines whether the request
    // passes validation.
    const current = await client.call<PostDtoUpstream>({
      method: 'GET',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}`,
    });

    if (current.status === 'Published') {
      throw new Error('Cannot update a post that has already been published.');
    }

    // Decide ScheduleAction: keep drafts as drafts unless the caller is
    // promoting them by passing scheduled_at; otherwise stay 'Schedule'.
    const isDraft = current.status === 'Draft';
    const promotingDraft = isDraft && input.scheduled_at != null;
    const scheduleAction = isDraft && !promotingDraft ? 'SaveDraft' : 'Schedule';

    // For 'Schedule', the API rejects null/past dates — reuse the existing
    // scheduled time if the caller didn't supply a new one. Only caller input
    // is UTC-normalized; the API's own value round-trips as-is.
    const scheduledAt = toUtcIso(input.scheduled_at) ?? current.scheduledAt ?? undefined;

    const post = await client.call<PostDtoUpstream>({
      method: 'PUT',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}`,
      idempotent: true,
      body: {
        channelId: current.channelId,
        caption: input.caption ?? current.caption,
        scheduledAt: scheduleAction === 'Schedule' ? scheduledAt : undefined,
        timezone: input.timezone,
        scheduleAction,
        // The API only consumes the plural categoryIds (PostService reads
        // model.CategoryIds; the singular CategoryId on the view model is
        // dead). UpdatePost also wipes ALL existing category links and
        // re-adds only what's in categoryIds — so a caption-only edit must
        // echo back the post's current categories or they're lost.
        categoryIds: input.category_id ? [input.category_id] : (current.categoryIds ?? []),
        // Inherit the post's existing attachments when the caller didn't
        // specify a new list. The API returns them under `postAttachments`
        // (each with a nested `attachment.id`); the old `attachmentIds`
        // fallback is kept for any consumer that still serializes it.
        postAttachments:
          input.attachment_ids?.map((id, i) => ({ attachmentId: id, order: i })) ??
          current.postAttachments
            ?.flatMap((a, i) => {
              const attachmentId = a.attachment?.id;
              if (!attachmentId) return [];
              return [{
                attachmentId,
                order: a.order ?? i,
                altText: a.altText ?? undefined,
              }];
            }) ??
          current.attachmentIds?.map((id, i) => ({ attachmentId: id, order: i })) ??
          [],
      },
    });

    return mapPost(post);
  },
});
