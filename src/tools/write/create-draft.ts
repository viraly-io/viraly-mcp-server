import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { toUtcIso } from './_datetime.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id the draft is for.'),
  caption: z.string().min(1).max(10_000).describe('The draft text.'),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'Optional ISO 8601 datetime with offset for where the draft appears on the calendar. ' +
      'The draft is NOT published or scheduled — this only positions it. Defaults to now if omitted.',
    ),
  attachment_ids: z.array(z.string().min(1)).optional(),
  category_id: z.string().optional(),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'create_draft',
  description:
    'Save a draft post (no publish, no schedule). Useful when the user wants to compose now and finalize later. The draft appears in list_drafts and on the calendar (at scheduled_at, or today if omitted) — it is never auto-published.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('create_draft', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });
    const post = await client.call<PostDtoUpstream>({
      method: 'POST',
      path: '/api/platforms/posts',
      idempotent: true,
      body: {
        channelId: input.channel_id,
        caption: input.caption,
        scheduledAt: toUtcIso(input.scheduled_at),
        timezone: input.timezone,
        scheduleAction: 'SaveDraft',
        // The API only reads the plural categoryIds; the singular categoryId
        // binds to a dead view-model property and is silently ignored.
        categoryIds: input.category_id ? [input.category_id] : undefined,
        postAttachments:
          input.attachment_ids?.map((id, i) => ({ attachmentId: id, order: i })) ?? [],
      },
    });

    return mapPost(post);
  },
});
