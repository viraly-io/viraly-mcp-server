import { pino, type Logger } from 'pino';

import type { ServerConfig } from '../config.js';

/**
 * Structured logger. Pino serializes JSON to stdout, suitable for CloudWatch
 * ingestion or any log shipping pipeline.
 *
 * Sensitive fields (Authorization, refresh_token, code) are redacted by name —
 * never log raw tokens or secrets.
 */
export function createLogger(config: ServerConfig): Logger {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.access_token',
        '*.refresh_token',
        '*.client_secret',
        '*.code',
        '*.code_verifier',
      ],
      remove: true,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'viraly-mcp-server',
    },
  });
}
