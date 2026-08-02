/**
 * Runtime configuration loaded from environment variables.
 *
 * The server fails fast at startup if any required value is missing — config
 * mistakes should never become silent runtime errors.
 */

export interface ServerConfig {
  /** "stdio" for local CLI use, "http" for hosted production deployment. */
  transport: 'stdio' | 'http';

  /** Port the HTTP transport binds to. Ignored for stdio. */
  port: number;

  /** Public origin of this MCP server, e.g. "https://mcp.viraly.io". Used in
   * OAuth Protected Resource Metadata and self-referential links. */
  publicOrigin: string;

  /** Origin of the Viraly .NET API the server proxies to, e.g.
   * "https://api.viraly.io". No trailing slash. */
  viralyApiOrigin: string;

  /** Origin of the Viraly OAuth authorization server. Usually the same as
   * viralyApiOrigin (the API hosts the OAuth endpoints). */
  oauthIssuer: string;

  /** Comma-separated list of CORS-permitted origins for the HTTP transport.
   * Empty string means CORS is disabled (server-to-server only). */
  corsAllowedOrigins: string[];

  /** "info" by default; "debug" in development, "warn" in load tests. */
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  /** Optional bearer token required to scrape /metrics. When unset, the
   * endpoint is open — relies on network-layer (WAF / SG) restriction. */
  metricsAuthToken: string | undefined;

  /**
   * Shared secret proving a request arrived through our CDN rather than
   * directly at the origin. When set, every request must carry it in
   * `x-viraly-edge-token` or it is refused. Unset disables the check, which is
   * correct for stdio, local dev and self-hosted deployments that have no CDN
   * in front.
   */
  edgeToken: string | undefined;
}

const DEFAULT_PORT = 8080;

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative number`);
  }
  return parsed;
}

export function loadConfig(): ServerConfig {
  const transport = (process.env.MCP_TRANSPORT ?? 'http').toLowerCase();
  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error(`MCP_TRANSPORT must be "stdio" or "http", got "${transport}"`);
  }

  const apiOrigin = requireEnv('VIRALY_API_ORIGIN', 'https://api.viraly.io').replace(/\/+$/, '');
  const issuer = requireEnv('VIRALY_OAUTH_ISSUER', apiOrigin).replace(/\/+$/, '');
  const publicOrigin = requireEnv('MCP_PUBLIC_ORIGIN', 'https://mcp.viraly.io').replace(/\/+$/, '');

  const cors = (process.env.MCP_CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const logLevelRaw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const allowedLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
  if (!(allowedLevels as readonly string[]).includes(logLevelRaw)) {
    throw new Error(`LOG_LEVEL must be one of ${allowedLevels.join(', ')}`);
  }

  return {
    transport,
    port: optionalInt('PORT', DEFAULT_PORT),
    publicOrigin,
    viralyApiOrigin: apiOrigin,
    oauthIssuer: issuer,
    corsAllowedOrigins: cors,
    logLevel: logLevelRaw as ServerConfig['logLevel'],
    metricsAuthToken: process.env.MCP_METRICS_TOKEN || undefined,
    edgeToken: process.env.MCP_EDGE_TOKEN || undefined,
  };
}
