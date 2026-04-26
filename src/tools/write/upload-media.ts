import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';
import { assertSafeMediaUrl, MediaUrlError } from './_url-guard.js';

interface AttachmentDtoUpstream {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

const inputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe('Public HTTPS URL of the image or video to upload to the media library.'),
  social_set_id: z.string().min(1).describe('Social set the media belongs to.'),
  collection_id: z
    .string()
    .optional()
    .describe('Optional. Media collection (folder) id; defaults to the workspace default.'),
  name: z
    .string()
    .max(255)
    .optional()
    .describe('Optional friendly name; defaults to the URL filename.'),
  alt_text: z.string().max(1024).optional().describe('Accessibility text for screen readers.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'upload_media',
  description:
    'Download an image or video from a public URL and store it in the workspace\'s media library, returning an attachment id you can pass to schedule_post or create_draft. Rejects URLs pointing to private or reserved IP ranges.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    let safeUrl: URL;
    try {
      safeUrl = assertSafeMediaUrl(input.url);
    } catch (err) {
      if (err instanceof MediaUrlError) {
        throw new Error(`Refusing to fetch URL: ${err.message}`);
      }
      throw err;
    }

    const idempotencyKey = deriveIdempotencyKey('upload_media', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });

    const attachment = await client.call<AttachmentDtoUpstream>({
      method: 'POST',
      path: '/api/platforms/attachments/from-url',
      idempotent: true,
      body: {
        url: safeUrl.toString(),
        socialSetId: input.social_set_id,
        collectionId: input.collection_id,
        name: input.name,
        altText: input.alt_text,
      },
    });

    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      url: attachment.url,
      thumbnail_url: attachment.thumbnailUrl,
      width: attachment.width,
      height: attachment.height,
      duration_seconds: attachment.durationSeconds,
      size_bytes: attachment.sizeBytes,
    };
  },
});
