import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { type AttachmentUpstream } from './_post-shape.js';

/** The media endpoint returns full AttachmentDto items. */
interface AttachmentDtoUpstream extends AttachmentUpstream {
  id: string;
}

const inputSchema = z.object({
  social_set_id: z.string().min(1).describe('Required. The social set whose media library to read.'),
  collection_id: z
    .string()
    .min(1)
    .describe('Required. The media collection (folder) id — obtain it from list_media_collections.'),
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
      // AttachmentDto nests file metadata under info and thumbnails, and
      // signals favorites via favoriteAt — there are no top-level
      // url/name/isFavorite fields on the wire.
      items: items.map((m) => ({
        id: m.id,
        name: m.info?.fileName,
        // "Photo" | "Video" | "Document".
        type: m.type,
        // "Completed" when ready to attach to a post.
        status: m.status,
        url: m.info?.url,
        thumbnail_url: m.thumbnails?.medium?.url ?? m.thumbnails?.small?.url,
        width: m.info?.width,
        height: m.info?.height,
        duration_seconds: m.info?.duration,
        size_bytes: m.info?.fileSize,
        is_favorite: m.favoriteAt != null,
        created_at: m.createdAt,
      })),
    };
  },
});
