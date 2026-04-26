import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

interface SocialSetUpstream {
  id: string;
  name: string;
  timezone?: string;
}

const inputSchema = z.object({
  social_set_id: z.string().min(1).describe('The social set id (use list_social_sets to discover).'),
  timezone: z
    .string()
    .min(1)
    .describe('IANA timezone identifier (e.g. "America/New_York"). Use list_timezones to validate.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'update_social_set_timezone',
  description:
    "Change a social set's default timezone. All posts scheduled to channels in this set will be interpreted in the new timezone going forward. Existing posts keep their original times.",
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'update_social_set_timezone',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const updated = await client.call<SocialSetUpstream>({
      method: 'PUT',
      path: `/api/platforms/social-sets/${encodeURIComponent(input.social_set_id)}/timezone`,
      idempotent: true,
      body: { timezone: input.timezone },
    });

    return {
      id: updated.id,
      name: updated.name,
      timezone: updated.timezone,
    };
  },
});
