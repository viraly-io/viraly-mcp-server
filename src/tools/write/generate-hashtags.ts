import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  content: z
    .string()
    .min(3)
    .max(512)
    .describe('The post text or topic to generate hashtags for. Capped at 512 characters by the API.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'generate_hashtags',
  description:
    'Generate a set of relevant hashtags for a post or topic using AI. Returns them as a single space-separated string the caller can append to a caption.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'generate_hashtags',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const hashtags = await client.call<string>({
      method: 'POST',
      path: '/api/platforms/ai/generate-hashtags',
      idempotent: true,
      body: {
        content: input.content,
      },
    });

    return { hashtags };
  },
});
