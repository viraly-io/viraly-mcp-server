import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface HashtagDtoUpstream {
  id: string;
  // HashtagDto carries the group name under `topic` and the hashtags as a
  // single space/whitespace-delimited string, NOT an array.
  topic?: string;
  hashtags?: string;
  socialSetId?: string;
  createdAt?: string;
}

const inputSchema = z.object({
  social_set_id: z
    .string()
    .optional()
    .describe('Optional. Restrict the result to hashtag groups belonging to this social set.'),
});

registerTool({
  name: 'list_hashtag_groups',
  description:
    'List the saved hashtag groups in the workspace. Each group has a name and a list of hashtags the user can append to posts. Use this to discover hashtag group ids before referencing them in schedule_post.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const groups = await client.call<HashtagDtoUpstream[]>({
      method: 'GET',
      path: '/api/platforms/hashtags',
      query: { socialSetId: input.social_set_id },
    });

    return {
      count: groups.length,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.topic,
        social_set_id: g.socialSetId,
        hashtags: g.hashtags ? g.hashtags.split(/\s+/).filter(Boolean) : [],
        created_at: g.createdAt,
      })),
    };
  },
});
