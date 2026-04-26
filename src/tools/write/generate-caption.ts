import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  command: z
    .string()
    .min(3)
    .max(2000)
    .describe('Brief or instruction (e.g. "Write a tweet announcing our new product launch").'),
  tone: z
    .enum(['neutral', 'friendly', 'professional', 'witty', 'enthusiastic', 'casual'])
    .default('neutral')
    .describe('Voice / tone for the caption.'),
  channel_type: z
    .string()
    .optional()
    .describe(
      'Optional. Platform name to optimize length and style (e.g. "instagram", "twitter", "linkedin").',
    ),
  content: z.string().optional().describe('Optional. Additional context or source material.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'generate_caption',
  description:
    'Generate a social media caption using AI. Returns the caption text. Use this when the user asks for a draft caption, hashtags, or copy ideas. The caption can be passed to schedule_post or create_draft.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('generate_caption', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    const caption = await client.call<string>({
      method: 'POST',
      path: '/api/platforms/ai/generate-caption',
      idempotent: true,
      body: {
        command: input.command,
        tone: input.tone,
        channelType: input.channel_type,
        content: input.content,
      },
    });

    return { caption };
  },
});
