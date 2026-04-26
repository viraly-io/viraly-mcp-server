import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  channel_id: z.string().min(1).describe('The channel id to disconnect.'),
  confirm: z
    .literal(true)
    .describe(
      "Must be true. Confirms the caller intends to disconnect this channel. Disconnecting cancels all pending posts on it and is not reversible — the user will need to reconnect via the SPA's Channels screen to schedule again.",
    ),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'disconnect_channel',
  description:
    "Permanently disconnect (delete) a channel from the workspace. Destructive: cancels all pending posts on this channel and removes it. The caller MUST set confirm=true to proceed — this prevents an LLM from removing a channel by accident. Reconnecting requires the user to re-authorize the platform via the Viraly SPA.",
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    if (!input.confirm) {
      throw new Error(
        'disconnect_channel requires confirm=true to proceed. This is destructive and cannot be undone via the API.',
      );
    }

    const idempotencyKey = deriveIdempotencyKey(
      'disconnect_channel',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    await client.call<unknown>({
      method: 'DELETE',
      path: `/api/platforms/channels/${encodeURIComponent(input.channel_id)}`,
      idempotent: true,
    });

    return {
      channel_id: input.channel_id,
      disconnected: true,
    };
  },
});
