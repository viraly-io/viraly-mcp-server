import { createHash, randomUUID } from 'node:crypto';

import { ViralyAmbiguousWriteError } from '../../api/errors.js';
import { tryGetTokenContext } from '../../auth/token-context.js';
import {
  type ClaimOutcome,
  MemoryDedupeStore,
  __resetDedupeStoreForTests,
  getDedupeStore,
} from './_idempotency-store.js';

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

/** How long we wait for another caller's identical write to settle. */
const POLL_BUDGET_MS = 10_000;
const POLL_INTERVAL_MS = 250;

/**
 * How many times we re-attempt the claim. A second attempt happens only when
 * the previous owner ABANDONED the key (their call failed), which makes the
 * operation ours to run.
 */
const MAX_CLAIM_ATTEMPTS = 3;

/**
 * SECURITY: namespace the cache by the caller's access token so two different
 * tenants/sessions can never share a cached write result, even if their derived
 * idempotency keys collide (same tool + same inputs, or an explicit
 * idempotency_key reused across tenants). The token is the only per-caller
 * identity available here.
 */
function scopedKey(idempotencyKey: string): string {
  const ctx = tryGetTokenContext();
  const tokenScope = ctx
    ? createHash('sha256').update(ctx.accessToken).digest('hex').slice(0, 16)
    : 'no-token';
  return `${tokenScope}:${idempotencyKey}`;
}

/**
 * Run a non-idempotent write through the dedupe store keyed by the derived
 * idempotency key, so a model retry does not produce a duplicate upstream
 * write. Failed operations are NOT recorded, so a genuine retry after an error
 * still executes.
 *
 * Backed by an in-process Map on a single long-lived process, and by DynamoDB
 * when `MCP_IDEMPOTENCY_TABLE` is set (required on Lambda, where every
 * invocation is a separate process). See `_idempotency-store.ts`.
 *
 * When another caller is mid-flight with the same key we wait for their result
 * rather than issuing a second write. If they have not finished within the poll
 * budget we raise ViralyAmbiguousWriteError, which tells the model to verify
 * state rather than blindly retry. That is the honest answer, since the other write
 * may well be about to succeed.
 */
export async function dedupeWrite<T>(
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const store = getDedupeStore();
  const cacheKey = scopedKey(idempotencyKey);

  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const outcome = await store.claim(cacheKey);

    if (outcome.kind === 'completed') return outcome.result as T;

    if (outcome.kind === 'claimed') {
      let value: T;
      try {
        value = await operation();
      } catch (err) {
        // Do not record failures, so a real retry re-executes.
        await store.abandon(cacheKey).catch(() => undefined);
        throw err;
      }
      // Best effort. The upstream write has already succeeded and we hold the
      // result, so a store failure must not fail this call; it only weakens
      // dedupe for the next 60s.
      await store.complete(cacheKey, value).catch(() => undefined);
      return value;
    }

    // in-flight: someone else owns this key. Wait for them to settle.
    const settled = await waitForSettled(store, cacheKey);
    if (settled.kind === 'completed') return settled.result as T;
    if (settled.kind === 'in-flight') {
      throw new ViralyAmbiguousWriteError(
        'An identical write is already in progress and has not finished yet. It may still succeed. ' +
          'Check whether the resource was created before retrying.',
      );
    }
    // settled.kind === 'claimed': the previous owner abandoned it (their call
    // failed), so the operation is free again. Loop and try to claim it.
  }

  throw new ViralyAmbiguousWriteError(
    'Could not obtain a dedupe lock for this write after repeated attempts. ' +
      'Check whether the resource was created before retrying.',
  );
}

/**
 * Poll until the key is completed, freed, or the budget runs out.
 */
async function waitForSettled(
  store: ReturnType<typeof getDedupeStore>,
  cacheKey: string,
): Promise<ClaimOutcome> {
  const deadline = Date.now() + POLL_BUDGET_MS;
  let latest: ClaimOutcome = { kind: 'in-flight' };

  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    latest = await store.poll(cacheKey);
    if (latest.kind !== 'in-flight') return latest;
  }
  return latest;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test-only: reset the dedupe store so successive tests that reuse identical
 * tool inputs each issue a fresh upstream call. Not used in production paths.
 */
export function __clearDedupeCacheForTests(): void {
  __resetDedupeStoreForTests(new MemoryDedupeStore());
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
