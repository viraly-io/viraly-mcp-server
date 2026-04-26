import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface ChannelStatsUpstream {
  postsCount?: number;
}

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id (use list_channels to find it).'),
});

registerTool({
  name: 'get_channel_analytics',
  description:
    'Get high-level stats for a channel — currently exposes the number of posts Viraly has scheduled or published for that channel. For per-platform metrics like followers, reach, engagement, or impressions, use get_post_insights (per-post breakdown) or trigger_analytics_sync followed by get_post_analytics on individual posts.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const stats = await client.call<ChannelStatsUpstream>({
      method: 'GET',
      path: `/api/platforms/channels/${encodeURIComponent(input.channel_id)}/stats`,
    });

    return {
      channel_id: input.channel_id,
      posts_count: stats.postsCount ?? 0,
    };
  },
});
