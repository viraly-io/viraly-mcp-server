/**
 * Shared post-shape helpers used by every post-related tool.
 *
 * The Viraly Platform API returns rich PostDto objects with platform-specific
 * config blobs, internal flags, and audit metadata that aren't useful to an
 * LLM. We trim to the fields a model actually needs to reason about a post.
 */

export interface PostDtoUpstream {
  id: string;
  caption?: string;
  status?: string;
  channelId?: string;
  channelType?: string;
  scheduledAt?: string;
  publishedAt?: string;
  externalUrl?: string;
  errorMessage?: string;
  attachmentIds?: string[];
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
  return {
    id: post.id,
    caption: post.caption ?? '',
    status: post.status,
    channel_id: post.channelId,
    platform: post.channelType,
    scheduled_at: post.scheduledAt,
    published_at: post.publishedAt,
    external_url: post.externalUrl,
    error_message: post.errorMessage,
    attachment_count: post.attachmentIds?.length ?? 0,
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
