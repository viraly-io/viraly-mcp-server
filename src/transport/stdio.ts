import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Logger } from 'pino';

import { runWithTokenContext } from '../auth/token-context.js';
import { registerAllTools } from '../tools/registry.js';

/**
 * Stdio transport for local CLI usage.
 *
 * Used by `npx @viraly/mcp` — the user runs the binary, an MCP client
 * (Claude Desktop config, Cursor config) attaches via stdin/stdout, and
 * the OAuth `vat_*` token is supplied via the `VIRALY_ACCESS_TOKEN`
 * environment variable.
 *
 * The stdio transport is intentionally simpler than HTTP — no session
 * management, no SSE, just JSON-RPC messages over stdio. Use HTTP for
 * any hosted deployment.
 */
export async function startStdioTransport(logger: Logger): Promise<void> {
  const accessToken = process.env.VIRALY_ACCESS_TOKEN;
  if (!accessToken) {
    logger.error(
      'VIRALY_ACCESS_TOKEN env var is required for stdio transport. Get one by completing the OAuth flow at https://viraly.io/mcp.',
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: 'viraly',
    version: '0.1.0',
  });

  const transport = new StdioServerTransport();

  await runWithTokenContext({ accessToken }, async () => {
    registerAllTools(server);
    await server.connect(transport);
    logger.info('Viraly MCP server (stdio) ready');
  });
}
