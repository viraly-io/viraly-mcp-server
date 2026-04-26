/**
 * Shared post-shape helpers used by every post-related tool.
 *
 * The Viraly Platform API returns rich PostDto objects with platform-specific
 * config blobs, internal flags, and audit metadata that aren't useful to an
 * LLM. We trim to the fields a model actually needs to reason about a post.
 */

export interface PostAttachmentUpstream {
  id?: string;
  order?: number;
  altText?: string | null;
  attachment?: {
    id?: string;
    url?: string;
    thumbnailUrl?: string;
    type?: string;
  };
}

export interface PostErrorUpstream {
  message?: string | null;
  description?: string | null;
  code?: string;
}

export interface PostDtoUpstream {
  id: string;
  caption?: string;
  status?: string;
  channelId?: string;
  channelType?: string;
  scheduledAt?: string | null;
  publishedAt?: string;
  externalUrl?: string;
  /** Legacy field — older callers used .errorMessage; the API now ships PostError. */
  errorMessage?: string;
  error?: PostErrorUpstream | null;
  /** Legacy/internal field; never returned by /api/platforms/posts. Kept so existing
   *  consumers don't break, but mapPost reads postAttachments first. */
  attachmentIds?: string[];
  postAttachments?: PostAttachmentUpstream[];
  config?: unknown;
  metrics?: PostMetricsUpstream | null;
}

export interface PostMetricsUpstream {
  likes?: number;
  comments?: number;
  shares?: number;
  reach?: number;
  impressions?: number;
  saves?: number;
  views?: number;
}

export function mapPost(post: PostDtoUpstream): Record<string, unknown> {
  // The Platform API returns post attachments under `postAttachments` (an
  // array of { attachment, order, altText }). The earlier shape that read
  // `attachmentIds` was speculative and matched no real response — so
  // every prior mapPost() reported attachment_count: 0 even when an image
  // was attached. Prefer the real field, fall back to the legacy one for
  // any caller that still serializes it.
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

  return {
    id: post.id,
    caption: post.caption ?? '',
    status: post.status,
    channel_id: post.channelId,
    platform: post.channelType,
    scheduled_at: post.scheduledAt ?? null,
    published_at: post.publishedAt,
    external_url: post.externalUrl,
    error_message: errorMessage || null,
    attachment_count: attachmentIds.length || (post.attachmentIds?.length ?? 0),
    attachments: attachments.map((a) => ({
      id: a.attachment?.id,
      url: a.attachment?.url,
      thumbnail_url: a.attachment?.thumbnailUrl,
      type: a.attachment?.type,
      alt_text: a.altText ?? null,
      order: a.order ?? 0,
    })),
    metrics: post.metrics ? mapMetrics(post.metrics) : null,
  };
}

export function mapMetrics(metrics: PostMetricsUpstream): Record<string, number | undefined> {
  return {
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    reach: metrics.reach,
    impressions: metrics.impressions,
    saves: metrics.saves,
    views: metrics.views,
  };
}
