import type { z } from 'zod';

/**
 * Internal representation of an MCP tool. The registry takes these and
 * registers them with the MCP SDK at server start. Tools live in their
 * own files under `src/tools/<tool-name>.ts` and export a single
 * `ToolDefinition`.
 *
 * Phase 2 ships the registry skeleton with no tools registered. Phases
 * 3 (read tools) and 4 (write tools) populate it.
 */

export interface ToolDefinition<Input extends z.ZodType = z.ZodType, Output = unknown> {
  /** snake_case tool name as it appears to the LLM. */
  name: string;

  /**
   * Short, action-oriented description that helps the LLM pick the right
   * tool. First line is most important — many UIs only show that.
   */
  description: string;

  /** Zod schema for the tool input. Field descriptions are forwarded to the LLM. */
  inputSchema: Input;

  /**
   * Optional flag — write tools should set this to true so we can apply
   * extra guardrails (idempotency, dry-run support).
   */
  isWrite?: boolean;

  /** Tool handler. Receives validated input and returns a JSON-serializable result. */
  handler: (input: z.infer<Input>) => Promise<Output> | Output;
}
