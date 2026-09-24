# `viraly-mcp-server` — Public-Repo Readiness Audit

**Date:** 2026-04-25
**Repo at audit time:** private at `github.com/viraly-io/viraly-mcp-server`
**Verdict:** ✅ Safe to make public **after** picking a LICENSE (see B-2 below).

This audit was run after the initial push, scanning every committed file
for credentials, secrets, AWS account IDs, internal hostnames, private
package registries, database connection strings, and other artifacts that
would be inappropriate to expose publicly.

## Findings — fixed before audit conclusion

### 🟢 Fixed: stale /metrics docstring (commit `4daa931`)

`src/transport/http.ts:22` claimed `/metrics` had "no auth (assume
internal-only via VPC/SG)". This was true before the `MCP_METRICS_TOKEN`
gate landed; the comment hadn't been updated. Refreshed to describe both
modes (optional token gate; WAF/SG fallback). Code unchanged.

## Open blocker — needs your decision before flipping public

### 🟠 B-1: No LICENSE file; package.json declares `"license": "UNLICENSED"`

**Why this matters for a public repo:** Without an explicit license, the
default is "all rights reserved" — meaning anyone can read the code but
cannot legally use, copy, modify, or distribute it. For an MCP server the
user is *encouraged* to install (`npx @viraly/mcp`, copy snippets from
the marketing page), this is a real problem.

**Three options, in order of practicality:**

| Option | License | Effect |
|---|---|---|
| Most common for SDKs | **Apache 2.0** | Permissive; explicit patent grant; commercial-friendly. What `@modelcontextprotocol/sdk` itself uses. **Recommended for an MCP server.** |
| Permissive baseline | **MIT** | Shorter, simpler, no patent grant. |
| Source-available | **Custom (BSL / SSPL)** | Restricts hosted-rehosting. Overkill for an integration server. |

**Action when you decide:**

```bash
# Apache 2.0 example
curl -sL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE
# update package.json:
#   "license": "Apache-2.0",
git add LICENSE package.json
git commit -m "Add Apache-2.0 license"
git push
```

After that's done, the repo is safe to flip to public via:
```bash
gh repo edit viraly-io/viraly-mcp-server --visibility public
```

## Audit checklist — what was scanned

| # | Check | Result |
|---|---|---|
| 1 | Credential / token patterns (`AKIA`, `aws_secret`, `sk-`, `gho_`, `ghp_`, `password=`, `api_key=`, etc.) | ✅ Only hit was `'*.client_secret'` in the pino redact-paths config — that's the *opposite* of leaking. |
| 2 | High-entropy strings (40+ char base64-ish that could be tokens) | ✅ 0 hits |
| 3 | AWS account IDs (12-digit numbers) | ✅ 0 hits — `deploy/iam-role.json` uses `*` placeholders |
| 4 | Internal hostnames / private IPs (`10.x`, `172.16-31.x`, `192.168.x`, `*.internal`, `*-internal.viraly`, RDS endpoints) | ✅ 4 hits, all in `tests/write-tools.test.ts` as proof-the-SSRF-guard-rejects them |
| 5 | DB connection strings (`postgres://`, `mongodb://`, `mysql://`) | ✅ 0 hits |
| 6 | LICENSE file present | ❌ Missing — see B-1 above |
| 7 | All `.viraly.io` references | ✅ Only `api.viraly.io`, `mcp.viraly.io`, `api.staging.viraly.io`, `support@viraly.io`, `viraly.io/docs` — all public endpoints |
| 8 | Email addresses | ✅ Only `support@viraly.io` (public address) |
| 9 | TODO / FIXME / XXX | ✅ One TODO (placeholder for a logo asset) — public-safe |
| 10 | IAM ARNs in `deploy/` | ✅ Account ID is `*` (placeholder); resource patterns are scoped to `viraly-mcp-server` log group + `mcp-server/` secrets prefix |
| 11 | `package-lock.json` registry sources | ✅ 100% public `registry.npmjs.org` — no private/internal registries |
| 12 | Dockerfile base images | ✅ `node:20-alpine` from public Docker Hub |
| 13 | Private-marker words (`internal-only`, `confidential`, `do not share`, `private_key`, `secret_key`) | ✅ 1 hit fixed (B-1 in fixes above); now 0 hits |
| 14 | git remote points where expected | ✅ `viraly-io/viraly-mcp-server` |
| 15 | No `.env` (only `.env.example`) | ✅ `.env.example` only; `.env` excluded by `.gitignore` |

## Surface analysis — could the public repo become an attack vector?

| Risk | Mitigation |
|---|---|
| Malicious PR triggers CI to leak data | CI only runs on `push` and `pull_request` to `main`/`staging`. PR runs in restricted GH Actions context with `GITHUB_TOKEN` only — no AWS access. Deploy workflow is `if: false`-gated until the CTO wires OIDC. |
| Fork modifies and tries to publish under our name | npm publishing requires the maintainer's auth. Forks cannot push to `@viraly/mcp`. |
| Source code review reveals exploitable bug | All exploitable vectors found in the security audit (passes 1 + 2) have already been fixed. The OAuth flow validates server-side; the public source just shows what it does, not how to bypass it. |
| Source code reveals internal architecture | Architecture diagrams in README and the implementation plan are deliberately high-level. They show what API endpoints exist (already public via `/.well-known/oauth-authorization-server`) but not internal infrastructure. |

## Repo hygiene observations (nice-to-have, not blockers)

These are quality-of-life improvements for the public face of the repo:

- **Add a CONTRIBUTING.md** describing how to run tests locally, what the PR process is, and what the supported issue templates are. Public repos without contribution guidelines feel abandoned.
- **Add a CODE_OF_CONDUCT.md** (use the standard Contributor Covenant 2.1 template).
- **Add a SECURITY.md** with a vulnerability-reporting email (`security@viraly.io` if you have one, otherwise `support@viraly.io` with "[security]" in the subject).
- **Logo asset** — `distribution/SUBMISSIONS.md` references `assets/viraly-mcp-logo.png` which doesn't exist. Add it before submitting to client directories.
- **Pin GitHub Action versions** — `actions/checkout@v4` etc. are already pinned to major. For best-practice public exposure, pin to commit SHAs (e.g., `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1`).

## Final verification (after the docstring fix)

| Surface | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean (0 warnings) |
| `npm test` | ✅ 33/33 pass |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Git remote | ✅ `https://github.com/viraly-io/viraly-mcp-server.git` |
| Initial push | ✅ committed + pushed to `main` |
| Visibility | 🔒 currently **private** — flip to public after addressing B-1 |

**Summary:** the only blocker between this repo and public release is choosing
a license. Everything else is clean.
