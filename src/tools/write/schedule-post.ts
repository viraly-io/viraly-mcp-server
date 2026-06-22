import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { toUtcIso } from './_datetime.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  channel_id: z
    .string()
    .min(1)
    .describe('The channel id to publish to. Use list_channels to discover ids.'),
  caption: z
    .string()
    .min(1)
    .max(10_000)
    .describe('The post text. Will be platform-formatted server-side.'),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'Optional ISO 8601 datetime with timezone offset (e.g. 2026-05-01T15:00:00Z). Required unless add_to_queue=true.',
    ),
  add_to_queue: z
    .boolean()
    .default(false)
    .describe('When true, ignore scheduled_at and add the post to the channel\'s default queue.'),
  attachment_ids: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional. IDs of media-library attachments to include (use list_media or upload_media to obtain).'),
  category_id: z.string().optional().describe('Optional. Category / content queue id.'),
  timezone: z
    .string()
    .default('UTC')
    .describe('IANA timezone for scheduling (e.g. "America/New_York"). Defaults to UTC.'),
  dry_run: z
    .boolean()
    .default(false)
    .describe(
      'When true, validate the inputs and return what would be created without writing to the database.',
    ),
  idempotency_key: z
    .string()
    .optional()
    .describe(
      'Optional. Stable key to dedupe retries. If omitted, derived from the input hash.',
    ),
});

const SUPPORTED_TIMEZONES = new Set<string>([...Intl.supportedValuesOf('timeZone'), 'UTC']);

registerTool({
  name: 'schedule_post',
  description:
    'Schedule a new social post to a single channel. Provide either scheduled_at (specific time) or add_to_queue=true (next slot in the channel\'s default queue). For multi-channel publishing, call this tool once per channel.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    if (!input.add_to_queue && !input.scheduled_at) {
      throw new Error('Either scheduled_at or add_to_queue=true must be provided.');
    }
    if (!SUPPORTED_TIMEZONES.has(input.timezone)) {
      throw new Error(
        `Invalid timezone "${input.timezone}". Use an IANA timezone identifier ` +
          '(e.g. "America/New_York", "Europe/London", "UTC"). Call list_timezones to see valid values.',
      );
    }

    const idempotencyKey = deriveIdempotencyKey('schedule_post', input, input.idempotency_key);
    const scheduledAtUtc = toUtcIso(input.scheduled_at);

    if (input.dry_run) {
      return {
        dry_run: true,
        would_create: {
          channel_id: input.channel_id,
          caption: input.caption,
          scheduled_at: scheduledAtUtc,
          add_to_queue: input.add_to_queue,
          attachment_count: input.attachment_ids?.length ?? 0,
          category_id: input.category_id,
          timezone: input.timezone,
        },
        idempotency_key: idempotencyKey,
      };
    }

    const client = getClient({ idempotencyKey });
    // The upstream does NOT honor Idempotency-Key, so dedupeWrite is the only
    // protection against a model/client retry creating a duplicate post.
    const post = await dedupeWrite(idempotencyKey, () =>
      client.call<PostDtoUpstream>({
        method: 'POST',
        path: '/api/platforms/posts',
        idempotent: true,
        body: {
          channelId: input.channel_id,
          caption: input.caption,
          scheduledAt: scheduledAtUtc,
          timezone: input.timezone,
          scheduleAction: input.add_to_queue ? 'AddToQueue' : 'Schedule',
          // The API only reads the plural categoryIds; the singular categoryId
          // binds to a dead view-model property and is silently ignored.
          categoryIds: input.category_id ? [input.category_id] : undefined,
          postAttachments:
            input.attachment_ids?.map((id, i) => ({ attachmentId: id, order: i })) ?? [],
        },
      }),
    );

    return mapPost(post);
  },
});
