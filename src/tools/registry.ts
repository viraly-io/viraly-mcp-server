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
}

export function listRegisteredTools(): readonly ToolDefinition[] {
  return tools;
}

function formatToolError(err: unknown): string {
  if (err instanceof ViralyAuthError) {
    return 'Your Viraly access has expired or been revoked. Please reconnect Viraly to continue.';
  }
  if (err instanceof ViralyScopeError) {
    return `This tool needs additional permission: ${err.message}. Reconnect Viraly and grant the requested scope.`;
  }
  if (err instanceof ViralyPlanLimitError) {
    const detail =
      err.upstreamBody && typeof err.upstreamBody === 'object' && 'message' in err.upstreamBody
        ? String((err.upstreamBody as Record<string, unknown>).message)
        : err.message;
    return `Plan limit reached: ${detail}. Upgrade at https://viraly.io/pricing to continue.`;
  }
  if (err instanceof ViralyTransientError) {
    return `Viraly is temporarily unavailable (${err.status}). Please try again in a moment.`;
  }
  if (err instanceof ViralyApiError) {
    return `Viraly API error: ${err.message}`;
  }
  if (err instanceof z.ZodError) {
    return `Invalid input: ${err.errors.map((e) => `${e.path.join('.')} — ${e.message}`).join('; ')}`;
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
