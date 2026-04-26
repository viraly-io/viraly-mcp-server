import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { mapPost, type PostDtoUpstream } from '../read/_post-shape.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id the draft is for.'),
  caption: z.string().min(1).max(10_000).describe('The draft text.'),
  attachment_ids: z.array(z.string().min(1)).optional(),
  category_id: z.string().optional(),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'create_draft',
  description:
    'Save a draft post (no publish, no schedule). Useful when the user wants to compose now and finalize later. The draft appears in list_drafts.',
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey('create_draft', input, input.idempotency_key);
    const client = getClient({ idempotencyKey });
    const post = await client.call<PostDtoUpstream>({
      method: 'POST',
      path: '/api/platforms/posts',
      idempotent: true,
      body: {
        channelId: input.channel_id,
        caption: input.caption,
        timezone: input.timezone,
        scheduleAction: 'SaveDraft',
        categoryId: input.category_id,
        postAttachments:
          input.attachment_ids?.map((id, i) => ({ attachmentId: id, order: i })) ?? [],
      },
    });

    return mapPost(post);
  },
});
