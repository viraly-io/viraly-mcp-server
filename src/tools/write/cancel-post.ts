import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

const inputSchema = z.object({
  post_id: z.string().min(1).describe('The id of the post to cancel/delete.'),
});

registerTool({
  name: 'cancel_post',
  description:
    'Cancel a scheduled post or delete a draft. Cannot delete a post that has already been published — use the platform\'s native UI for that. Returns confirmation on success.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const client = getClient();
    await client.call<unknown>({
      method: 'DELETE',
      path: `/api/platforms/posts/${encodeURIComponent(input.post_id)}`,
    });
    return { post_id: input.post_id, cancelled: true };
  },
});
