import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface PinterestBoardUpstream {
  id: string;
  name: string;
  privacy: string;
  pinCount: number;
}

const inputSchema = z.object({
  channel_id: z
    .string()
    .min(1)
    .describe('Required. The Pinterest channel whose boards to list (see list_channels).'),
});

registerTool({
  name: 'list_pinterest_boards',
  description:
    'List the Pinterest boards of a Pinterest channel. Use this to discover the board_id that ' +
    'schedule_post/create_draft require when posting to Pinterest. Returns an error for ' +
    'non-Pinterest channels.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const boards = await client.call<PinterestBoardUpstream[]>({
      method: 'GET',
      path: `/api/platforms/channels/${encodeURIComponent(input.channel_id)}/boards`,
    });

    return {
      count: boards.length,
      boards: boards.map((b) => ({
        id: b.id,
        name: b.name,
        privacy: b.privacy,
        pin_count: b.pinCount,
      })),
    };
  },
});
