import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapMetrics, type PostMetricsUpstream } from './_post-shape.js';
import { registerTool } from '../registry.js';

interface PostInsightUpstream {
  id: string;
  title?: string | null;
  scheduledAt?: string | null;
  thumbnailUrl?: string | null;
  attachmentCount?: number;
  attachmentType?: string | null;
  metrics?: PostMetricsUpstream | null;
}

interface PaginatedInsightsUpstream {
  items: PostInsightUpstream[];
  total: number;
  page: number;
  pageSize: number;
}

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id to pull insights for.'),
  platform: z
    .enum([
      'facebook',
      'instagram',
      'twitter',
      'linkedin',
      'pinterest',
      'tiktok',
      'youtube',
      'threads',
      'bluesky',
      'mastodon',
    ])
    .describe('Platform of the channel — controls which metrics columns are returned.'),
  published_after: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Inclusive lower bound for publish date (YYYY-MM-DD).'),
  sort_by: z
    .string()
    .default('scheduledAt')
    .describe('Metric to sort by, e.g. "likes", "comments", "reach", "impressions".'),
  sort_direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

registerTool({
  name: 'get_post_insights',
  description:
    'Per-post analytics for a channel\'s recently published posts, sortable by metric. Use this to answer "what were my top-performing Instagram posts last month by reach?" or to power leaderboards. Different from get_post_analytics (single post) and get_channel_analytics (aggregate channel).',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const result = await client.call<PaginatedInsightsUpstream>({
      method: 'GET',
      path: '/api/platforms/posts/insights',
      query: {
        channelId: input.channel_id,
        platform: input.platform,
        publishedAfter: input.published_after,
        sortBy: input.sort_by,
        sortDirection: input.sort_direction,
        page: input.page,
        pageSize: input.page_size,
      },
    });

    return {
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      posts: result.items.map((p) => ({
        id: p.id,
        title: p.title ?? null,
        scheduled_at: p.scheduledAt ?? null,
        thumbnail_url: p.thumbnailUrl ?? null,
        attachment_count: p.attachmentCount ?? 0,
        attachment_type: p.attachmentType ?? null,
        metrics: p.metrics ? mapMetrics(p.metrics, input.platform) : null,
      })),
    };
  },
});
