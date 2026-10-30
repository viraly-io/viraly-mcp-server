# Viraly MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-blue)](https://modelcontextprotocol.io)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for [Viraly](https://viraly.io) — connect any MCP-aware AI assistant (Claude Desktop, Claude.ai web, ChatGPT, Cursor, custom agents built on the Anthropic / OpenAI SDKs) directly to your Viraly social-media workspace and let it schedule posts, run analytics, generate captions, and manage every channel you've connected, all in plain language.

**First-class MCP support: about 130 tools, full CRUD.** Not a read-only sidekick: your AI can create, read, update, and delete across posts, channels, media, analytics, bio links, short links, ideas, feeds and more, bound by the same OAuth scopes and plan limits as the web app.

> **Available on every Viraly plan, including Free.** No API key — sign in once with OAuth and your AI assistant gets scoped, revocable access to your workspace.

- **Public endpoint:** `https://mcp.viraly.io/mcp`
- **Beta / staging:** `https://mcp.beta.viraly.io/mcp`
- **Source:** [github.com/viraly-io/viraly-mcp-server](https://github.com/viraly-io/viraly-mcp-server)
- **API docs:** [viraly.io/docs](https://viraly.io/docs)

---

## What you can do with it

Once connected, your AI assistant can drive Viraly using natural language:

> *"Draft three Instagram captions about our spring sale, then schedule the best one for Friday at 9am."*

> *"What were my top-performing LinkedIn posts last month by reach? Export them to CSV."*

> *"Generate a hero image for my next YouTube short and save it to the media library."*

> *"Reschedule everything in the Promo queue from this week to next week."*

> *"Post this clip as an Instagram story today and as a YouTube Short tomorrow morning."*

The MCP server exposes **about 130 tools** across reading, writing, analytics, and AI generation; see the [tool catalog](#tool-catalog) below.

---

## Quick install

Pick your MCP client. The first time you run any of these, your browser will open to `app.viraly.io/oauth/authorize` for sign-in and consent. After that, your assistant stays connected.

### Claude Desktop / Claude.ai

Add a custom connector pointing to `https://mcp.viraly.io/mcp`. Follow [Anthropic's connector guide](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

### ChatGPT (Apps & Connectors)

In **Settings → Connectors → Add new**, paste `https://mcp.viraly.io/mcp` and follow the OAuth prompt.

### Cursor

In `~/.cursor/mcp.json` (or your project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "viraly": {
      "url": "https://mcp.viraly.io/mcp"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add viraly https://mcp.viraly.io/mcp -t http
```

### Custom agents (Anthropic SDK / OpenAI SDK / etc.)

Any MCP-compliant client over Streamable HTTP works. Point it at `https://mcp.viraly.io/mcp` and complete the OAuth 2.1 flow (PKCE + Dynamic Client Registration are supported per [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)). The discovery doc is at `https://mcp.viraly.io/.well-known/oauth-protected-resource`.

---

## Tool catalog

The tool list is not kept in this repository. Viraly's API keeps one tool registry, shared with Copilot (the assistant inside the Viraly app), and this server offers exactly what that registry offers to your connection:

- `tools/list` reads `GET /api/platforms/agent-tools` with your token. You see the tools your granted scopes allow, with the same names, descriptions and JSON schemas Copilot uses.
- `tools/call` sends `POST /api/platforms/agent-tools/{name}`, where the API checks the scope and runs the same code Copilot runs.
- Every tool that works on a social set takes `socialSetId`; call `list_social_sets` first.
- Annotations tell your assistant what each tool does: `readOnlyHint` for reads, `destructiveHint` for actions that cannot be taken back (publishing now, deleting, disconnecting a channel). Ask your assistant to confirm those with you.

The registry covers workspace and social sets, channels and posting slots, posts and the calendar (drafts, scheduling, free slots, validation, bulk moves, publishing), categories, the media library, hashtag lists, analytics, AI generation, bio pages, short links, competitors, ideas, feeds, Shopify auto-post, evergreen schedules, team, settings and billing reads. The inbox and Copilot's own tools are not offered here.

A tool added to the registry reaches MCP clients without a change to this server; clients pick it up when they next refresh their tool list.

## OAuth scopes reference

When your assistant connects, it asks for a set of scopes. You can grant a subset; the assistant will get scope-error responses for tools that need anything you withheld.

| Scope | Grants |
|---|---|
| `posts:read` | List/get posts and their metadata |
| `posts:write` | Schedule, create, update, reschedule, publish, cancel posts; AI generation |
| `channels:read` | List channels, channel stats |
| `channels:write` | Disconnect channels, trigger analytics sync |
| `analytics:read` | Post + channel analytics, insights, CSV export |
| `media:read` | List media library |
| `media:write` | Upload media, generate AI images |
| `social_sets:read` | List social sets |
| `social_sets:write` | Update social-set timezone |
| `categories:read` | List categories |
| `hashtags:read` | List hashtag groups |
| `biolinks:read` | List bio-link pages |
| `subscribers:read` | List bio-link subscribers |
| `workspace:read` | Workspace name, plan, status |

Revoke at any time from **Settings → Connected Apps** in the Viraly SPA.

---

## Self-hosting

The hosted endpoint at `mcp.viraly.io` is what every consumer should use. This section is for users who want to run their own copy (security audits, air-gapped corporate deployments, dev work on the server itself).

```bash
git clone https://github.com/viraly-io/viraly-mcp-server.git
cd viraly-mcp-server
npm install
npm run build

VIRALY_API_ORIGIN=https://api.viraly.io \
VIRALY_OAUTH_ISSUER=https://api.viraly.io \
MCP_PUBLIC_ORIGIN=https://localhost:8080 \
MCP_TRANSPORT=http \
PORT=8080 \
npm start
```

For stdio mode (single-user CLI tools that already have a `vat_*` access token):

```bash
VIRALY_ACCESS_TOKEN=vat_yourtoken \
MCP_TRANSPORT=stdio \
node dist/server.js
```

### Environment variables

| Var | Default | Notes |
|---|---|---|
| `MCP_TRANSPORT` | `http` | `http` (Streamable HTTP) or `stdio` |
| `PORT` | `8080` | HTTP transport only |
| `VIRALY_API_ORIGIN` | `https://api.viraly.io` | Upstream Platform API |
| `VIRALY_OAUTH_ISSUER` | (= `VIRALY_API_ORIGIN`) | Issuer URL for OAuth metadata |
| `MCP_PUBLIC_ORIGIN` | `https://mcp.viraly.io` | This server's public URL |
| `MCP_CORS_ORIGINS` | (empty) | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | pino level |
| `MCP_RATE_LIMIT_PER_MINUTE` | `300` | Per-token cap |
| `MCP_METRICS_TOKEN` | (none) | If set, `/metrics` requires `Authorization: Bearer <token>` |
| `VIRALY_ACCESS_TOKEN` | (none) | stdio transport only |

### HTTP endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | Liveness probe |
| GET | `/metrics` | optional bearer | Prometheus exposition |
| GET | `/.well-known/oauth-protected-resource` | none | [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) |
| POST | `/mcp` | Bearer `vat_*` | MCP JSON-RPC |
| GET | `/mcp` | Bearer `vat_*` | SSE event stream |
| DELETE | `/mcp` | Bearer `vat_*` | Session termination |

---

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

The server is a thin proxy that exposes LLM-friendly tool schemas. Authentication and authorization are delegated to the Viraly API — every tool call forwards the user's `vat_*` access token upstream and lets the API enforce scopes and plan limits exactly as it does for the SPA. There's no shared key, no privileged service account, and no way for one user's tokens to access another tenant's data.

### Repo layout

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
    registry.ts          the generated adapter: tools/list and tools/call from the API registry
    idempotency.ts       stable idempotency key per call
  transport/
    http.ts              Streamable HTTP transport
    stdio.ts             stdio transport
  observability/
    logger.ts            pino logger (auth headers redacted)
    metrics.ts           prom-client metrics
```

---

## Troubleshooting

**Browser shows "ruffled feathers" / generic error after sign-in.**
You may be on a stale SPA bundle — hard-refresh `app.viraly.io` (Cmd-Shift-R / Ctrl-Shift-R) and retry the OAuth flow.

**Tool returns "Plan limit reached".**
You hit a quota gate (e.g. `generate_image` on Free plan). Upgrade at [viraly.io/pricing](https://viraly.io/pricing) or pick a tool that doesn't require the gated capability.

**Tool returns "additional permission" / scope error.**
The original consent didn't grant the scope this tool needs. Open **Settings → Connected Apps**, revoke, then re-add the connector and grant the missing scope.

**`MODEL_VALIDATION_FAILED` from any tool.**
File an issue with the tool name and (redacted) input — that error means the MCP server's request shape is out of sync with the API. We try to catch these in CI but the surface is large.

**Token expired.**
Most clients auto-refresh. If yours doesn't, reconnect — the OAuth flow only takes a few seconds.

---

## Security

See [`SECURITY.md`](SECURITY.md) for the disclosure policy and the threat model.

Highlights:
- OAuth 2.1 + PKCE; no shared keys, no service accounts.
- Per-tool scopes + plan-tier checks enforced by the Viraly API, not by this server.
- Authorization headers and OAuth tokens are redacted in logs.
- All container deploys are pinned by SHA, not tag, in CI.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Links

- [Viraly](https://viraly.io)
- [Viraly Docs (full REST API)](https://viraly.io/docs)
- [Pricing](https://viraly.io/pricing) — MCP is included on every plan
- [Model Context Protocol spec](https://modelcontextprotocol.io)
