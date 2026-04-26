import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';

interface WorkspaceDtoUpstream {
  id: string;
  name?: string;
  plan?: string;
  status?: string;
  createdAt?: string;
}

const inputSchema = z.object({});

registerTool({
  name: 'get_workspace_info',
  description:
    'Get information about the connected Viraly workspace — name, plan tier (Free / Influencer / Business / Agency / Enterprise), and account status. Use this when the user asks "which workspace am I connected to?" or "what plan am I on?".',
  inputSchema,
  handler: async () => {
    const client = getClient();
    const ws = await client.call<WorkspaceDtoUpstream>({
      method: 'GET',
      path: '/api/platforms/workspace',
    });

    return {
      id: ws.id,
      name: ws.name,
      plan: ws.plan,
      status: ws.status,
      created_at: ws.createdAt,
    };
  },
});
