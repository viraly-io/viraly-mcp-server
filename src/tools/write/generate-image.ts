import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';
import { type AiImageJobUpstream, describeJob } from './_ai-image-job.js';

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
    'Start generating an image using AI and saving it to the workspace\'s media library. ' +
    'This returns in about a second with a job id, NOT with the image: generation itself takes ' +
    'roughly a minute. Poll get_image_job with the returned job id, waiting about 10 seconds ' +
    'between polls, until its status is "Succeeded" (the attachment id is on that response) or ' +
    '"Failed". Do not call this tool again while a job is still running; that starts a second ' +
    'generation and consumes more of the workspace quota. Plan-gated: Free users get an ' +
    'upgrade-required error; HD quality requires Business+. Both are reported here, immediately, ' +
    'rather than a minute later.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('generate_image', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    const job = await client.call<AiImageJobUpstream>({
      method: 'POST',
      path: '/api/platforms/ai/generate-image-async',
      idempotent: true,
      body: {
        prompt: input.prompt,
        aspectRatio: input.aspect_ratio,
        quality: input.quality,
        useBrandPalette: input.use_brand_palette,
      },
    });

    return {
      ...describeJob(job),
      next_step:
        `Generation has started and normally takes about a minute. Call get_image_job with ` +
        `job_id "${job.id}", waiting about 10 seconds between calls, until status is Succeeded ` +
        `or Failed. Do not call generate_image again for this image.`,
    };
  },
});
