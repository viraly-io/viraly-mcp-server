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
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Optional inclusive lower bound for publish date, format YYYY-MM-DD.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Optional inclusive upper bound for publish date, format YYYY-MM-DD.'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
});

registerTool({
  name: 'list_published_posts',
  description:
    'List posts that have already been published. Sorted by publish date, most recent first. Each post includes engagement metrics if available. Use this for "what did I post recently?", "show me last week\'s posts", or analytics summaries.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const result = await client.call<PaginatedPosts>({
      method: 'GET',
      path: '/api/platforms/posts/list',
      query: {
        status: 'Published',
        channelId: input.channel_id,
        socialSetId: input.social_set_id,
        startDate: input.start_date,
        endDate: input.end_date,
        page: input.page,
        perPage: input.per_page,
        sort: 'PublishedAt',
        order: 'Desc',
      },
    });

    return {
      total: result.total,
      page: result.page,
      per_page: result.pageSize,
      posts: result.items.map(mapPost),
    };
  },
});
