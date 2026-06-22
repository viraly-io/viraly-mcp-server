/**
 * Shared post-shape helpers used by every post-related tool.
 *
 * The Viraly Platform API returns rich PostDto objects with platform-specific
 * config blobs, internal flags, and audit metadata that aren't useful to an
 * LLM. We trim to the fields a model actually needs to reason about a post.
 *
 * Interfaces here mirror the REAL wire shapes (PostDto, PostAttachmentDto,
 * AttachmentDto, PostMetricsDto in viraly-api/Viraly.Models/Dtos) serialized
 * with camelCase + JsonStringEnumConverter + WhenWritingNull:
 * - channel type lives at config.channelType, not top-level;
 * - attachment URLs live at attachment.info.url / attachment.thumbnails.*.url;
 * - metrics are nested per platform ({ facebook: {...}, instagram: {...} }),
 *   never flat.
 */

export interface AttachmentInfoUpstream {
  url?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
}

export interface AttachmentThumbnailsUpstream {
  small?: AttachmentInfoUpstream | null;
  medium?: AttachmentInfoUpstream | null;
  large?: AttachmentInfoUpstream | null;
}

/** AttachmentDto as serialized by the Platform API. */
export interface AttachmentUpstream {
  id?: string;
  type?: string;
  status?: string;
  description?: string | null;
  info?: AttachmentInfoUpstream | null;
  thumbnails?: AttachmentThumbnailsUpstream | null;
  favoriteAt?: string | null;
  createdAt?: string;
}

export interface PostAttachmentUpstream {
  id?: string;
  order?: number;
  altText?: string | null;
  attachment?: AttachmentUpstream;
}

export interface PostErrorUpstream {
  message?: string | null;
  description?: string | null;
  code?: string;
}

export interface PostConfigUpstream {
  channelType?: string;
}

export interface PostDtoUpstream {
  id: string;
  caption?: string;
  /** Raw transient PostStatus (Draft|PendingApproval|Scheduled|Processing*|
   *  Publishing*|Published|...). Use displayStatus for the user-facing,
   *  filterable vocabulary the tools document. */
  status?: string;
  /** PostDisplayStatus: Draft|PendingApproval|Scheduled|Published|Failed. */
  displayStatus?: string;
  channelId?: string;
  createdAt?: string;
  scheduledAt?: string | null;
  externalUrl?: string;
  /** Legacy field — older callers used .errorMessage; the API now ships PostError. */
  errorMessage?: string;
  error?: PostErrorUpstream | null;
  categoryIds?: string[];
  /** Legacy/internal field; never returned by /api/platforms/posts. Kept so existing
   *  consumers don't break, but mapPost reads postAttachments first. */
  attachmentIds?: string[];
  postAttachments?: PostAttachmentUpstream[];
  config?: PostConfigUpstream | null;
  metrics?: PostMetricsUpstream | null;
}

/** A single platform's metric block (e.g. InstagramPostMetrics). Field names
 *  vary per platform — likes/saved/reach on Instagram, reactionsTotal on
 *  Facebook, retweets/bookmarks on Twitter, etc. */
export type PlatformMetricsUpstream = Record<string, number | null | undefined>;

/** PostMetricsDto: updatedAt/hasData plus one nullable sub-object per platform. */
export interface PostMetricsUpstream {
  updatedAt?: string;
  hasData?: boolean;
  facebook?: PlatformMetricsUpstream | null;
  instagram?: PlatformMetricsUpstream | null;
  threads?: PlatformMetricsUpstream | null;
  linkedIn?: PlatformMetricsUpstream | null;
  twitter?: PlatformMetricsUpstream | null;
  pinterest?: PlatformMetricsUpstream | null;
  youTube?: PlatformMetricsUpstream | null;
  tikTok?: PlatformMetricsUpstream | null;
  bluesky?: PlatformMetricsUpstream | null;
  mastodon?: PlatformMetricsUpstream | null;
}

const PLATFORM_METRIC_KEYS = [
  'facebook',
  'instagram',
  'threads',
  'linkedIn',
  'twitter',
  'pinterest',
  'youTube',
  'tikTok',
  'bluesky',
  'mastodon',
] as const;

export function mapPost(post: PostDtoUpstream): Record<string, unknown> {
  const attachments = post.postAttachments ?? [];
  const attachmentIds = attachments
    .map((a) => a.attachment?.id)
    .filter((id): id is string => typeof id === 'string');

  // Surface a meaningful error string regardless of whether the API
  // serializes the rich PostError shape or just a top-level errorMessage.
  const errorMessage =
    post.errorMessage ??
    [post.error?.code, post.error?.message].filter(Boolean).join(': ') ??
    null;

  const platform = post.config?.channelType;

  // The tools document and filter on the DisplayStatus vocabulary
  // (Draft|PendingApproval|Scheduled|Published|Failed). Surface that, falling
  // back to the raw transient status only if displayStatus is absent.
  const status = post.displayStatus ?? post.status;

  return {
    id: post.id,
    caption: post.caption ?? '',
    status,
    channel_id: post.channelId,
    platform,
    scheduled_at: post.scheduledAt ?? null,
    // PostDto exposes no publish timestamp; for published posts the scheduled
    // time is the closest available value.
    published_at: status === 'Published' ? post.scheduledAt ?? null : null,
    external_url: post.externalUrl,
    error_message: errorMessage || null,
    category_ids: post.categoryIds ?? [],
    attachment_count: attachmentIds.length || (post.attachmentIds?.length ?? 0),
    attachments: attachments.map((a) => ({
      id: a.attachment?.id,
      url: a.attachment?.info?.url,
      thumbnail_url:
        a.attachment?.thumbnails?.medium?.url ?? a.attachment?.thumbnails?.small?.url,
      type: a.attachment?.type,
      alt_text: a.altText ?? null,
      order: a.order ?? 0,
    })),
    metrics:
      post.metrics && post.metrics.hasData !== false
        ? mapMetrics(post.metrics, platform)
        : null,
  };
}

/**
 * Flatten the platform-nested PostMetricsDto into one LLM-friendly object.
 *
 * Picks the sub-object matching `channelType` when provided (case-insensitive),
 * otherwise the first non-null platform block. Common engagement fields are
 * normalized across platforms (Instagram says "saved", Twitter "bookmarks",
 * Facebook "reactionsTotal", ...); the untouched per-platform fields are
 * passed through under `detail` (camelCase, as the API serializes them).
 * Returns null when no platform has data yet.
 */
export function mapMetrics(
  metrics: PostMetricsUpstream,
  channelType?: string,
): Record<string, unknown> | null {
  const wanted = channelType?.toLowerCase();
  let platformKey: (typeof PLATFORM_METRIC_KEYS)[number] | undefined;
  let data: PlatformMetricsUpstream | undefined;

  for (const key of PLATFORM_METRIC_KEYS) {
    const block = metrics[key];
    if (!block) continue;
    if (wanted && key.toLowerCase() === wanted) {
      platformKey = key;
      data = block;
      break;
    }
    if (!data) {
      platformKey = key;
      data = block;
    }
  }

  if (!platformKey || !data) return null;

  return {
    platform: platformKey,
    updated_at: metrics.updatedAt,
    likes: data.likes ?? data.reactionsTotal ?? data.favourites,
    comments: data.comments ?? data.replies,
    shares: data.shares ?? data.retweets ?? data.reposts ?? data.reblogs,
    reach: data.reach,
    impressions: data.impressions,
    saves: data.saves ?? data.saved ?? data.bookmarks,
    views: data.views ?? data.videoViews ?? data.videoViewsOrganic,
    detail: data,
  };
}
