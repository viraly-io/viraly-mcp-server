import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

// Mirrors CategoryDto: { id, name, color, sortOrder, createdAt, updatedAt,
// postCount }. There are no description/icon fields on the wire.
interface CategoryDtoUpstream {
  id: string;
  name?: string;
  color?: string;
  sortOrder?: number;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

const inputSchema = z.object({});

registerTool({
  name: 'list_categories',
  description:
    'List the post categories (also called "content queues") configured in the workspace. Categories group posts thematically and can drive automatic scheduling. Use this to discover category ids before referencing them in schedule_post.',
  inputSchema,
  handler: async () => {
    const client = getClient();
    const categories = await client.call<CategoryDtoUpstream[]>({
      method: 'GET',
      path: '/api/platforms/categories',
    });

    return {
      count: categories.length,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        order: c.sortOrder,
        post_count: c.postCount,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      })),
    };
  },
});
