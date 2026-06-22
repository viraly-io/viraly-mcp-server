import { z } from 'zod';

// Platforms whose publishers actually apply per-attachment alt text. Threads,
// Bluesky, TikTok and YouTube ignore it (their publishers don't read AltText),
// so we don't promise it for them.
const ALT_TEXT_PLATFORMS = 'Facebook, Instagram, X/Twitter, LinkedIn, Pinterest and Mastodon';

/**
 * Rich attachment input that carries per-item accessibility alt text.
 * Optional; callers may instead pass the simpler `attachment_ids`.
 */
export const attachmentsInput = z
  .array(
    z.object({
      id: z
        .string()
        .min(1)
        .describe('Attachment id from list_media or upload_media.'),
      alt_text: z
        .string()
        .max(1000)
        .optional()
        .describe(
          `Accessibility alt text describing this image/video. Applied on ${ALT_TEXT_PLATFORMS}; ignored by platforms that do not support it.`,
        ),
    }),
  )
  .optional()
  .describe(
    'Optional. Media attachments with per-item alt text, in display order. ' +
      'Use this instead of attachment_ids when you want to set alt text. ' +
      'If both attachments and attachment_ids are provided, attachments takes precedence.',
  );

export const attachmentIdsInput = z
  .array(z.string().min(1))
  .optional()
  .describe(
    'Optional. IDs of media-library attachments to include, in display order ' +
      '(use list_media or upload_media to obtain). For per-item alt text, use `attachments` instead.',
  );

export interface AttachmentInput {
  attachment_ids?: string[];
  attachments?: { id: string; alt_text?: string }[];
}

export interface PostAttachmentPayload {
  attachmentId: string;
  order: number;
  altText?: string;
}

/**
 * Build the API `postAttachments` payload from either the rich `attachments`
 * input (with alt text) or the legacy `attachment_ids`. Returns `undefined`
 * when the caller supplied neither, so each tool can apply its own fallback
 * (e.g. an empty list for create, or the post's existing attachments for update).
 */
export function buildPostAttachments(
  input: AttachmentInput,
): PostAttachmentPayload[] | undefined {
  if (input.attachments) {
    return input.attachments.map((a, i) => ({
      attachmentId: a.id,
      order: i,
      altText: a.alt_text ?? undefined,
    }));
  }
  if (input.attachment_ids) {
    return input.attachment_ids.map((id, i) => ({ attachmentId: id, order: i }));
  }
  return undefined;
}
