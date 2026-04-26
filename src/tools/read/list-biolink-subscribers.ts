import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface SubscriberUpstream {
  id: string;
  email: string;
  phone?: string | null;
  name?: string | null;
  createdAt?: string;
}

interface PaginatedSubscribersUpstream {
  items: SubscriberUpstream[];
  total: number;
  page: number;
  pageSize: number;
}

const inputSchema = z.object({
  biolink_id: z
    .string()
    .min(1)
    .describe('The bio-link page id (use list_biolinks to discover).'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
});

registerTool({
  name: 'list_biolink_subscribers',
  description:
    "List subscribers (email + phone leads) for a bio-link page. Sorted by signup date, newest first. Use this to answer \"who signed up to my newsletter today?\" or to feed an outbound automation. Requires the subscribers:read scope.",
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const result = await client.call<PaginatedSubscribersUpstream>({
      method: 'GET',
      path: `/api/platforms/biolinks/${encodeURIComponent(input.biolink_id)}/subscribers`,
      query: { page: input.page, pageSize: input.per_page },
    });

    return {
      total: result.total,
      page: result.page,
      per_page: result.pageSize,
      subscribers: result.items.map((s) => ({
        id: s.id,
        email: s.email,
        phone: s.phone ?? null,
        name: s.name ?? null,
        signed_up_at: s.createdAt,
      })),
    };
  },
});
