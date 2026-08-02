import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { setConfig } from '../src/api/client-factory.js';
import type { ServerConfig } from '../src/config.js';
import { createHttpApp } from '../src/transport/http.js';
import { pino } from 'pino';

const baseConfig: ServerConfig = {
  transport: 'http',
  port: 8080,
  publicOrigin: 'https://mcp.test.viraly.io',
  viralyApiOrigin: 'https://api.test.viraly.io',
  oauthIssuer: 'https://api.test.viraly.io',
  corsAllowedOrigins: [],
  logLevel: 'silent',
  metricsAuthToken: undefined,
};

const silentLogger = pino({ level: 'silent' });

beforeEach(() => {
  setConfig(baseConfig);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callMetrics(
  app: ReturnType<typeof createHttpApp>,
  authHeader?: string,
): Promise<{ status: number; body: string }> {
  // Use Express's listen to start a one-shot server, then fetch from it.
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('No port'));
        return;
      }
      const port = addr.port;
      const headers: Record<string, string> = {};
      if (authHeader) headers.Authorization = authHeader;
      fetch(`http://127.0.0.1:${port}/metrics`, { headers })
        .then(async (res) => {
          const body = await res.text();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('/metrics auth', () => {
  it('is not served at all when MCP_METRICS_TOKEN is unset', async () => {
    // Fails closed. The route used to register unconditionally and serve
    // openly without a token, on the theory that a WAF or security group would
    // gate it. No deployment ever did: App Runner has no private networking,
    // and behind CloudFront it is reachable at https://<public-domain>/metrics.
    // An unset token now means no route, so process metrics, tool-call rates
    // and auth-failure counts cannot leak by omission.
    const app = createHttpApp({ ...baseConfig, metricsAuthToken: undefined }, silentLogger);
    const r = await callMetrics(app);
    expect(r.status).toBe(404);
    expect(r.body).not.toContain('mcp_tool_calls_total');
  });

  it('requires Bearer token when MCP_METRICS_TOKEN is set', async () => {
    const app = createHttpApp({ ...baseConfig, metricsAuthToken: 'sekret' }, silentLogger);

    const noAuth = await callMetrics(app);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await callMetrics(app, 'Bearer wrong');
    expect(wrongAuth.status).toBe(401);

    const goodAuth = await callMetrics(app, 'Bearer sekret');
    expect(goodAuth.status).toBe(200);
    expect(goodAuth.body).toContain('mcp_tool_calls_total');
  });

  it('rejects auth header without Bearer prefix', async () => {
    const app = createHttpApp({ ...baseConfig, metricsAuthToken: 'sekret' }, silentLogger);
    const r = await callMetrics(app, 'sekret');
    expect(r.status).toBe(401);
  });
});
