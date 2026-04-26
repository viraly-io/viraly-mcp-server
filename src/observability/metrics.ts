import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics. Exposed at GET /metrics by the HTTP transport.
 *
 * The handful of metrics here cover the things we'll actually want to alert
 * on in production: tool-call rate, duration, error rate, and which clients
 * are calling. Add metrics deliberately — every counter is forever.
 */

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const toolCallCounter = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool invocations.',
  labelNames: ['tool', 'status'],
  registers: [registry],
});

export const toolCallDuration = new Histogram({
  name: 'mcp_tool_call_duration_seconds',
  help: 'Duration of MCP tool invocations (seconds).',
  labelNames: ['tool', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const upstreamCallCounter = new Counter({
  name: 'mcp_upstream_calls_total',
  help: 'Calls from the MCP server to the Viraly API.',
  labelNames: ['method', 'route', 'status_class'],
  registers: [registry],
});

export const authFailureCounter = new Counter({
  name: 'mcp_auth_failures_total',
  help: 'Bearer-token authentication failures, by reason.',
  labelNames: ['reason'],
  registers: [registry],
});
