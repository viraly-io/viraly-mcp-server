import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface MediaCollectionUpstream {
  id: string;
  name: string;
  attachmentCount: number;
}

const inputSchema = z.object({
  social_set_id: z
    .string()
    .min(1)
    .describe('Required. The social set whose media collections (folders) to list.'),
});

registerTool({
  name: 'list_media_collections',
  description:
    'List the media collections (folders) in a social set. Use this to discover the ' +
    'collection_id that list_media requires when browsing existing media. Note: media added ' +
    'via upload_media is not placed in a collection — reference it by its returned id instead.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const collections = await client.call<MediaCollectionUpstream[]>({
      method: 'GET',
      path: '/api/platforms/media/collections',
      query: { socialSetId: input.social_set_id },
    });

    return {
      count: collections.length,
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        item_count: c.attachmentCount,
      })),
    };
  },
});
