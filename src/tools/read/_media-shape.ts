/**
 * Shared MediaDto shape and mapping used by upload_media and get_media.
 *
 * The Viraly Platform API's media endpoints (POST /api/platforms/media,
 * GET /api/platforms/media/{id}) return a MediaDto with file metadata
 * nested under info and thumbnails, mirroring AttachmentUpstream in
 * _post-shape.ts.
 */

export interface MediaInfoUpstream {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  url?: string;
  pageCount?: number;
  hasAudio?: boolean;
  videoCodec?: string;
}

export interface MediaThumbnailUpstream {
  url?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface MediaThumbnailsUpstream {
  small?: MediaThumbnailUpstream | null;
  medium?: MediaThumbnailUpstream | null;
  large?: MediaThumbnailUpstream | null;
}

export interface MediaProgressUpstream {
  stage?: string;
  percent?: number;
}

export interface MediaErrorUpstream {
  code?: string;
  message?: string;
}

/** MediaDto as serialized by the Platform API. */
export interface MediaDtoUpstream {
  id: string;
  // "Uploading" | "Processing" | "Completed" | "Failed" | "Ready".
  status?: string;
  // "Photo" | "Video" | "Document".
  type?: string;
  progress?: MediaProgressUpstream | null;
  info?: MediaInfoUpstream | null;
  thumbnails?: MediaThumbnailsUpstream | null;
  error?: MediaErrorUpstream | null;
}

/** Trim a MediaDto down to what a model needs to reason about the upload. */
export function mapMedia(media: MediaDtoUpstream) {
  return {
    id: media.id,
    // "Photo" | "Video" | "Document".
    type: media.type,
    // "Completed" when ready to attach; anything else means still processing.
    status: media.status,
    ready: media.status === 'Completed',
    url: media.info?.url,
    thumbnail_url: media.thumbnails?.large?.url ?? media.thumbnails?.medium?.url,
    width: media.info?.width,
    height: media.info?.height,
    duration_seconds: media.info?.duration,
    size_bytes: media.info?.fileSize,
  };
}
