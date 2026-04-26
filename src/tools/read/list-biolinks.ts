import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface BioLinkUpstream {
  id: string;
  title: string;
  slug: string;
  socialSetId?: string;
  domain?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const inputSchema = z.object({
  social_set_id: z
    .string()
    .optional()
    .describe('Optional. Restrict the result to bio-link pages owned by this social set.'),
});

registerTool({
  name: 'list_biolinks',
  description:
    'List the bio-link (link-in-bio) pages owned by the workspace. Returns id + slug + custom domain so callers can identify a page before pulling its subscribers via list_biolink_subscribers.',
  inputSchema,
  handler: async (input) => {
    const client = getClient();
    const pages = await client.call<BioLinkUpstream[]>({
      method: 'GET',
      path: '/api/platforms/biolinks',
      query: { socialSetId: input.social_set_id },
    });

    return {
      count: pages.length,
      biolinks: pages.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        social_set_id: p.socialSetId,
        custom_domain: p.domain ?? null,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
    };
  },
});
