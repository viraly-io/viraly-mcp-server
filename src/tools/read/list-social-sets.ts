import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface SocialSetUpstream {
  id: string;
  name: string;
  code?: string;
  colorHex?: string;
  timezone?: string;
  createdAt?: string;
  channels?: { id: string; name: string; type: string }[];
}

const inputSchema = z.object({});

registerTool({
  name: 'list_social_sets',
  description:
    'List the social sets in the workspace. A social set is a named bucket of channels that share a posting calendar and timezone (e.g. one set per brand or client). Use this when the user has more than one brand and wants to scope other tools (list_channels, list_posts) to a specific set.',
  inputSchema,
  handler: async () => {
    const client = getClient();
    const sets = await client.call<SocialSetUpstream[]>({
      method: 'GET',
      path: '/api/platforms/social-sets',
    });

    return {
      count: sets.length,
      social_sets: sets.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        color_hex: s.colorHex,
        timezone: s.timezone,
        created_at: s.createdAt,
        channel_count: s.channels?.length ?? 0,
        channels:
          s.channels?.map((c) => ({ id: c.id, name: c.name, platform: c.type })) ?? [],
      })),
    };
  },
});
