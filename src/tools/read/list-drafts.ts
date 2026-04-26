import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { mapPost, type PostDtoUpstream } from './_post-shape.js';

interface PaginatedPosts {
  items: PostDtoUpstream[];
  total: number;
  page: number;
  pageSize: number;
}

const inputSchema = z.object({
  channel_id: z.string().optional().describe('Optional. Filter by a specific channel id.'),
  social_set_id: z.string().optional().describe('Optional. Filter by social set id.'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
});

registerTool({
  name: 'list_drafts',
  description:
    'List draft posts (posts the user has saved but not yet scheduled or published). Sorted by most recently edited.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const result = await client.call<PaginatedPosts>({
      method: 'GET',
      path: '/api/platforms/posts/list',
      query: {
        status: 'Draft',
        channelId: input.channel_id,
        socialSetId: input.social_set_id,
        page: input.page,
        perPage: input.per_page,
        sort: 'CreatedAt',
        order: 'Desc',
      },
    });

    return {
      total: result.total,
      page: result.page,
      per_page: result.pageSize,
      drafts: result.items.map(mapPost),
    };
  },
});
