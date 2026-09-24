import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { type MediaDtoUpstream, mapMedia } from '../read/_media-shape.js';
import { registerTool } from '../registry.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';
import { assertSafeMediaUrl, MediaUrlError } from './_url-guard.js';

const inputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe('Public HTTPS URL of the image or video to upload to the media library.'),
  social_set_id: z.string().min(1).describe('Social set the media belongs to.'),
  collection_id: z
    .string()
    .optional()
    .describe('Optional media collection (folder) to place the upload in.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'upload_media',
  description:
    'Download an image, video, or document from a public URL and store it in the workspace\'s media library. ' +
    'Returns { id, type, status, ... }: pass the id into schedule_post / create_draft / update_post ' +
    'via their `attachment_ids` (or `attachments` for per-item alt text). The server processes the file and this ' +
    'call waits up to about 30 seconds for it. The media is ready to attach once `status` is "Completed". ' +
    'If it returns with status "Processing", the file is still being measured; call get_media with the returned id ' +
    'to wait for it to finish. Pass `collection_id` to place the upload in a media collection (folder). ' +
    'Check get_media_requirements for per-platform size/format/duration limits before uploading. ' +
    'Rejects URLs pointing to private or reserved IP ranges.',
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

    // The upstream does NOT honor Idempotency-Key, so dedupeWrite is the only
    // protection against a retry re-downloading and re-uploading the media.
    const media = await dedupeWrite(idempotencyKey, () =>
      client.call<MediaDtoUpstream>({
        method: 'POST',
        path: '/api/platforms/media',
        query: { wait: true },
        idempotent: true,
        body: {
          url: safeUrl.toString(),
          socialSetId: input.social_set_id,
          mediaCollectionId: input.collection_id,
        },
      }),
    );

    return mapMedia(media);
  },
});
