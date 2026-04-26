import { pino, type Logger } from 'pino';

import type { ServerConfig } from '../config.js';

/**
 * Structured logger. Pino serializes JSON to stdout, suitable for CloudWatch
 * ingestion or any log shipping pipeline.
 *
 * Redact-paths cover both standard auth headers and the broader "anything an
 * attacker might shove a token into" surface. We redact (replace with the
 * literal string `[Redacted]`) rather than `remove: true` so attack-pattern
 * analysis can still see *which* headers were sent — just not their values.
 */
export function createLogger(config: ServerConfig): Logger {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        // Standard auth headers (always redacted regardless of intent)
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-access-token"]',
        'req.headers["x-api-key"]',
        'req.headers["x-auth-token"]',
        'req.headers["x-csrf-token"]',
        'req.headers["x-session-token"]',
        'req.headers["proxy-authorization"]',
        // Any field literally named one of these in a body or response —
        // covers OAuth tokens nested anywhere in the JSON we log.
        '*.access_token',
        '*.refresh_token',
        '*.id_token',
        '*.client_secret',
        '*.code',
        '*.code_verifier',
        '*.password',
        '*.api_key',
        '*.apikey',
      ],
      censor: '[Redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'viraly-mcp-server',
    },
  });
}
