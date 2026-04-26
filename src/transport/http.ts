import { timingSafeEqual } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

import { type AuthenticatedRequest, bearerAuthMiddleware } from '../auth/middleware.js';
import { runWithTokenContext } from '../auth/token-context.js';
import type { ServerConfig } from '../config.js';
import { registry as metricsRegistry } from '../observability/metrics.js';
import { registerAllTools } from '../tools/registry.js';

/**
 * Streamable HTTP transport for hosted MCP clients (Claude.ai connectors,
 * ChatGPT, Cursor remote MCP).
 *
 * Endpoints:
 *   GET  /health   — liveness, no auth
 *   GET  /metrics  — Prometheus exposition. Auth is optional via
 *                    MCP_METRICS_TOKEN; when unset, gate at the network
 *                    layer (WAF / SG).
 *   GET  /.well-known/oauth-protected-resource — RFC 9728 metadata, no auth
 *   POST /mcp      — MCP JSON-RPC, requires Bearer vat_*
 *   GET  /mcp      — SSE event stream (sessionId in header)
 *   DELETE /mcp    — session termination
 */
export function createHttpApp(config: ServerConfig, logger: Logger): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '4mb' }));

  if (config.corsAllowedOrigins.length > 0) {
    app.use(
      cors({
        origin: config.corsAllowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id'],
        exposedHeaders: ['Mcp-Session-Id'],
      }),
    );
  }

  // ── Health & readiness ─────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'viraly-mcp-server' });
  });

  // ── Prometheus metrics ─────────────────────────────────────────────
  // If MCP_METRICS_TOKEN is set, require a matching Bearer token (constant-
  // time compared). Otherwise the endpoint is open and relies on network-
  // layer protection (WAF / SG). Metrics expose tool-call rates and auth-
  // failure counts — useful operationally, but worth gating in production
  // since App Runner has no built-in private networking.
  app.get('/metrics', async (req, res) => {
    if (config.metricsAuthToken) {
      const header = req.header('authorization') ?? '';
      const expected = `Bearer ${config.metricsAuthToken}`;
      if (!timingSafeStringEquals(header, expected)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
    }
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  });

  // ── RFC 9728 — OAuth Protected Resource Metadata ───────────────────
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: config.publicOrigin,
      authorization_servers: [config.oauthIssuer],
      scopes_supported: VIRALY_SCOPES,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://viraly.io/docs',
    });
  });

  // ── MCP endpoint ───────────────────────────────────────────────────
  // We use a per-request transport instance, which is the simplest pattern
  // for stateless deployments behind a load balancer. Streamable HTTP
  // handles its own session tracking via Mcp-Session-Id headers.
  const auth = bearerAuthMiddleware(config);

  const handleMcpRequest = (req: Request, res: Response): void => {
    const accessToken = (req as AuthenticatedRequest).accessToken;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — let MCP SDK manage
      enableJsonResponse: true,
    });

    const mcpServer = createMcpServer();

    // Plumb the request token through async-local-storage so tool handlers
    // can pick it up without explicit parameter passing.
    runWithTokenContext({ accessToken }, async () => {
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logger.error({ err }, 'MCP transport error');
        if (!res.headersSent) {
          res.status(500).json({ error: 'internal_error' });
        }
      }
    });
  };

  app.post('/mcp', auth, handleMcpRequest);
  app.get('/mcp', auth, handleMcpRequest);
  app.delete('/mcp', auth, handleMcpRequest);

  // ── 404 fallback ───────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

/**
 * Create a fresh MCP server instance per request. Tools are registered
 * from the global registry; the registry is populated at module load.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'viraly',
    version: '0.1.0',
  });
  registerAllTools(server);
  return server;
}

/**
 * Constant-time string equality. Returns false for length mismatches without
 * leaking the difference via timing.
 */
function timingSafeStringEquals(a: string, b: string): boolean {
  // Pad the shorter string so the lengths match — the timingSafeEqual call
  // itself doesn't tolerate length mismatches but we still want a constant-
  // time comparison even when an attacker probes with shorter strings.
  const maxLen = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(maxLen);
  const bBuf = Buffer.alloc(maxLen);
  aBuf.write(a);
  bBuf.write(b);
  return timingSafeEqual(aBuf, bBuf) && a.length === b.length;
}

/**
 * Scopes the resource is willing to accept. Mirrors
 * Viraly.Infrastructure.Constants.ApiPermissions.All on the .NET side. Keep
 * in sync; the discrepancy gets caught by Phase 8's audit.
 */
const VIRALY_SCOPES = [
  'posts:read',
  'posts:write',
  'channels:read',
  'channels:write',
  'analytics:read',
  'biolinks:read',
  'biolinks:write',
  'media:read',
  'media:write',
  'social_sets:read',
  'social_sets:write',
  'categories:read',
  'categories:write',
  'hashtags:read',
  'hashtags:write',
  'ideas:read',
  'ideas:write',
  'feeds:read',
  'feeds:write',
  'url_shortener:read',
  'url_shortener:write',
  'subscribers:read',
  'workspace:read',
];
