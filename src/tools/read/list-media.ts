import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface AttachmentDtoUpstream {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  isFavorite?: boolean;
  createdAt?: string;
}

const inputSchema = z.object({
  social_set_id: z.string().min(1).describe('Required. The social set whose media library to read.'),
  collection_id: z.string().min(1).describe('Required. The media collection (folder) id.'),
  type: z
    .enum(['Photo', 'Video'])
    .optional()
    .describe('Optional. Filter by media type.'),
  search: z.string().optional().describe('Optional. Free-text filter on name/description.'),
  favorite: z
    .boolean()
    .optional()
    .describe('Optional. true returns only favorited items; false returns only non-favorited.'),
});

registerTool({
  name: 'list_media',
  description:
    'List items in a media library collection. Photos and videos are returned with their CDN url and metadata. Useful for finding existing media to attach to a new post via schedule_post.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const items = await client.call<AttachmentDtoUpstream[]>({
      method: 'GET',
      path: '/api/platforms/media',
      query: {
        socialSetId: input.social_set_id,
        collectionId: input.collection_id,
        type: input.type,
        search: input.search,
        favorite: input.favorite,
      },
    });

    return {
      count: items.length,
      items: items.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        url: m.url,
        thumbnail_url: m.thumbnailUrl,
        width: m.width,
        height: m.height,
        duration_seconds: m.durationSeconds,
        size_bytes: m.sizeBytes,
        is_favorite: m.isFavorite ?? false,
        created_at: m.createdAt,
      })),
    };
  },
});
