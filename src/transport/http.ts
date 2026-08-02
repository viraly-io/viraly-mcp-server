import { timingSafeEqual } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
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
 *   GET  /mcp      : 405. See the note on the route below.
 *   DELETE /mcp    — session termination
 */
export function createHttpApp(config: ServerConfig, logger: Logger): Express {
  const app = express();

  app.use(normalizeRawHeaders);

  // ── Origin lock ────────────────────────────────────────────────────
  //
  // A Lambda Function URL is publicly reachable at its own
  // `*.lambda-url.*.on.aws` hostname, which bypasses the CDN entirely. That
  // matters because every edge-layer control lives there: the path allowlist
  // that keeps scanner traffic away from this function, and anything added
  // later. Authentication is unaffected either way (it is bearer validation
  // in this process and upstream), so this is not an auth boundary. It exists
  // so the edge controls cannot simply be stepped around by anyone who learns
  // the origin hostname.
  //
  // The CDN injects this header on every origin request. Note it is
  // deliberately NOT `Authorization`: that header belongs to the caller's MCP
  // token, which is exactly why Origin Access Control is unusable here.
  //
  // Unset means no check, which is correct for stdio, local dev, and
  // self-hosted deployments with no CDN in front.
  if (config.edgeToken) {
    const expectedEdgeToken = config.edgeToken;
    app.use((req, res, next) => {
      const presented = req.header(EDGE_TOKEN_HEADER) ?? '';
      if (timingSafeStringEquals(presented, expectedEdgeToken)) {
        next();
        return;
      }

      // This runs BEFORE pino-http, so a rejected request is cheap. The cost
      // of that ordering is that it would otherwise leave no trace whatsoever:
      // someone probing the origin hostname directly would surface only as
      // invocation count with no matching log lines, which is a blind spot in
      // exactly the control this middleware implements. So emit one
      // deliberate line, shaped by us rather than inheriting the whole
      // request log.
      //
      // The presented value is NEVER logged. Whether one was sent at all is
      // the useful signal (a wrong guess versus nothing), and logging guesses
      // would put attacker-controlled strings into the log.
      logger.warn(
        {
          event: 'edge_token_rejected',
          method: req.method,
          url: req.originalUrl,
          tokenPresented: presented.length > 0,
          userAgent: req.header('user-agent'),
          // Set by CloudFront, so its ABSENCE is the interesting part: it
          // means the request did not arrive through the CDN.
          viewerAddress: req.header('cloudfront-viewer-address'),
          // Client-supplied and therefore forgeable. A hint, not evidence.
          forwardedFor: req.header('x-forwarded-for'),
        },
        'Rejected request without a valid edge token',
      );

      // Deliberately indistinguishable from the catch-all: a prober learns
      // nothing about whether the path exists or why it was refused.
      res.status(404).json({ error: 'not_found' });
    });
  }

  app.use(
    pinoHttp({
      logger,
      // 401s are ~99% of inbound traffic (unauthenticated clients probing /mcp
      // and stuck auth-retry loops). They carry no diagnostic value, since the
      // response itself is the whole story, and at flood volume they dominate
      // CloudWatch ingestion cost. Everything else still logs normally.
      customLogLevel: (_req, res, err) => {
        if (err) return 'error';
        if (res.statusCode === 401) return 'silent';
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
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
  // Registered ONLY when MCP_METRICS_TOKEN is set, and then always gated by a
  // constant-time Bearer comparison.
  //
  // It used to register unconditionally and fall back to "open, rely on
  // network-layer protection (WAF / SG)". No deployment ever had that
  // protection: App Runner has no private networking, and behind CloudFront
  // the endpoint is reachable at https://<public-domain>/metrics. An
  // unset token therefore meant tool-call rates, auth-failure counts and full
  // process metrics were served to anyone who asked. Requiring the token to
  // exist before the route exists at all fails closed instead.
  //
  // Note the counters are per-process, so on Lambda a scrape reflects one
  // arbitrary execution environment. Leave the token unset there.
  if (config.metricsAuthToken) {
    const expectedMetricsAuth = `Bearer ${config.metricsAuthToken}`;
    app.get('/metrics', async (req, res) => {
      const header = req.header('authorization') ?? '';
      if (!timingSafeStringEquals(header, expectedMetricsAuth)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.set('Content-Type', metricsRegistry.contentType);
      res.send(await metricsRegistry.metrics());
    });
  }

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
  app.delete('/mcp', auth, handleMcpRequest);

  // GET /mcp is the Streamable HTTP "standalone SSE stream", used only for
  // SERVER-INITIATED messages. This server never sends any: no tool emits
  // notifications or progress, so every response is a direct reply to a POST.
  //
  // Routing GET to the transport would open a stream that never closes (it
  // does; verified: 200 text/event-stream, held open indefinitely). That is
  // fine on a long-lived container and fatal on Lambda, where it pins an
  // invocation until the platform kills it.
  //
  // Returning 405 is what the MCP spec prescribes for servers that do not
  // offer the stream, and clients handle it: the SDK only attempts the GET
  // after a 202 on notifications/initialized, then treats 405 as "no stream".
  app.get('/mcp', auth, (_req, res) => {
    res
      .status(405)
      .set('Allow', 'POST, DELETE')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method Not Allowed: this server does not offer an SSE stream' },
        id: null,
      });
  });

  // ── 404 fallback ───────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

/**
 * Header the CDN injects to prove a request came through it. Kept out of
 * `Authorization` on purpose: that header carries the caller's MCP token.
 */
const EDGE_TOKEN_HEADER = 'x-viraly-edge-token';

/**
 * Rebuild `req.rawHeaders` from `req.headers` when a driver did not supply it.
 *
 * The MCP SDK's Node transport is a thin wrapper that converts the Node request
 * into a web-standard `Request` using `@hono/node-server`, and that conversion
 * reads `incoming.rawHeaders`, the flat `[key, value, key, value]` array, NOT
 * `incoming.headers`.
 *
 * A real `http.Server` always populates both, so this is a no-op in the
 * container and stdio paths. Serverless adapters synthesize a request object
 * from an event payload and generally populate only `headers`, leaving
 * `rawHeaders` empty. The SDK then sees NO headers at all and rejects every
 * POST /mcp with 406 "Client must accept both application/json and
 * text/event-stream", no matter what the client actually sent.
 *
 * The failure is quiet and easy to misread: /health, the discovery document,
 * and the 401 challenge all keep working, because those read `req.headers`
 * through Express. Only the MCP endpoint itself breaks.
 */
function normalizeRawHeaders(req: Request, _res: Response, next: NextFunction): void {
  if (Array.isArray(req.rawHeaders) && req.rawHeaders.length > 0) {
    next();
    return;
  }

  const flat: string[] = [];
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) flat.push(key, item);
    } else if (value !== undefined) {
      flat.push(key, String(value));
    }
  }
  req.rawHeaders = flat;
  next();
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
