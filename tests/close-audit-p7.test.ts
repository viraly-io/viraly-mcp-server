import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setConfig } from '../src/api/client-factory.js';
import { ViralyAuthError } from '../src/api/errors.js';
import { ViralyClient } from '../src/api/viraly-client.js';
import { runWithTokenContext, type TokenContext } from '../src/auth/token-context.js';
import type { ServerConfig } from '../src/config.js';
import { toolCallCounter } from '../src/observability/metrics.js';
import { metricToolLabel, registerAllTools, type RegistryTool } from '../src/tools/registry.js';
import { createHttpApp } from '../src/transport/http.js';

/** Permissions close audit, P7, 2026-11-24: MCP-10 (hints), MCP-13 (scopes), MCP-18 (401 and metric labels). */

const config: ServerConfig = {
  transport: 'http',
  port: 8080,
  publicOrigin: 'https://mcp.test.viraly.io',
  viralyApiOrigin: 'https://api.test.viraly.io',
  oauthIssuer: 'https://api.test.viraly.io',
  corsAllowedOrigins: [],
  logLevel: 'silent',
  metricsAuthToken: undefined,
};

const registry: RegistryTool[] = [
  {
    name: 'list_posts',
    description: 'Posts of a social set.',
    module: 'posts',
    scope: 'posts:read',
    risk: 'Read',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'publish_now',
    description: 'Publishes a post right now.',
    module: 'posts',
    scope: 'posts:write',
    risk: 'AlwaysAsk',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
];

function stubApi(answer: (options: { method: string; path: string }) => unknown) {
  vi.spyOn(ViralyClient.prototype, 'call').mockImplementation(async (options) => answer(options) as never);
}

async function connect() {
  const server = new McpServer({ name: 'viraly-test', version: '0.0.0' });
  registerAllTools(server);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

async function post(body: unknown): Promise<{ status: number; challenge: string | null; text: string }> {
  const app = createHttpApp(config, pino({ level: 'silent' }));
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('No port'));
        return;
      }
      fetch(`http://127.0.0.1:${addr.port}/mcp`, {
        method: 'POST',
        headers: { Authorization: 'Bearer vat_revoked', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          const text = await res.text();
          server.close();
          resolve({ status: res.status, challenge: res.headers.get('www-authenticate'), text });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('close audit P7 (MCP-10, MCP-13, MCP-18)', () => {
  beforeEach(() => setConfig(config));
  afterEach(() => vi.restoreAllMocks());

  it('passes the API openWorldHint on instead of false for every tool (MCP-10)', async () => {
    stubApi(() => ({ tools: registry }));
    await runWithTokenContext({ accessToken: 'vat_test' }, async () => {
      const listed = await (await connect()).listTools();
      const hint = (name: string) => listed.tools.find((t) => t.name === name)!.annotations?.openWorldHint;
      expect(hint('publish_now')).toBe(true);
      expect(hint('list_posts')).toBe(false);
    });
  });

  it('labels metrics only with tool names the API listed (MCP-18)', async () => {
    expect(metricToolLabel('made_up_tool_name_from_a_client')).toBe('unlisted');
    stubApi(() => ({ tools: registry }));
    await runWithTokenContext({ accessToken: 'vat_test' }, async () => {
      await (await connect()).listTools();
    });
    expect(metricToolLabel('list_posts')).toBe('list_posts');
    expect(metricToolLabel('made_up_tool_name_from_a_client')).toBe('unlisted');
  });

  it('counts a call to a name the API never listed under "unlisted", through the real handler (MCP-18)', async () => {
    stubApi((options) => (options.method === 'GET' ? { tools: registry } : { data: {}, summary: 'ok', externalContent: false }));
    const raw = 'client_sent_name_9f2c41';
    await runWithTokenContext({ accessToken: 'vat_test' }, async () => {
      await (await connect()).callTool({ name: raw, arguments: {} });
    });

    const labels = (await toolCallCounter.get()).values.map((v) => String(v.labels.tool));
    expect(labels).toContain('unlisted');
    expect(labels).not.toContain(raw);
  });

  it('marks the request when the API refuses the token during a call (MCP-18)', async () => {
    stubApi((options) => {
      if (options.method === 'GET') return { tools: registry };
      throw new ViralyAuthError('Access token rejected by Viraly API', {});
    });
    const context: TokenContext = { accessToken: 'vat_revoked' };
    await runWithTokenContext(context, async () => {
      const result = await (await connect()).callTool({ name: 'publish_now', arguments: {} });
      expect(result.isError).toBe(true);
    });
    expect(context.authRejected).toBe(true);
  });

  it('answers 401 with the challenge when the API refused the token, so the host signs in again (MCP-18)', async () => {
    stubApi(() => {
      throw new ViralyAuthError('Access token rejected by Viraly API', {});
    });

    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'publish_now', arguments: {} } });

    expect(res.status).toBe(401);
    expect(res.challenge).toContain('resource_metadata="https://mcp.test.viraly.io/.well-known/oauth-protected-resource"');
    expect(res.challenge).toContain('error="invalid_token"');
  });

  it('answers 401 when listing the tools with a refused token, as hosts list first on reconnect (MCP-18)', async () => {
    stubApi(() => {
      throw new ViralyAuthError('Access token rejected by Viraly API', {});
    });

    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.challenge).toContain('error="invalid_token"');
  });

  it('answers 200 for a tool error that is not about the token', async () => {
    stubApi(() => {
      throw new Error('boom');
    });

    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'publish_now', arguments: {} } });

    expect(res.status).toBe(200);
  });

  it('advertises the API scopes, posts:publish, subscribers:export and the comment rules scopes included (MCP-13)', async () => {
    const app = createHttpApp(config, pino({ level: 'silent' }));
    const scopes: string[] = await new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') return reject(new Error('No port'));
        fetch(`http://127.0.0.1:${addr.port}/.well-known/oauth-protected-resource`)
          .then(async (r) => {
            const json = (await r.json()) as { scopes_supported: string[] };
            server.close();
            resolve(json.scopes_supported);
          })
          .catch((e) => {
            server.close();
            reject(e);
          });
      });
    });
    expect(scopes).toHaveLength(27);
    expect(scopes).toEqual(expect.arrayContaining(['posts:publish', 'subscribers:export', 'comment_rules:read', 'comment_rules:write']));
  });
});
