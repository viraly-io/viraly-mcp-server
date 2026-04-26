import { createHash, randomUUID } from 'node:crypto';

/**
 * Build an idempotency key from a stable hash of the inputs that uniquely
 * identify the operation. Two LLM tool calls with the same args produce the
 * same key, allowing the upstream API to dedupe retries when it adds
 * server-side support.
 *
 * If the caller supplies an explicit `idempotency_key`, we trust it.
 * Otherwise we hash a stable JSON serialization of the inputs.
 */
export function deriveIdempotencyKey(
  toolName: string,
  inputs: Record<string, unknown>,
  explicitKey?: string,
): string {
  if (explicitKey && explicitKey.length > 0) return explicitKey;

  const stable = stableStringify({ tool: toolName, inputs });
  return createHash('sha256').update(stable).digest('hex').slice(0, 32);
}

/** Per-call random key — use when the caller wants no dedup. */
export function freshIdempotencyKey(): string {
  return randomUUID();
}

/**
 * JSON.stringify-but-sorted to give deterministic output for the same
 * logical inputs.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
