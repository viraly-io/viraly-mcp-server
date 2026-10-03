import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { ViralyAmbiguousWriteError, ViralyTransientError } from '../../api/errors.js';
import { type AttachmentUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';
import { describeMediaFailure, type MediaUpstream } from './_media-outcome.js';
import { assertSafeMediaUrl, MediaUrlError } from './_url-guard.js';

/** The from-url endpoint returns a full AttachmentDto. */
interface AttachmentDtoUpstream extends AttachmentUpstream {
  id: string;
}

/**
 * The last moment, from the start of the call, at which another read of the row may begin. The server holds a
 * wait=true read for up to its 30 s window, so a read begun by then ends inside the 45 s upstream timeout and the
 * 55 s Lambda (the ordering in `_idempotency-store.ts`).
 */
const READ_START_LIMIT_MS = 15_000;

/** At most this many reads in one call: each is held by the server, so a few cover the budget. */
const MAX_READS = 5;

// Note: the API's CreateAttachmentFromUrlViewModel only accepts
// Id/Url/Role/SocialSetId; there is no collection, name, or alt-text
// support on this endpoint. Earlier versions of this tool advertised
// collection_id/name/alt_text inputs that the API silently dropped;
// they were removed rather than lie to the model.
const inputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe('Public HTTPS URL of the image or video to upload to the media library.'),
  social_set_id: z.string().min(1).describe('Social set the media belongs to.'),
  idempotency_key: z
    .string()
    .optional()
    .describe(
      'Optional. Calls with the same arguments are the same upload and answer the same media. ' +
        'Pass a new value only to upload the same url again as a new, separate upload.',
    ),
});

registerTool({
  name: 'upload_media',
  description:
    'Download an image or video from a public URL and store it in the workspace\'s media library. ' +
    'Returns the media { id, type, status, ready, failed, ... }. Attach it to a post (the `attachment_ids` or ' +
    '`attachments` of schedule_post / create_draft / update_post) only once `ready` is true, which means its status is ' +
    '"Completed". Viraly processes every file after the download: a photo is waited for here for a short window, a video ' +
    'or a document usually is not finished yet. While `ready` and `failed` are both false, call upload_media again with ' +
    'the same arguments: it answers this same upload and waits again, and never downloads or stores the file twice. ' +
    '`failed` true is final: tell the user, with `error`. ' +
    'The upload is not assigned to a media collection (folder); reference it by the returned id rather than via list_media. ' +
    'Check get_media_requirements for per-platform size/format/duration limits before uploading. ' +
    'Rejects URLs pointing to private or reserved IP ranges.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const started = Date.now();
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

    // The API honours Idempotency-Key on this route (media ingest package 13): a repeat of the key answers the row
    // the first call made, so a retry never makes a second file. dedupeWrite stays as the client-side guard against
    // concurrent identical calls; it covers the create only, and the row is read afresh below on every call.
    let created: AttachmentDtoUpstream;
    try {
      created = await dedupeWrite(idempotencyKey, () =>
        client.call<AttachmentDtoUpstream>({
          method: 'POST',
          path: '/api/platforms/attachments/from-url',
          idempotent: true,
          body: {
            url: safeUrl.toString(),
            socialSetId: input.social_set_id,
            // The API's CreateAttachmentFromUrlViewModel requires Role.
            // From an MCP/LLM perspective, the only sensible role is the
            // workspace media library; the other roles (PostAttachment,
            // VideoThumbnail, PostCommentAttachment) are internal SPA flows.
            role: 'MediaAttachment',
          },
        }),
      );
    } catch (err) {
      if (err instanceof ViralyAmbiguousWriteError) {
        throw new ViralyAmbiguousWriteError(
          'The upload got no answer in time; Viraly may have started it. Call upload_media again with the same ' +
            'arguments: the same key answers the same upload, so the file is never stored twice.',
        );
      }
      throw err;
    }

    // The outcome is the row's (media ingest flow, rule 8). The create answers the row in the API's internal shape,
    // which carries no reason when it is Failed; the media read does.
    const reader = getClient({});
    let row: MediaUpstream = { ...created, status: created.status ?? 'Uploading' };
    let fromRead = false;
    let reads = 0;
    while (row.status !== 'Completed' && !(row.status === 'Failed' && (fromRead || row.error))) {
      if (reads >= MAX_READS || Date.now() - started > READ_START_LIMIT_MS) break;
      reads++;
      try {
        row = await reader.call<MediaUpstream>({
          method: 'GET',
          path: `/api/platforms/media/${encodeURIComponent(row.id)}`,
          query: { wait: true },
        });
      } catch (err) {
        // A read that got no answer says nothing about the file: the model is told to call again.
        if (err instanceof ViralyTransientError) break;
        throw err;
      }
      fromRead = true;
    }

    const ready = row.status === 'Completed';
    const failed = row.status === 'Failed';
    const code = failed ? (row.error?.code ?? null) : undefined;

    return {
      id: row.id,
      name: row.info?.fileName,
      // "Photo" | "Video" | "Document".
      type: row.type,
      // "Completed" is the only usable status; "Failed" is final.
      status: row.status,
      ready,
      failed,
      error_code: code,
      error: failed ? describeMediaFailure(code) : undefined,
      url: row.info?.url,
      thumbnail_url: row.thumbnails?.medium?.url ?? row.thumbnails?.small?.url,
      width: row.info?.width,
      height: row.info?.height,
      duration_seconds: row.info?.duration,
      size_bytes: row.info?.fileSize,
      next_step: ready
        ? undefined
        : failed
          ? `This upload failed${code ? ` (${code})` : ''}: ${describeMediaFailure(code)} Failed is final: tell the user. ` +
            'Calling upload_media again with the same arguments returns this same failed upload; to try the url ' +
            'again as a new upload, pass a new idempotency_key.'
          : 'Viraly is still processing this file. Call upload_media again with the same arguments: it answers ' +
            'this same upload and waits again. Do not attach it until ready is true.',
    };
  },
});
