import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The id of the post to reschedule.'),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .describe('New scheduled time as ISO 8601 with offset (e.g. 2026-05-01T15:00:00Z). Must be in the future.'),
  timezone: z
    .string()
    .default('UTC')
    .describe('IANA timezone the scheduled_at should be interpreted in (e.g. "America/New_York").'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'reschedule_post',
  description:
    'Move an existing scheduled post to a new time without re-sending the caption or attachments. Lighter alternative to update_post when you only need to change the schedule. Cannot reschedule already-published posts.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'reschedule_post',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const post = await client.call<PostDtoUpstream>({
      method: 'PUT',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}/schedule`,
      idempotent: true,
      body: {
        scheduledAt: input.scheduled_at,
        timezone: input.timezone,
      },
    });

    return mapPost(post);
  },
});
