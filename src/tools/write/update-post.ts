import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { attachmentIdsInput, attachmentsInput, buildPostAttachments } from './_attachments.js';
import { toFutureUtcIso } from './_datetime.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';

const SUPPORTED_TIMEZONES = new Set<string>([...Intl.supportedValuesOf('timeZone'), 'UTC']);

// Transient/in-flight statuses we must not race by re-submitting an update.
// PostStatus values that are mid-pipeline (enqueued/processing/publishing).
const IN_FLIGHT_STATUSES = new Set<string>([
  'ProcessingEnqueued',
  'Processing',
  'Processed',
  'PublishingEnqueued',
  'Publishing',
]);

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The id of the post to update.'),
  caption: z.string().min(1).max(10_000).optional().describe('Replace the caption.'),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('New scheduled time as ISO 8601 with offset.'),
  attachment_ids: attachmentIdsInput,
  attachments: attachmentsInput,
  category_id: z.string().optional().describe('Replace the category id.'),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'update_post',
  description:
    'Update an existing scheduled post — change the caption, schedule time, attachments, or category. Provide only the fields you want to change. Cannot update a post that has already been published. To set or change accessibility alt text on media, pass `attachments` (with per-item alt_text) instead of attachment_ids; existing alt text is preserved when you leave attachments unchanged.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    if (!SUPPORTED_TIMEZONES.has(input.timezone)) {
      throw new Error(
        `Invalid timezone "${input.timezone}". Use an IANA timezone identifier ` +
          '(e.g. "America/New_York", "Europe/London", "UTC"). Call list_timezones to see valid values.',
      );
    }

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

    // Do not race the publish pipeline. Once a post is enqueued/processing/
    // publishing, editing it via this tool either silently no-ops or collides
    // with the in-flight publish — reject rather than force a 'Schedule'.
    if (current.status && IN_FLIGHT_STATUSES.has(current.status)) {
      throw new Error(
        `Cannot update a post that is currently being processed or published (status: ${current.status}). ` +
          'Wait until it reaches a terminal state, or cancel it first.',
      );
    }

    if (current.status === 'PublishFailed' || current.status === 'ProcessingFailed') {
      throw new Error(
        `Cannot update a post in a failed state (status: ${current.status}). ` +
          'Recreate or reschedule the post instead.',
      );
    }

    // Decide ScheduleAction. Drafts stay drafts unless the caller promotes them
    // with a scheduled_at. A post awaiting approval must NOT be silently flipped
    // to Scheduled — require an explicit reschedule (a new scheduled_at) to act
    // on it, otherwise reject so we don't bypass the approval workflow.
    const isDraft = current.status === 'Draft';
    const isPendingApproval = current.status === 'PendingApproval';
    const promotingDraft = isDraft && input.scheduled_at != null;

    if (isPendingApproval && input.scheduled_at == null) {
      throw new Error(
        'This post is pending approval. Editing it would convert it to Scheduled and bypass the ' +
          'approval workflow. To intentionally reschedule it, call reschedule_post or pass a new scheduled_at.',
      );
    }

    const scheduleAction = isDraft && !promotingDraft ? 'SaveDraft' : 'Schedule';

    // For 'Schedule', the API rejects null/past dates. Reuse the existing
    // scheduled time only when the caller didn't supply one — but if that
    // existing time has already elapsed (e.g. a Scheduled post whose slot
    // passed), echoing it back fails validation with "Post date can't be in
    // the past". Detect that and require an explicit scheduled_at instead.
    // A caller-supplied time must be in the future — reject a past value with a
    // clear message rather than forwarding it for an opaque MODEL_VALIDATION_FAILED.
    const callerScheduledAt = input.scheduled_at ? toFutureUtcIso(input.scheduled_at) : undefined;
    let scheduledAt = callerScheduledAt ?? current.scheduledAt ?? undefined;

    if (scheduleAction === 'Schedule' && callerScheduledAt == null) {
      const existing = current.scheduledAt ? new Date(current.scheduledAt) : undefined;
      if (!existing || Number.isNaN(existing.getTime())) {
        throw new Error('scheduled_at must be supplied to schedule this post.');
      }
      if (existing.getTime() <= Date.now()) {
        throw new Error(
          "This post's scheduled time is already in the past. Pass a future scheduled_at to update it.",
        );
      }
      scheduledAt = current.scheduledAt ?? undefined;
    }

    const post = await dedupeWrite(idempotencyKey, () =>
      client.call<PostDtoUpstream>({
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
          // Inherit the post's existing attachments (preserving their alt text)
          // when the caller didn't specify a new list. The API returns them under
          // `postAttachments` (each with a nested `attachment.id`); the old
          // `attachmentIds` fallback is kept for any consumer that still serializes it.
          postAttachments:
            buildPostAttachments(input) ??
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
      }),
    );

    return mapPost(post);
  },
});
