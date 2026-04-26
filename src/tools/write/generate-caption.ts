import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

/**
 * Viraly's caption generator splits intent two ways:
 *   - `Command` (enum) — what to do: write fresh, rephrase, shorten, etc.
 *   - `Content` (free text) — the topic for fresh writes, or the source text
 *     for rewrites.
 *
 * LLM callers naturally express both at once ("write a punchy LinkedIn post
 * about our launch"), so we expose `prompt` as the single free-text input and
 * pick the API command for them, defaulting to WriteNew. If the caller wants
 * to transform existing copy, they can pass `mode` explicitly.
 */
const COMMAND_BY_MODE = {
  write: 'WriteNew',
  rephrase: 'Rephrase',
  shorten: 'Shorten',
  expand: 'Expand',
  casual: 'Casual',
  formal: 'Formal',
} as const;

// API's ChannelType enum is PascalCase; ASP.NET Core's enum binder accepts
// the enum name verbatim so we normalize on the way out.
const CHANNEL_TYPE_BY_ALIAS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter',
  x: 'Twitter',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
};

const inputSchema = z.object({
  prompt: z
    .string()
    .min(3)
    .max(2000)
    .describe(
      'The topic or source text for the caption. For write mode, this is the topic/idea (e.g. "Our spring product launch"). For rephrase/shorten/expand/casual/formal modes, this is the existing caption to transform.',
    ),
  mode: z
    .enum(['write', 'rephrase', 'shorten', 'expand', 'casual', 'formal'])
    .default('write')
    .describe(
      'What the AI should do with the prompt. "write" generates a fresh caption from the topic. The others transform existing copy.',
    ),
  tone: z
    .enum(['neutral', 'friendly', 'professional', 'witty', 'enthusiastic', 'casual'])
    .default('neutral')
    .describe('Voice / tone for the caption.'),
  channel_type: z
    .string()
    .optional()
    .describe(
      'Optional. Platform name to optimize length and style. Accepts "facebook", "instagram", "twitter", "x", "linkedin", "pinterest", "tiktok", "youtube", "threads", "bluesky", "mastodon".',
    ),
  keywords: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional. Keywords to weave into the caption.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'generate_caption',
  description:
    'Generate or transform a social media caption using AI. Returns the caption text. Use mode="write" to generate from a topic, or one of the transform modes to rewrite an existing caption.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('generate_caption', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    const channelType = input.channel_type
      ? (CHANNEL_TYPE_BY_ALIAS[input.channel_type.toLowerCase()] ?? input.channel_type)
      : undefined;

    const caption = await client.call<string>({
      method: 'POST',
      path: '/api/platforms/ai/generate-caption',
      idempotent: true,
      body: {
        command: COMMAND_BY_MODE[input.mode],
        tone: input.tone,
        channelType,
        content: input.prompt,
        keywords: input.keywords,
      },
    });

    return { caption };
  },
});
