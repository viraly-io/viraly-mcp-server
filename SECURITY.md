# Security Policy

## Reporting a vulnerability

If you've found a security issue in the Viraly MCP server, please report it privately. **Do not open a public GitHub issue.**

Email **support@viraly.io** with `[security]` in the subject line. Include:

- A description of the issue
- The repo, file, and line(s) involved (or a reproducer)
- The impact you believe it has (auth bypass, data exposure, RCE, etc.)
- Whether you've shared this with anyone else

We'll acknowledge the report within **2 business days** and aim to have a fix or mitigation in place within **14 days** for high-severity issues. We'll credit you in the release notes if you'd like.

## What's in scope

- The code in this repo (`viraly-io/viraly-mcp-server`)
- The hosted server at `https://mcp.viraly.io`
- The OAuth flow as it relates to the MCP server (`/.well-known/oauth-protected-resource` discovery, Bearer auth on `/mcp`)

## What's out of scope

- The Viraly Platform API itself (`api.viraly.io`) — report those to the same address but they're triaged by a different team
- Denial-of-service attacks against `mcp.viraly.io` (we have rate limits and WAF; please don't test by attempting to bring it down)
- Social engineering / phishing of Viraly employees
- Issues in third-party dependencies that don't affect this server's runtime behavior — file those upstream
- Self-XSS or attacks that require a victim to paste attacker-controlled content into their own AI client

## Safe-harbor

We won't take legal action against good-faith security research that follows this policy. "Good faith" means: you don't access data that isn't yours, you don't modify or destroy data, you don't degrade service for other users, and you give us a reasonable window to fix the issue before public disclosure.
