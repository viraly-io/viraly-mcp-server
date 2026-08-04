import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  ViralyApiError,
  ViralyAuthError,
  ViralyPlanLimitError,
  ViralyScopeError,
  ViralyTransientError,
} from '../api/errors.js';
import { toolCallCounter, toolCallDuration } from '../observability/metrics.js';
import type { ToolDefinition } from './types.js';

/**
 * Tool registry. Tools register themselves into this list at module load
 * time, and `registerAllTools(server)` wires them into the MCP server.
 *
 * The registry wraps every tool handler with:
 *   - Zod input validation (already done by the MCP SDK, but we double-
 *     check at the registry layer to keep tool authors honest).
 *   - Try/catch that maps Viraly API errors to MCP-friendly text content
 *     so the LLM can recover without crashing the session.
 *   - Prometheus instrumentation.
 */

// The registry holds tools with their generic params erased — each tool's
// own file keeps the precise type, but the registry treats them uniformly.
const tools: ToolDefinition[] = [];

export function registerTool<Input extends z.ZodType, Output>(
  definition: ToolDefinition<Input, Output>,
): void {
  if (tools.find((t) => t.name === definition.name)) {
    throw new Error(`Duplicate tool registration: ${definition.name}`);
  }
  tools.push(definition as unknown as ToolDefinition);
}

export function registerAllTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: zodObjectShape(tool.inputSchema),
      },
      async (rawInput: unknown) => {
        const startedAt = process.hrtime.bigint();
        let status = 'ok';
        try {
          const parsed = tool.inputSchema.parse(rawInput);
          const result = await tool.handler(parsed);
          return {
            content: [
              {
                type: 'text' as const,
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          status = 'error';
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: formatToolError(err),
              },
            ],
          };
        } finally {
          const elapsedSec = Number(process.hrtime.bigint() - startedAt) / 1e9;
          toolCallCounter.inc({ tool: tool.name, status });
          toolCallDuration.observe({ tool: tool.name, status }, elapsedSec);
        }
      },
    );
  }

  // Correct the capability the SDK just declared on our behalf.
  //
  // `registerTool` calls `registerCapabilities({ tools: { listChanged: true } })`
  // internally, so a server that registers any tool advertises that it will send
  // `notifications/tools/list_changed` when its tool list changes. This server
  // cannot: `GET /mcp` returns 405 on purpose (an open SSE stream would pin a
  // Lambda invocation until the platform kills it), responses are buffered JSON,
  // and the transport is stateless. There is no channel to push a notification
  // down, and the tool list is fixed for the life of the process anyway.
  //
  // Advertising it was not harmless. It tells a client "wait, I will tell you" -
  // an invitation to cache the tool list indefinitely. What actually saves us is
  // that clients re-run initialize + tools/list on their own every 1-2 hours
  // (measured in production), which is a behaviour we should not silently depend
  // on while claiming a contract we do not honour. Declaring false tells a client
  // the truth: nothing is coming, so refresh on your own schedule.
  //
  // Must run BEFORE `server.connect(transport)` - registerCapabilities throws
  // once a transport is attached. Both transports register tools first, which is
  // why this lives here rather than in each of them.
  //
  // If a future change makes the tool list dynamic, deliver the notification
  // first and only then flip this back to true.
  server.server.registerCapabilities({ tools: { listChanged: false } });
}

export function listRegisteredTools(): readonly ToolDefinition[] {
  return tools;
}

function formatToolError(err: unknown): string {
  if (err instanceof ViralyAuthError) {
    return 'Your Viraly access has expired or been revoked. Please reconnect Viraly to continue.';
  }
  if (err instanceof ViralyScopeError) {
    return err.missingScope && err.missingScope !== 'unknown'
      ? `This tool needs the Viraly "${err.missingScope}" permission, which your current connection doesn't grant. Reconnect Viraly and approve that access to use this tool.`
      : `This tool needs a Viraly permission your current connection doesn't grant (the server didn't say which). Reconnect Viraly and approve all requested access.`;
  }
  if (err instanceof ViralyPlanLimitError) {
    const bodyMessage =
      err.upstreamBody && typeof err.upstreamBody === 'object' && 'message' in err.upstreamBody
        ? String((err.upstreamBody as Record<string, unknown>).message)
        : '';
    // Avoid "Plan limit reached: Plan limit reached" when the upstream gave no specific quota.
    const detail = bodyMessage && bodyMessage !== 'Plan limit reached' ? ` (${bodyMessage})` : '';
    return `You've reached a Viraly plan limit${detail}. Upgrade at https://viraly.io/pricing to continue.`;
  }
  if (err instanceof ViralyTransientError) {
    // Rate-limit 429s carry a specific "wait N seconds" hint — surface it
    // instead of the generic unavailable line.
    return err.status === 429 && err.message
      ? err.message
      : `Viraly is temporarily unavailable (${err.status}). Please try again in a moment.`;
  }
  if (err instanceof ViralyApiError) {
    return `Viraly API error: ${err.message}`;
  }
  if (err instanceof z.ZodError) {
    return `Invalid input: ${err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`;
  }
  if (err instanceof Error) {
    return `Unexpected error: ${err.message}`;
  }
  return 'Unexpected error.';
}

/**
 * The MCP SDK accepts a Zod object's shape rather than the schema itself.
 * If the tool author defines its inputSchema as `z.object({...})`, this
 * extracts the underlying shape; if they provide some other Zod type, we
 * wrap it.
 */
function zodObjectShape(schema: z.ZodType): Record<string, z.ZodType> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodType>;
  }
  return { value: schema };
}
