import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

interface SyncResponse {
  syncStartedAt?: string;
}

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id to sync analytics for.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'trigger_analytics_sync',
  description:
    "Queue an analytics-sync job for a channel so Viraly pulls the latest metrics from the platform's API. Returns when the job is enqueued — actual sync runs in the background and may take a minute. Useful before calling get_post_insights or get_post_analytics if metrics look stale.",
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'trigger_analytics_sync',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const result = await client.call<SyncResponse>({
      method: 'POST',
      path: `/api/platforms/analytics/${encodeURIComponent(input.channel_id)}/sync`,
      idempotent: true,
    });

    return {
      channel_id: input.channel_id,
      sync_started_at: result.syncStartedAt,
    };
  },
});
