import { getTokenContext } from '../auth/token-context.js';
import type { ServerConfig } from '../config.js';
import { ViralyClient } from './viraly-client.js';

/**
 * Module-level configuration singleton. Set once at startup by server.ts so
 * tool handlers can construct API clients without each one needing to
 * receive `config` as an argument.
 */
let configSingleton: ServerConfig | undefined;

export function setConfig(config: ServerConfig): void {
  configSingleton = config;
}

export function getConfig(): ServerConfig {
  if (!configSingleton) {
    throw new Error('Config has not been initialized. Call setConfig() at startup.');
  }
  return configSingleton;
}

/**
 * Construct a ViralyClient for the current request's access token. Pulls
 * the token from AsyncLocalStorage — must be called from inside a tool
 * handler that runs under `runWithTokenContext(...)`.
 */
export function getClient(options: { idempotencyKey?: string } = {}): ViralyClient {
  const config = getConfig();
  const ctx = getTokenContext();
  return new ViralyClient({
    config,
    accessToken: ctx.accessToken,
    idempotencyKey: options.idempotencyKey,
  });
}
