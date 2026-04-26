#!/usr/bin/env node
/**
 * Viraly MCP server — entry point.
 *
 * Picks transport (stdio or http) from MCP_TRANSPORT env var, wires
 * observability, registers tools, and starts the appropriate listener.
 */

import { setConfig } from './api/client-factory.js';
import { loadConfig } from './config.js';
import { createLogger } from './observability/logger.js';
import { createHttpApp } from './transport/http.js';
import { startStdioTransport } from './transport/stdio.js';
// Side-effect import — pulls every tool module which calls registerTool().
// Phase 2 ships an empty index; Phase 3+ adds tool imports there.
import './tools/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setConfig(config);
  const logger = createLogger(config);

  if (config.transport === 'stdio') {
    await startStdioTransport(logger);
    return;
  }

  const app = createHttpApp(config, logger);
  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        publicOrigin: config.publicOrigin,
        viralyApiOrigin: config.viralyApiOrigin,
      },
      'Viraly MCP server (http) listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
      process.exit(0);
    });
    // Force-exit after 10s if connections don't drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // Logger may not be available if config failed — fall back to stderr.
  // console.error is allowed by the lint config (alongside console.warn).
  console.error('Fatal startup error:', err);
  process.exit(1);
});
