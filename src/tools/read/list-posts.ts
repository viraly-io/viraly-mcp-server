import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { mapPost, type PostDtoUpstream } from './_post-shape.js';

interface PaginatedPostsUpstream {
  items: PostDtoUpstream[];
  total: number;
  page: number;
  pageSize: number;
}

const inputSchema = z.object({
  social_set_id: z.string().optional().describe('Optional. Filter by social set.'),
  channel_id: z
    .string()
    .optional()
    .describe('Optional. Filter by channel; takes precedence over social_set_id.'),
  status: z
    .enum(['Draft', 'PendingApproval', 'Scheduled', 'Published', 'Failed'])
    .optional()
    .describe('Optional. Filter by post status.'),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Optional inclusive lower bound on the post creation date, YYYY-MM-DD.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Optional inclusive upper bound on the post creation date, YYYY-MM-DD.'),
  sort: z
    .enum(['CreatedAt', 'ScheduledAt', 'PublishedAt'])
    .default('CreatedAt')
    .describe('Field to sort by.'),
  order: z.enum(['Asc', 'Desc']).default('Desc'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
});

registerTool({
  name: 'list_posts',
  description:
    'Cross-status paginated list of posts with rich filtering (social set, channel, status, date range, sort). Prefer this over list_pending_posts/list_published_posts/list_drafts when the user wants a unified view or filters across statuses ("show me everything from last week", "list all failed posts on my Instagram channel").',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const result = await client.call<PaginatedPostsUpstream>({
      method: 'GET',
      path: '/api/platforms/posts/list',
      query: {
        socialSetId: input.social_set_id,
        channelId: input.channel_id,
        status: input.status,
        startDate: input.start_date,
        endDate: input.end_date,
        sort: input.sort,
        order: input.order,
        page: input.page,
        perPage: input.per_page,
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
