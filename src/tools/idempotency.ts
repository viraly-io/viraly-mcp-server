import { createHash } from 'node:crypto';

/**
 * A stable key for one tool call: the same tool with the same arguments gets the same key, so a client that retries
 * a write after a dropped response does not write twice. The API scopes the key to the caller's tenant.
 */
export function deriveIdempotencyKey(toolName: string, inputs: Record<string, unknown>): string {
  const stable = stableStringify({ tool: toolName, inputs });
  return createHash('sha256').update(stable).digest('hex').slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
