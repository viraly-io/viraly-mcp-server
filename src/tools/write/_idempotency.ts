import { createHash, randomUUID } from 'node:crypto';

import { tryGetTokenContext } from '../../auth/token-context.js';

/**
 * Build an idempotency key from a stable hash of the inputs that uniquely
 * identify the operation. Two LLM tool calls with the same args produce the
 * same key.
 *
 * IMPORTANT: the upstream Viraly Platform API does NOT currently honor the
 * `Idempotency-Key` header — it is a no-op server-side. We therefore cannot
 * rely on the server to dedupe a retried write. To still give the model the
 * safe-retry behavior the tool descriptions imply, `dedupeWrite` provides a
 * short-lived, in-process result cache keyed by this idempotency key: a retry
 * with identical args within the TTL returns the cached result instead of
 * issuing a second mutating call. This protects against duplicate
 * posts/drafts/reschedules from a model retrying the same tool call.
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

/** How long a successful write result is remembered for client-side dedupe. */
const DEDUPE_TTL_MS = 60_000;

interface DedupeEntry {
  expiresAt: number;
  result: Promise<unknown>;
}

const dedupeCache = new Map<string, DedupeEntry>();

/**
 * Run a non-idempotent write through an in-process dedupe cache keyed by the
 * derived idempotency key. Concurrent or quick successive calls with the same
 * key share the same in-flight promise / cached result, so a model retry does
 * not produce a duplicate upstream write. Failed operations are NOT cached, so
 * a genuine retry after an error still executes.
 */
export async function dedupeWrite<T>(
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  // SECURITY: namespace the cache by the caller's access token so two different
  // tenants/sessions can never share a cached write result, even if their
  // derived idempotency keys collide (same tool + same inputs, or an explicit
  // idempotency_key reused across tenants). The cache is in-process and the
  // token is the only per-caller identity available here.
  const ctx = tryGetTokenContext();
  const tokenScope = ctx
    ? createHash('sha256').update(ctx.accessToken).digest('hex').slice(0, 16)
    : 'no-token';
  const cacheKey = `${tokenScope}:${idempotencyKey}`;

  const existing = dedupeCache.get(cacheKey);
  if (existing && existing.expiresAt > now) {
    return existing.result as Promise<T>;
  }

  const result = operation();
  dedupeCache.set(cacheKey, { expiresAt: now + DEDUPE_TTL_MS, result });

  try {
    const value = await result;
    // Refresh the TTL now that we know it succeeded.
    dedupeCache.set(cacheKey, {
      expiresAt: Date.now() + DEDUPE_TTL_MS,
      result: Promise.resolve(value),
    });
    pruneExpired();
    return value;
  } catch (err) {
    // Do not cache failures — allow a real retry to re-execute.
    dedupeCache.delete(cacheKey);
    throw err;
  }
}

/**
 * Test-only: clear the in-process dedupe cache so successive tests that reuse
 * identical tool inputs each issue a fresh upstream call. Not used in
 * production code paths.
 */
export function __clearDedupeCacheForTests(): void {
  dedupeCache.clear();
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of dedupeCache) {
    if (entry.expiresAt <= now) dedupeCache.delete(key);
  }
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
