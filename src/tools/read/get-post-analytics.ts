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

    if (!post.metrics) {
      return {
        post_id: post.id,
        status: post.status,
        metrics: null,
        note: 'Analytics not yet available. Metrics are synced periodically after publish.',
      };
    }

    return {
      post_id: post.id,
      platform: post.channelType,
      published_at: post.publishedAt,
      external_url: post.externalUrl,
      metrics: mapMetrics(post.metrics),
    };
  },
});
