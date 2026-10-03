/**
 * The outcome of one piece of media, as the media tools report it (media ingest flow, rule 8): only a row that reads
 * "Completed" is usable, "Failed" is final, and anything else is still in flight.
 *
 * A failure is reported by its code and a plain description of the code. The row's own message is the media
 * processor's and can hold internal detail (a storage url with its signature), so it is never passed to the model.
 * The words are the WordPress plugin's (`src/media/row-status.ts` in viraly-plugin-wp); keep the two alike.
 */

import { type AttachmentUpstream } from '../read/_post-shape.js';

/** The media read (GET /api/platforms/media/{id}): the row, with the reason when it Failed. */
export interface MediaUpstream extends AttachmentUpstream {
  id: string;
  status: string;
  error?: { code?: string | null; message?: string | null } | null;
}

/** The codes a media row ends Failed with (viraly-api MediaErrorDto and MediaFailureCodes). */
export const MEDIA_FAILURE_CODES = new Set([
  'unsupported_type',
  'file_too_large',
  'image_too_large',
  'corrupt_media',
  'conversion_failed',
  'source_unreachable',
  'source_forbidden',
  'source_missing',
  'download_failed',
  'write_failed',
  'upload_abandoned',
  'deadline_check_failed',
  'command_not_sent',
  'process_key_unanswered',
  'processing_timeout',
  'processing_crash',
]);

/** A plain description of a failure code. */
export function describeMediaFailure(code?: string | null): string {
  switch (code) {
    case 'unsupported_type':
      return 'This file type is not supported.';
    case 'file_too_large':
      return 'This file is too large.';
    case 'image_too_large':
      return 'This image has too many pixels.';
    case 'corrupt_media':
      return 'This file could not be read; it may be damaged.';
    case 'conversion_failed':
      return 'This image could not be converted.';
    case 'source_unreachable':
    case 'source_forbidden':
    case 'source_missing':
    case 'download_failed':
      return 'The file could not be fetched from its source.';
    case 'upload_abandoned':
      return 'The file never finished uploading.';
    default:
      return 'Viraly could not process this file.';
  }
}
