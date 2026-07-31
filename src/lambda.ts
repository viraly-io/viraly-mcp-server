/**
 * AWS Lambda entry point.
 *
 * Wraps the same Express app the container build serves (`createHttpApp`), so
 * there is exactly one implementation of the routes, auth, and tool registry.
 * The only difference is what drives it: a listening socket in `server.ts`, a
 * Lambda Function URL event here.
 *
 * WHY THIS WORKS ON LAMBDA
 * ------------------------
 * The MCP Streamable HTTP transport runs in stateless mode
 * (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), so every POST
 * is a self-contained request/response with a JSON body, no session store and no
 * long-lived stream. `GET /mcp` is answered with 405 (see the route comment in
 * transport/http.ts); routing it to the transport would open an SSE stream that
 * never closes, which a Lambda invocation cannot survive.
 *
 * COLD START
 * ----------
 * Config, logger, app, and the 35-tool registry are all built at module scope,
 * so they are paid once per execution environment and reused by every
 * subsequent invocation. `loadConfig()` throws on missing/invalid env vars;
 * throwing here fails Lambda INIT with the real message in the logs, which is
 * the fail-fast behaviour we want rather than a per-request surprise.
 */

import serverlessHttp from 'serverless-http';

import { setConfig } from './api/client-factory.js';
import { loadConfig } from './config.js';
import { createLogger } from './observability/logger.js';
import { createHttpApp } from './transport/http.js';
// Side-effect import: pulls every tool module, which calls registerTool().
import './tools/index.js';

const config = loadConfig();
setConfig(config);
const logger = createLogger(config);
const app = createHttpApp(config, logger);

// CloudFront is the only ingress, and it sets X-Forwarded-For. Without this,
// req.ip is the internal Function URL peer for every request and the access
// logs cannot distinguish one client from another, which is precisely what
// we need when identifying a misbehaving client.
app.set('trust proxy', true);

/**
 * Lambda Function URLs use API Gateway payload format 2.0, which
 * `serverless-http` detects via `event.version === '2.0'`.
 *
 * Responses are JSON throughout, so no binary/base64 configuration is needed.
 */
export const handler = serverlessHttp(app);
