import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { mapPost, type PostDtoUpstream } from './_post-shape.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The post id, e.g. "ab12cd34". Required.'),
});

registerTool({
  name: 'get_post',
  description:
    'Get full details for a single post — caption, attachments, channel, schedule, metrics. Use this when the user asks about a specific post or when another tool returned a post id worth inspecting.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const post = await client.call<PostDtoUpstream>({
      method: 'GET',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}`,
    });

    return mapPost(post);
  },
});
