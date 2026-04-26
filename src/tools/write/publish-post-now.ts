import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The id of the post (or draft) to publish immediately.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'publish_post_now',
  description:
    'Immediately publish a draft or scheduled post, bypassing any scheduled time. Returns the post in its current state — actual platform delivery is asynchronous, so the response status may still be Scheduled until the worker picks it up. Use get_post to check progress.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'publish_post_now',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const post = await client.call<PostDtoUpstream>({
      method: 'POST',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}/publish`,
      idempotent: true,
    });

    return mapPost(post);
  },
});
