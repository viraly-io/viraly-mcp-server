import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { bearerAuthMiddleware } from '../src/auth/middleware.js';
import type { ServerConfig } from '../src/config.js';

const config = { publicOrigin: 'https://mcp.test.viraly.io' } as ServerConfig;

/** Runs the HTTP transport's auth middleware on one Authorization header: the status it answers, or next() reached. */
function run(header: string | undefined) {
  const req = { header: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined) } as unknown as Request;
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set() {
      return this;
    },
    json() {
      return this;
    },
  };
  const next = vi.fn() as unknown as NextFunction;
  bearerAuthMiddleware(config)(req, res as unknown as Response, next);
  return { status: res.statusCode, next: next as unknown as ReturnType<typeof vi.fn>, token: (req as { accessToken?: string }).accessToken };
}

describe('HTTP bearer auth (MCP-14)', () => {
  it('passes a vat_ token on', () => {
    const result = run('Bearer vat_abc123');
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('vat_abc123');
  });

  it.each(['Bearer vat_', 'Bearer vly_apikey', 'Bearer vrl_platformkey', 'Bearer vat_abc def'])('answers 401 to %s', (header) => {
    const result = run(header);
    expect(result.status).toBe(401);
    expect(result.next).not.toHaveBeenCalled();
  });
});
