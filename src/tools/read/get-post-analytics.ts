import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { mapMetrics, type PostDtoUpstream } from './_post-shape.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The post id whose analytics to retrieve.'),
});

registerTool({
  name: 'get_post_analytics',
  description:
    'Get engagement analytics (likes, comments, shares, reach, impressions) for a single published post. Returns null metrics if the post has not been published yet or analytics have not synced.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const post = await client.call<PostDtoUpstream>({
      method: 'GET',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}`,
    });

    // PostMetricsDto carries hasData — a freshly published post can have a
    // non-null metrics object with no platform data yet. Treat both the same.
    if (!post.metrics || post.metrics.hasData === false) {
      return {
        post_id: post.id,
        status: post.status,
        metrics: null,
        note: 'Analytics not yet available. Metrics are synced periodically after publish.',
      };
    }

    const platform = post.config?.channelType;

    return {
      post_id: post.id,
      platform,
      // PostDto exposes no publish timestamp; for published posts the
      // scheduled time is the closest available value.
      published_at: post.status === 'Published' ? post.scheduledAt ?? null : null,
      external_url: post.externalUrl,
      metrics: mapMetrics(post.metrics, platform),
    };
  },
});
