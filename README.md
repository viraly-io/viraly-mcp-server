# Viraly MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-blue)](https://modelcontextprotocol.io)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for [Viraly](https://viraly.io) — connect any MCP-aware AI assistant (Claude Desktop, Claude.ai web, ChatGPT, Cursor, custom agents built on the Anthropic / OpenAI SDKs) directly to your Viraly social-media workspace and let it schedule posts, run analytics, generate captions, and manage every channel you've connected, all in plain language.

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

The MCP server exposes **32 tools** across reading, writing, analytics, and AI generation — see the [full tool catalog](#tool-catalog) below.

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

32 tools, grouped by what they do. All tools are scoped — your assistant can only call the ones whose scopes you granted at consent time.

### Workspace & discovery

| Tool | Purpose |
|---|---|
| `get_workspace_info` | Workspace name, plan tier (Free/Influencer/Business/Agency/Enterprise), status. |
| `list_social_sets` | Multi-brand "social set" buckets — useful when an agency manages multiple clients in one workspace. |
| `list_channels` | Every connected social account (Instagram, Facebook page, X, LinkedIn, etc.) with its channel id. |
| `list_categories` | Content categories / queues configured in the workspace. |
| `list_hashtag_groups` | Saved hashtag bundles. |
| `list_timezones` | The IANA zone IDs Viraly accepts for scheduling. |

### Posts — reading

| Tool | Purpose |
|---|---|
| `list_posts` | **Recommended.** Cross-status, paginated, filterable list (social set, channel, status, date range, sort). |
| `list_pending_posts` | Convenience: only posts scheduled for the future. |
| `list_published_posts` | Convenience: only posts already published. |
| `list_drafts` | Convenience: only saved drafts. |
| `get_post` | Full details for a single post — caption, attachments, status, schedule, metrics, error. |

### Posts — writing

| Tool | Purpose |
|---|---|
| `schedule_post` | Schedule a post (specific time or next queue slot). Single channel per call; loop for multi-channel. |
| `create_draft` | Save a draft without scheduling. |
| `update_post` | Edit an existing post — caption, schedule, attachments, category. |
| `reschedule_post` | Lighter alternative to `update_post` when you only need to change the time. |
| `publish_post_now` | Immediately publish a draft or scheduled post, bypassing the schedule. |
| `cancel_post` | Cancel a scheduled post or delete a draft. |

### Media

| Tool | Purpose |
|---|---|
| `list_media` | Browse a media-library collection. |
| `upload_media` | Pull a remote URL into the media library and return an `attachment_id` usable in `schedule_post`. |

### Analytics

| Tool | Purpose |
|---|---|
| `get_post_analytics` | Metrics for a single post (likes, comments, shares, reach, impressions, saves, views). |
| `get_post_insights` | Per-post analytics for a channel, sortable by metric — perfect for "top 10 by reach". |
| `get_channel_analytics` | High-level channel stats (currently post count). |
| `trigger_analytics_sync` | Refresh metrics from the platform's API on demand. |
| `export_analytics_csv` | Base64 CSV export of per-post analytics for any channel + date range. |

### AI generation

| Tool | Purpose |
|---|---|
| `generate_caption` | Generate or transform a caption (write-new, rephrase, shorten, expand, casualize, formalize). |
| `generate_hashtags` | Generate a relevant hashtag set for a topic or caption. |
| `generate_image` | Generate an image (DALL-E) and save it to the media library. HD requires Business+. |

### Bio links

| Tool | Purpose |
|---|---|
| `list_biolinks` | List the link-in-bio pages you own. |
| `list_biolink_subscribers` | Paginated email/phone subscribers for a bio-link page — feeds outbound automations. |

### Utilities

| Tool | Purpose |
|---|---|
| `get_url_preview` | Open Graph fetch (title, description, image) for a URL — useful when composing link cards. |

### Workspace management

| Tool | Purpose |
|---|---|
| `update_social_set_timezone` | Change a social set's default timezone. |
| `disconnect_channel` | **Destructive.** Permanently disconnect a channel. Requires `confirm=true`. |

---

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
    registry.ts          register/dispatch framework
    types.ts             ToolDefinition interface
    index.ts             aggregated tool imports
    read/                read-only tools
    write/               state-changing tools (also AI generation)
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
