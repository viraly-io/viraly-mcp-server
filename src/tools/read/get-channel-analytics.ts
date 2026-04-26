import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface ChannelStatsUpstream {
  channelId?: string;
  followers?: number;
  followersChange?: number;
  posts?: number;
  postsChange?: number;
  engagementRate?: number;
  engagementRateChange?: number;
  reach?: number;
  reachChange?: number;
  impressions?: number;
  impressionsChange?: number;
  lastSyncedAt?: string;
}

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id (use list_channels to find it).'),
});

registerTool({
  name: 'get_channel_analytics',
  description:
    'Get aggregate analytics for a single channel — followers, post count, engagement rate, reach, impressions, plus period-over-period change. Use this for "how is my Instagram doing?" or weekly status questions.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const stats = await client.call<ChannelStatsUpstream>({
      method: 'GET',
      path: `/api/platforms/channels/${encodeURIComponent(input.channel_id)}/stats`,
    });

    return {
      channel_id: input.channel_id,
      followers: stats.followers,
      followers_change: stats.followersChange,
      posts: stats.posts,
      posts_change: stats.postsChange,
      engagement_rate: stats.engagementRate,
      engagement_rate_change: stats.engagementRateChange,
      reach: stats.reach,
      reach_change: stats.reachChange,
      impressions: stats.impressions,
      impressions_change: stats.impressionsChange,
      last_synced_at: stats.lastSyncedAt,
    };
  },
});
