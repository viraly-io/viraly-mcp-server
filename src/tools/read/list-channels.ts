import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

const inputSchema = z.object({
  social_set_id: z
    .string()
    .optional()
    .describe('Optional. Restrict the result to channels belonging to this social set.'),
});

interface ChannelDto {
  id: string;
  name: string;
  type: string;
  socialSetId?: string;
  // ChannelDto.Status is a ChannelStatus enum serialized as a string
  // (Active | Expired | Disabled | Locked). There is no `isLocked` field.
  status?: string;
  pictureUrl?: string;
}

registerTool({
  name: 'list_channels',
  description:
    'List the social media accounts (channels) connected to the workspace. Returns one entry per connected profile (Instagram, Facebook page, X account, etc.). Use this when the user asks which accounts are connected, or to discover channel IDs to use in other tools.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const channels = await client.call<ChannelDto[]>({
      method: 'GET',
      path: '/api/platforms/channels',
      query: { socialSetId: input.social_set_id },
    });

    return {
      count: channels.length,
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.type,
        social_set_id: c.socialSetId,
        status: c.status,
        is_locked: c.status === 'Locked',
        picture_url: c.pictureUrl,
      })),
    };
  },
});
