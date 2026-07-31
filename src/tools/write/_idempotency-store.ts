/**
 * Backing store for the write dedupe cache.
 *
 * WHY THIS EXISTS
 * ---------------
 * The upstream Viraly Platform API does not honor `Idempotency-Key`, so the
 * only thing standing between a model retry and a duplicate post is our own
 * dedupe cache (see `_idempotency.ts`).
 *
 * On a single long-lived process that cache can be an in-process Map: a retry
 * lands in the same process and hits the same Map. On Lambda that assumption
 * breaks: concurrent invocations run in separate execution environments with
 * separate Maps, so the retry would sail straight through and create a second
 * post.
 *
 * So the store is pluggable:
 *   - `MCP_IDEMPOTENCY_TABLE` set  -> DynamoDB, shared across invocations.
 *   - unset                        -> in-process Map (stdio, local dev,
 *                                     self-hosted single-container deploys).
 *
 * Self-hosters and stdio users therefore keep working with no AWS dependency,
 * and get exactly the guarantee a single process can offer.
 *
 * TTL NOTE: DynamoDB's own TTL deletion is lazy (AWS documents up to 48h), so
 * it is used only to keep the table small. Expiry that matters for CORRECTNESS
 * is enforced by comparing the `expiresAt` attribute inside every condition
 * expression, never by trusting the row to be gone.
 */

/** How long a completed write result is remembered. Matches the previous in-process TTL. */
export const DONE_TTL_MS = 60_000;

/**
 * How long a claim may be held before another caller may steal it.
 *
 * Must exceed the maximum wall time a single invocation can hold the claim,
 * otherwise a second caller steals it while the first is still working and
 * both issue the write. That maximum is the Lambda timeout, not the upstream
 * HTTP timeout, because a Lambda killed at its deadline never runs `abandon`.
 *
 * The ordering the deployment must preserve:
 *   upstream HTTP timeout (30s)
 *     < Lambda timeout (40s)        so the app returns its own error
 *     < CLAIM_TTL (45s)             so a killed invocation's claim outlives it
 *     < CloudFront readTimeout (60s) so the edge surfaces the app's error
 */
export const CLAIM_TTL_MS = 45_000;

export type ClaimOutcome =
  /** We own this operation. Run it, then call `complete` or `abandon`. */
  | { kind: 'claimed' }
  /** Someone already finished it within the TTL. Use this result, do not re-run. */
  | { kind: 'completed'; result: unknown }
  /** Someone else is running it right now. */
  | { kind: 'in-flight' };

export interface DedupeStore {
  /** Attempt to take ownership of `key`. */
  claim(key: string): Promise<ClaimOutcome>;
  /** Record a successful result so concurrent/subsequent callers reuse it. */
  complete(key: string, result: unknown): Promise<void>;
  /**
   * Release a claim after a FAILED operation, so a genuine retry re-executes
   * immediately. Failures are deliberately never cached.
   */
  abandon(key: string): Promise<void>;
  /** Poll for a completed result while another caller holds the claim. */
  poll(key: string): Promise<ClaimOutcome>;
}

// ── In-process store ────────────────────────────────────────────────────────

interface MemoryEntry {
  state: 'running' | 'done';
  expiresAt: number;
  result?: unknown;
}

/**
 * Single-process store. Behaviourally identical to the original Map cache.
 */
export class MemoryDedupeStore implements DedupeStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async claim(key: string): Promise<ClaimOutcome> {
    const now = Date.now();
    this.prune(now);
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      if (existing.state === 'done') return { kind: 'completed', result: existing.result };
      return { kind: 'in-flight' };
    }

    this.entries.set(key, { state: 'running', expiresAt: now + CLAIM_TTL_MS });
    return { kind: 'claimed' };
  }

  async complete(key: string, result: unknown): Promise<void> {
    this.entries.set(key, { state: 'done', expiresAt: Date.now() + DONE_TTL_MS, result });
  }

  async abandon(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async poll(key: string): Promise<ClaimOutcome> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (!existing || existing.expiresAt <= now) return { kind: 'claimed' };
    if (existing.state === 'done') return { kind: 'completed', result: existing.result };
    return { kind: 'in-flight' };
  }

  private prune(now: number): void {
    for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k);
  }
}

