# Viraly MCP Server — Client Distribution Checklist

These submissions happen via web forms / partner programs and require the
production deployment to be live first (Phase 5 CTO handoff).

## 1. Anthropic — Claude.ai Connector Directory

**Form:** https://www.anthropic.com/customers (or partner portal once invited)

**Submission package:**
- **Server URL:** `https://mcp.viraly.io/mcp`
- **OAuth metadata:** `https://api.viraly.io/.well-known/oauth-authorization-server`
- **Protected resource metadata:** `https://mcp.viraly.io/.well-known/oauth-protected-resource`
- **Supports DCR:** yes (RFC 7591 at `https://api.viraly.io/api/oauth/register`)
- **Logo:** `assets/viraly-mcp-logo.png` — 540×540 PNG, transparent background (Viraly hummingbird)
- **Short description:** "Schedule social posts, generate captions, and check analytics across 11+ platforms — directly from Claude."
- **Tool count:** 18 (11 read, 7 write)
- **Privacy policy:** https://viraly.io/privacy-policy
- **Terms of service:** https://viraly.io/terms-of-service
- **Support email:** support@viraly.io

**Pre-flight checks:**
- [ ] Production server returns 200 on `/health`
- [ ] OAuth flow works end-to-end with a fresh test account
- [ ] All 18 tools list via `tools/list`
- [ ] Tool schemas validate cleanly (no missing descriptions)

## 2. ChatGPT — Apps & Connectors

**Portal:** https://platform.openai.com/apps (Settings → Apps & Connectors → Develop)

**Submission package:**
- Same as Anthropic. ChatGPT supports MCP connectors natively now — no
  OpenAPI shim needed (legacy GPT Actions did; MCP path doesn't).
- **OAuth scopes to display:** all 23 — see `viraly-mcp-server/src/transport/http.ts` `VIRALY_SCOPES`.

## 3. Cursor — MCP Marketplace

**Portal:** https://docs.cursor.com/mcp (community-managed marketplace)

**Submission package:**
- A `mcp-server.json` manifest entry (Cursor pulls from a community registry):

```json
{
  "name": "viraly",
  "displayName": "Viraly",
  "description": "Schedule, manage, and analyze social media — through Cursor's AI.",
  "url": "https://mcp.viraly.io/mcp",
  "auth": "oauth",
  "category": "marketing",
  "homepage": "https://viraly.io/mcp"
}
```

## 4. npm — `@viraly/mcp` (stdio variant for power users)

**Pre-flight:**
- [ ] Set `private: false` in `package.json` (currently `true` to prevent accidental publish)
- [ ] Confirm `bin` and `files` entries
- [ ] `npm pack --dry-run` to verify the tarball contents

**Publish steps (once stable):**
```bash
npm version 0.1.0
npm publish --access public
```

## 5. Generic MCP catalogs (post-launch)

Submit to community registries:
- [ ] https://github.com/modelcontextprotocol/servers (community list)
- [ ] https://mcp.so (community catalog)
- [ ] https://www.pulsemcp.com (community catalog)

## 6. Marketing / Announcement

- [ ] Blog post on viraly.io/blog: "Bring Viraly to Claude, ChatGPT, and Cursor"
- [ ] Changelog entry on viraly.io/changelog
- [ ] X / LinkedIn / Threads announcement
- [ ] Email to the existing user base
- [ ] Add `/mcp` to the marketing-site primary nav
