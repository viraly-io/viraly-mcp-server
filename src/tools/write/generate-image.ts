import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { type AttachmentUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

/** The generate-image endpoint returns a full AttachmentDto. */
interface AttachmentDtoUpstream extends AttachmentUpstream {
  id: string;
}

const inputSchema = z.object({
  prompt: z
    .string()
    .min(3)
    .max(2000)
    .describe('Description of the image to generate. The clearer the prompt, the better the result.'),
  aspect_ratio: z
    .enum(['square', 'portrait', 'landscape'])
    .default('square')
    .describe('Output orientation. Square (1:1), portrait (9:16), or landscape (16:9).'),
  quality: z
    .enum(['standard', 'hd'])
    .default('standard')
    .describe(
      'Output quality. "hd" requires the Business plan or higher and consumes more of the AI image quota.',
    ),
  use_brand_palette: z
    .boolean()
    .default(false)
    .describe(
      'When true, the workspace\'s brand color is appended to the prompt. Only effective on white-label workspaces.',
    ),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'generate_image',
  description:
    'Generate an image using AI (DALL-E) and save it to the workspace\'s media library. Returns an attachment id usable in schedule_post or create_draft. Plan-gated: Free users get an upgrade-required error; HD quality requires Business+.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('generate_image', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    const attachment = await client.call<AttachmentDtoUpstream>({
      method: 'POST',
      path: '/api/platforms/ai/generate-image',
      idempotent: true,
      body: {
        prompt: input.prompt,
        aspectRatio: input.aspect_ratio,
        quality: input.quality,
        useBrandPalette: input.use_brand_palette,
      },
    });

    // AttachmentDto nests file metadata under info and thumbnails — there are
    // no top-level url/width/etc fields on the wire.
    return {
      attachment_id: attachment.id,
      url: attachment.info?.url,
      thumbnail_url: attachment.thumbnails?.medium?.url ?? attachment.thumbnails?.small?.url,
      width: attachment.info?.width,
      height: attachment.info?.height,
      type: attachment.type,
    };
  },
});
