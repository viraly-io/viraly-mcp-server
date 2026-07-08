import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { type AttachmentUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';
import { assertSafeMediaUrl, MediaUrlError } from './_url-guard.js';

/** The from-url endpoint returns a full AttachmentDto. */
interface AttachmentDtoUpstream extends AttachmentUpstream {
  id: string;
}

// Note: the API's CreateAttachmentFromUrlViewModel only accepts
// Id/Url/Role/SocialSetId — there is no collection, name, or alt-text
// support on this endpoint. Earlier versions of this tool advertised
// collection_id/name/alt_text inputs that the API silently dropped;
// they were removed rather than lie to the model.
const inputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe('Public HTTPS URL of the image or video to upload to the media library.'),
  social_set_id: z.string().min(1).describe('Social set the media belongs to.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'upload_media',
  description:
    'Download an image or video from a public URL and store it in the workspace\'s media library. ' +
    'Returns the attachment { id, type, status, ... }: pass the id into schedule_post / create_draft / update_post ' +
    'via their `attachment_ids` (or `attachments` for per-item alt text). The media is ready to attach once ' +
    '`status` is "Completed" (from-url uploads process synchronously, so it normally returns Completed already). ' +
    'The upload is not assigned to a media collection (folder) — reference it by the returned id rather than via list_media. ' +
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
    const attachment = await dedupeWrite(idempotencyKey, () =>
      client.call<AttachmentDtoUpstream>({
        method: 'POST',
        path: '/api/platforms/attachments/from-url',
        idempotent: true,
        body: {
          url: safeUrl.toString(),
          socialSetId: input.social_set_id,
          // The API's CreateAttachmentFromUrlViewModel requires Role.
          // From an MCP/LLM perspective, the only sensible role is the
          // workspace media library — the other roles (PostAttachment,
          // VideoThumbnail, PostCommentAttachment) are internal SPA flows.
          role: 'MediaAttachment',
        },
      }),
    );

    // AttachmentDto nests file metadata under info and thumbnails — there are
    // no top-level url/width/etc fields on the wire.
    return {
      id: attachment.id,
      name: attachment.info?.fileName,
      // "Photo" | "Video" | "Document".
      type: attachment.type,
      // "Completed" when ready to attach; anything else means still processing.
      status: attachment.status,
      ready: attachment.status === 'Completed',
      url: attachment.info?.url,
      thumbnail_url: attachment.thumbnails?.medium?.url ?? attachment.thumbnails?.small?.url,
      width: attachment.info?.width,
      height: attachment.info?.height,
      duration_seconds: attachment.info?.duration,
      size_bytes: attachment.info?.fileSize,
    };
  },
});
