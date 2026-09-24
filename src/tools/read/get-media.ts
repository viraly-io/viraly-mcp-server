import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { type MediaDtoUpstream, mapMedia } from './_media-shape.js';

const inputSchema = z.object({
  media_id: z.string().min(1).describe('The media id, e.g. from upload_media or list_media.'),
  wait: z
    .boolean()
    .optional()
    .describe(
      'Wait for processing to finish before returning (default true). The server holds the ' +
        'request until the file is Completed or Failed, or a fixed server-side window elapses.',
    ),
});

registerTool({
  name: 'get_media',
  description:
    'Read one piece of media by id and, by default, wait for it to finish processing. Use this after ' +
    'upload_media returned status "Processing" to find out whether the file finished measuring.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const wait = input.wait ?? true;
    const media = await client.call<MediaDtoUpstream>({
      method: 'GET',
      path: `/api/platforms/media/${encodeURIComponent(input.media_id)}`,
      query: wait ? { wait: true } : undefined,
    });

    return mapMedia(media);
  },
});