// ── DynamoDB store ──────────────────────────────────────────────────────────

/**
 * Cross-invocation store for Lambda. One row per (token-scoped) idempotency
 * key, claimed with a conditional put so exactly one caller can win a race.
 *
 * The SDK is imported dynamically so that neither stdio mode nor a self-hosted
 * container pays its init cost when `MCP_IDEMPOTENCY_TABLE` is unset.
 */
export class DynamoDedupeStore implements DedupeStore {
  private readonly tableName: string;
  private clientPromise: Promise<DynamoLike> | undefined;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  private async client(): Promise<DynamoLike> {
    this.clientPromise ??= (async () => {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
      return new DynamoDBClient({}) as unknown as DynamoLike;
    })();
    return this.clientPromise;
  }

  async claim(key: string): Promise<ClaimOutcome> {
    const { PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const client = await this.client();
    const nowMs = Date.now();

    try {
      await client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: {
            pk: { S: key },
            state: { S: 'running' },
            expiresAtMs: { N: String(nowMs + CLAIM_TTL_MS) },
            // Seconds, and padded well past the logical TTL. This attribute only
            // drives DynamoDB's lazy row cleanup, never correctness.
            ttl: { N: String(Math.floor((nowMs + CLAIM_TTL_MS) / 1000) + 3600) },
          },
          // Win only if there is no live row: either nothing exists, or what
          // exists has logically expired.
          ConditionExpression: 'attribute_not_exists(pk) OR expiresAtMs < :nowMs',
          ExpressionAttributeValues: { ':nowMs': { N: String(nowMs) } },
        }),
      );
      return { kind: 'claimed' };
    } catch (err) {
      if (!isConditionalCheckFailed(err)) throw err;
      // Lost the race, or a live result already exists. Find out which.
      return this.poll(key);
    }
  }

  async complete(key: string, result: unknown): Promise<void> {
    const { PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const client = await this.client();
    const nowMs = Date.now();
    await client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: {
          pk: { S: key },
          state: { S: 'done' },
          result: { S: JSON.stringify(result ?? null) },
          expiresAtMs: { N: String(nowMs + DONE_TTL_MS) },
          ttl: { N: String(Math.floor((nowMs + DONE_TTL_MS) / 1000) + 3600) },
        },
      }),
    );
  }

  async abandon(key: string): Promise<void> {
    const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    const client = await this.client();
    await client.send(
      new DeleteItemCommand({ TableName: this.tableName, Key: { pk: { S: key } } }),
    );
  }

  async poll(key: string): Promise<ClaimOutcome> {
    const { GetItemCommand } = await import('@aws-sdk/client-dynamodb');
    const client = await this.client();
    const res = await client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: { pk: { S: key } },
        ConsistentRead: true,
      }),
    );

    const item = res.Item;
    if (!item) return { kind: 'claimed' };

    const expiresAtMs = Number(item.expiresAtMs?.N ?? '0');
    if (expiresAtMs <= Date.now()) return { kind: 'claimed' };

    if (item.state?.S === 'done') {
      const raw = item.result?.S;
      return { kind: 'completed', result: raw === undefined ? null : (JSON.parse(raw) as unknown) };
    }
    return { kind: 'in-flight' };
  }
}

/** Minimal structural type so we do not need the SDK's types at build time. */
interface DynamoLike {
  send(command: unknown): Promise<{ Item?: Record<string, { S?: string; N?: string }> }>;
}

function isConditionalCheckFailed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: string }).name;
  return name === 'ConditionalCheckFailedException';
}

// ── Selection ───────────────────────────────────────────────────────────────

let store: DedupeStore | undefined;

/**
 * Resolve the dedupe store from the environment. Evaluated once per process.
 */
export function getDedupeStore(): DedupeStore {
  if (!store) {
    const table = process.env.MCP_IDEMPOTENCY_TABLE;
    store = table ? new DynamoDedupeStore(table) : new MemoryDedupeStore();
  }
  return store;
}

/** Test-only: drop the memoized store so tests can swap implementations. */
export function __resetDedupeStoreForTests(next?: DedupeStore): void {
  store = next;
}
