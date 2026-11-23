import { afterEach, describe, expect, it, vi } from 'vitest';

// The stdio transport would attach to this process's stdin and stdout; the SDK transport and the tool registry are
// stubbed so the test sees only the token check and what reaches the token context (MCP-14).
const connect = vi.fn(async () => undefined);
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    connect = connect;
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));
const seenTokens: string[] = [];
vi.mock('../src/tools/registry.js', async () => {
  const { getTokenContext } = await import('../src/auth/token-context.js');
  return {
    registerAllTools: vi.fn(() => {
      seenTokens.push(getTokenContext().accessToken);
    }),
  };
});

import { pino } from 'pino';

import { isViralyAccessToken } from '../src/auth/middleware.js';
import { startStdioTransport } from '../src/transport/stdio.js';

const logger = pino({ level: 'silent' });

class Exited extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.VIRALY_ACCESS_TOKEN;
  seenTokens.length = 0;
  connect.mockClear();
});

function trapExit() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exited(code);
  }) as never);
}

describe('isViralyAccessToken', () => {
  it('accepts a vat_ token and refuses keys, an empty value and the bare prefix', () => {
    expect(isViralyAccessToken('vat_abc')).toBe(true);
    expect(isViralyAccessToken('vly_abc')).toBe(false);
    expect(isViralyAccessToken('vrl_abc')).toBe(false);
    expect(isViralyAccessToken('')).toBe(false);
    expect(isViralyAccessToken('vat_')).toBe(false);
  });
});

describe('stdio transport token check', () => {
  it.each(['vly_publicapikey', 'vrl_platformkey', 'garbage'])('refuses %s before connecting', async (token) => {
    process.env.VIRALY_ACCESS_TOKEN = token;
    const exit = trapExit();
    await expect(startStdioTransport(logger)).rejects.toBeInstanceOf(Exited);
    expect(exit).toHaveBeenCalledWith(1);
    expect(connect).not.toHaveBeenCalled();
    expect(seenTokens).toEqual([]);
  });

  it('runs with a vat_ token, trimmed, in the token context', async () => {
    process.env.VIRALY_ACCESS_TOKEN = '  vat_realtoken \n';
    const exit = trapExit();
    await startStdioTransport(logger);
    expect(exit).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(seenTokens).toEqual(['vat_realtoken']);
  });
});
