import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface TimezoneUpstream {
  id?: string;
  displayName?: string;
  baseUtcOffset?: string;
  // .NET TimeZoneInfo serialization includes more fields, but Id +
  // DisplayName are the only ones a caller needs to pick a timezone.
}

const inputSchema = z.object({});

registerTool({
  name: 'list_timezones',
  description:
    'List the IANA timezone identifiers Viraly accepts for scheduling. Useful when the user mentions a city or region and you need to resolve it to a valid Timezone string (e.g. "America/New_York") for schedule_post or update_social_set_timezone. Cache the result — it rarely changes.',
  inputSchema,
  handler: async () => {
    const client = getClient();
    const zones = await client.call<TimezoneUpstream[]>({
      method: 'GET',
      path: '/api/platforms/timezones',
    });

    return {
      count: zones.length,
      timezones: zones.map((z) => ({
        id: z.id,
        display_name: z.displayName,
        base_utc_offset: z.baseUtcOffset,
      })),
    };
  },
});
