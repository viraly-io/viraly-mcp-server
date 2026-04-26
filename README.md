# Viraly MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects Viraly to LLM clients — Claude Desktop / Claude.ai, ChatGPT (Apps & Connectors), Cursor, and any custom MCP-aware agent.

**Status:** Phase 2 skeleton. Tools come in subsequent phases. Not yet deployed.

## Architecture

```
MCP client  ──OAuth 2.1 + PKCE──▶  Viraly .NET API  (api.viraly.io)
     │                                    ▲
     │                                    │ Bearer vat_* (forwarded)
     │  Streamable HTTP / stdio           │
     └─▶  Viraly MCP server  (mcp.viraly.io)
              ├─ Tool registry (read + write)
              ├─ OAuth resource-server middleware
              └─ Pass-through to Platform API (/api/platforms/*)
```

The MCP server is a thin proxy that exposes LLM-friendly tool schemas. Authentication and authorization are delegated to the Viraly API — every tool call forwards the user's `vat_*` access token upstream and lets the API enforce scopes and plan limits exactly as it does for the SPA.

See [`viraly-api/docs/MCP_IMPLEMENTATION_PLAN.md`](../viraly-api/docs/MCP_IMPLEMENTATION_PLAN.md) for the full design doc.

## Repo layout

```
src/
  server.ts              entry point
  config.ts              env-var loading + validation
  auth/
    middleware.ts        Bearer-token auth for HTTP transport
    token-context.ts     AsyncLocalStorage for per-request token
  api/
    viraly-client.ts     Platform API client (typed)
    errors.ts            error taxonomy
  tools/
    registry.ts          register/dispatch framework
    types.ts             ToolDefinition interface
    index.ts             aggregated tool imports (empty in Phase 2)
  transport/
    http.ts              Streamable HTTP transport
    stdio.ts             stdio transport
  observability/
    logger.ts            pino logger
    metrics.ts           prom-client metrics
```

## Running locally

```bash
npm install
npm run build
VIRALY_API_ORIGIN=https://api.staging.viraly.io \
VIRALY_OAUTH_ISSUER=https://api.staging.viraly.io \
MCP_PUBLIC_ORIGIN=https://localhost:8080 \
MCP_TRANSPORT=http \
PORT=8080 \
npm start
```

For stdio (used by Claude Desktop / Cursor configs):

```bash
VIRALY_ACCESS_TOKEN=vat_yourtoken \
MCP_TRANSPORT=stdio \
node dist/server.js
```

## Environment variables

| Var                       | Default                      | Notes |
|---------------------------|------------------------------|-------|
| `MCP_TRANSPORT`           | `http`                       | `http` or `stdio` |
| `PORT`                    | `8080`                       | HTTP transport only |
| `VIRALY_API_ORIGIN`       | `https://api.viraly.io`      | Upstream Platform API |
| `VIRALY_OAUTH_ISSUER`     | (= `VIRALY_API_ORIGIN`)      | Issuer URL for OAuth metadata |
| `MCP_PUBLIC_ORIGIN`       | `https://mcp.viraly.io`      | This server's public URL |
| `MCP_CORS_ORIGINS`        | (empty)                      | Comma-separated allowed origins |
| `LOG_LEVEL`               | `info`                       | pino level |
| `MCP_RATE_LIMIT_PER_MINUTE` | `300`                      | Per-token cap (Phase 4) |
| `VIRALY_ACCESS_TOKEN`     | (none)                       | stdio transport only |

## HTTP endpoints

| Method | Path                                      | Auth | Notes |
|--------|-------------------------------------------|------|-------|
| GET    | `/health`                                 | none | Liveness probe |
| GET    | `/metrics`                                | optional bearer | Prometheus exposition. Set `MCP_METRICS_TOKEN` to require `Authorization: Bearer <token>`; otherwise gate at the network layer (WAF / SG). |
| GET    | `/.well-known/oauth-protected-resource`   | none | RFC 9728 |
| POST   | `/mcp`                                    | Bearer `vat_*` | MCP JSON-RPC |
| GET    | `/mcp`                                    | Bearer `vat_*` | SSE event stream |
| DELETE | `/mcp`                                    | Bearer `vat_*` | Session termination |

## Production deployment

See `MCP_PROD_DEPLOY_HANDOFF.md` (produced at the end of Phase 8) for the AWS App Runner setup, Route 53 record, ACM cert, Secrets Manager entries, and CTO checklist.
