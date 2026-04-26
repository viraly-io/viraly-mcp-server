/**
 * Per-request authentication context — the OAuth token that the MCP client
 * supplied with this tool call, used by tool implementations to call the
 * Viraly Platform API on the user's behalf.
 *
 * This is plumbed via AsyncLocalStorage so individual tool handlers don't
 * each need to receive the token as a parameter. Set in middleware before
 * the MCP SDK dispatches the tool call; read inside the tool's API client.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TokenContext {
  /** Raw `vat_*` access token from the Authorization header. */
  accessToken: string;

  /** Opaque client identifier (vmcp_* for DCR-registered MCP clients). */
  clientId?: string;
}

const storage = new AsyncLocalStorage<TokenContext>();

export function runWithTokenContext<T>(ctx: TokenContext, fn: () => Promise<T> | T): Promise<T> | T {
  return storage.run(ctx, fn);
}

export function getTokenContext(): TokenContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'Token context unavailable — tool was invoked outside of an authenticated request',
    );
  }
  return ctx;
}

export function tryGetTokenContext(): TokenContext | undefined {
  return storage.getStore();
}
