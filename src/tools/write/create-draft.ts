import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { attachmentIdsInput, attachmentsInput, buildPostAttachments } from './_attachments.js';
import { toUtcIso } from './_datetime.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';
import { toApiPostType } from './_post-type.js';

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
  attachment_ids: attachmentIdsInput,
  attachments: attachmentsInput,
  post_type: z
    .enum(['feed', 'reel', 'story', 'short'])
    .default('feed')
    .describe(
      'Placement of the post: "feed" (default), "reel" (Facebook/Instagram), "story" ' +
        '(Facebook/Instagram), "short" (YouTube). Other platforms support "feed" only.',
    ),
  board_id: z
    .string()
    .optional()
    .describe(
      'Pinterest only. The board to pin to — required when drafting for a Pinterest channel. ' +
        'Discover board ids with list_pinterest_boards.',
    ),
  category_id: z.string().optional(),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().optional(),
});

const SUPPORTED_TIMEZONES = new Set<string>([...Intl.supportedValuesOf('timeZone'), 'UTC']);

registerTool({
  name: 'create_draft',
  description:
    'Save a draft post (no publish, no schedule). Useful when the user wants to compose now and finalize later. The draft appears in list_drafts and on the calendar (at scheduled_at, or today if omitted) — it is never auto-published. To set accessibility alt text on media, pass `attachments` (with per-item alt_text) instead of attachment_ids.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    if (!SUPPORTED_TIMEZONES.has(input.timezone)) {
      throw new Error(
        `Invalid timezone "${input.timezone}". Use an IANA timezone identifier ` +
          '(e.g. "America/New_York", "Europe/London", "UTC"). Call list_timezones to see valid values.',
      );
    }
    const idempotencyKey = deriveIdempotencyKey('create_draft', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });
    // The upstream does NOT honor Idempotency-Key, so dedupeWrite is the only
    // protection against a model/client retry creating a duplicate draft.
    const post = await dedupeWrite(idempotencyKey, () =>
      client.call<PostDtoUpstream>({
        method: 'POST',
        path: '/api/platforms/posts',
        idempotent: true,
        body: {
          channelId: input.channel_id,
          caption: input.caption,
          scheduledAt: toUtcIso(input.scheduled_at),
          timezone: input.timezone,
          scheduleAction: 'SaveDraft',
          postType: toApiPostType(input.post_type),
          boardId: input.board_id,
          // The API only reads the plural categoryIds; the singular categoryId
          // binds to a dead view-model property and is silently ignored.
          categoryIds: input.category_id ? [input.category_id] : undefined,
          postAttachments: buildPostAttachments(input) ?? [],
        },
      }),
    );

    return mapPost(post);
  },
});
