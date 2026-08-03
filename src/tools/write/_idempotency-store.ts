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
 *   - `MCP_REDIS_CONNECTION` set -> Redis/Valkey, shared across invocations.
 *   - unset                      -> in-process Map (stdio, local dev,
 *                                   self-hosted single-container deploys).
 *
 * Self-hosters and stdio users therefore keep working with no infrastructure
 * dependency, and get exactly the guarantee a single process can offer.
 */

/** How long a completed write result is remembered. */
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
 *   upstream HTTP timeout (45s)
 *     < Lambda timeout (55s)         so the app returns its own error
 *     < CLAIM_TTL (60s)              so a killed invocation's claim outlives it
 *     < CloudFront readTimeout (75s) so the edge surfaces the app's error
 *
 * All four moved together in the gpt-image-2 incident (2026-08-03). They are a
 * single unit: raising any one of them alone reintroduces the failure the
 * ordering exists to prevent. The two Lambda-side values live in
 * `viraly-cdk-serverless/aws-cdk/config/{prod,beta}-stack-props.json` as
 * `timeoutSeconds` and `originReadTimeoutSeconds`.
 */
export const CLAIM_TTL_MS = 60_000;

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

/** Serialized shape stored under each key. */
interface StoredEntry {
  state: 'running' | 'done';
  result?: unknown;
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

// ── Redis / Valkey store ────────────────────────────────────────────────────

/** Namespace so these keys never collide with the inbox rate limiter's. */
const KEY_PREFIX = 'mcp:dedupe:';

/**
 * Cross-invocation store backed by the shared Valkey cluster.
 *
 * Redis suits this better than a database would: `SET key value PX ttl NX` is a
 * single atomic claim, and expiry is enforced by the server rather than by
 * comparing timestamps on read, so there is no window in which a logically
 * expired entry is still visible.
 *
 * The client is created lazily and memoized on the instance, and the instance
 * itself lives at module scope, so the connection survives between invocations
 * in a warm execution environment.
 *
 * FAILURE POLICY: errors from `claim` propagate. If the cluster is unreachable
 * we cannot promise a retry will be deduped, and proceeding anyway would
 * produce exactly the duplicate post this store exists to prevent. Failing
 * before the upstream call is issued leaves no partial state. `complete` is
 * best effort by contrast, because by then the write has already succeeded and
 * losing the cache entry only weakens dedupe for the next 60s.
 */
export class RedisDedupeStore implements DedupeStore {
  private readonly connectionString: string;
  private clientPromise: Promise<RedisLike> | undefined;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async client(): Promise<RedisLike> {
    this.clientPromise ??= (async () => {
      const { Redis } = await import('ioredis');
      const { host, port, tls } = parseConnectionString(this.connectionString);
      return new Redis({
        host,
        port,
        ...(tls ? { tls: {} } : {}),
        // Fail fast rather than hanging an invocation that is already on a
        // deadline. A stuck connect here would burn the whole Lambda timeout.
        connectTimeout: 3_000,
        commandTimeout: 3_000,
        maxRetriesPerRequest: 2,
        // Do not connect during module init; the first command opens it. Read
        // only tool calls never touch this store, so they never pay for it.
        lazyConnect: true,
        keepAlive: 30_000,
      }) as unknown as RedisLike;
    })();
    return this.clientPromise;
  }

  async claim(key: string): Promise<ClaimOutcome> {
    const client = await this.client();
    const entry: StoredEntry = { state: 'running' };

    // NX is the atomic claim: exactly one concurrent caller receives 'OK'.
    const won = await client.set(
      KEY_PREFIX + key,
      JSON.stringify(entry),
      'PX',
      CLAIM_TTL_MS,
      'NX',
    );
    if (won === 'OK') return { kind: 'claimed' };

    // Lost the race, or a live result already exists. Find out which.
    return this.poll(key);
  }

  async complete(key: string, result: unknown): Promise<void> {
    const client = await this.client();
    const entry: StoredEntry = { state: 'done', result: result ?? null };
    await client.set(KEY_PREFIX + key, JSON.stringify(entry), 'PX', DONE_TTL_MS);
  }

  async abandon(key: string): Promise<void> {
    const client = await this.client();
    await client.del(KEY_PREFIX + key);
  }

  async poll(key: string): Promise<ClaimOutcome> {
    const client = await this.client();
    const raw = await client.get(KEY_PREFIX + key);
    // Absent means expired or abandoned, so the operation is free again.
    if (raw === null || raw === undefined) return { kind: 'claimed' };

    let entry: StoredEntry;
    try {
      entry = JSON.parse(raw) as StoredEntry;
    } catch {
      // Unparseable value: treat as free rather than deadlocking on it.
      return { kind: 'claimed' };
    }
    if (entry.state === 'done') return { kind: 'completed', result: entry.result };
    return { kind: 'in-flight' };
  }
}

/** Minimal structural type so the client's types are not needed at build time. */
interface RedisLike {
  set(key: string, value: string, px: 'PX', ttl: number, nx?: 'NX'): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

/**
 * Parse the StackExchange.Redis style connection string the platform publishes,
 * for example:
 *
 *   viraly-valkey-beta.xxx.cache.amazonaws.com:6379,abortConnect=false
 *   viraly-valkey.xxx.cache.amazonaws.com:6379,abortConnect=false,ssl=true
 *
 * This is the same `ValkeyConnectionString` CloudFormation export the .NET
 * Lambdas consume, so both fleets read one source of truth. It is NOT a
 * `redis://` URL and cannot be handed to a Node client directly.
 *
 * The `ssl` flag genuinely differs by environment: production Valkey has
 * transit encryption required, beta has it off.
 */
export function parseConnectionString(raw: string): {
  host: string;
  port: number;
  tls: boolean;
} {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const endpoint = parts[0] ?? '';
  const options = parts.slice(1);

  const lastColon = endpoint.lastIndexOf(':');
  const host = lastColon === -1 ? endpoint : endpoint.slice(0, lastColon);
  const port = lastColon === -1 ? 6379 : Number(endpoint.slice(lastColon + 1));

  if (!host) throw new Error(`Redis connection string has no host: "${raw}"`);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Redis connection string has an invalid port: "${raw}"`);
  }

  const tls = options.some((o) => {
    const [k, v] = o.split('=').map((s) => s.trim().toLowerCase());
    return k === 'ssl' && v === 'true';
  });

  return { host, port, tls };
}

// ── Selection ───────────────────────────────────────────────────────────────

let store: DedupeStore | undefined;

/**
 * Resolve the dedupe store from the environment. Evaluated once per process.
 */
export function getDedupeStore(): DedupeStore {
  if (!store) {
    const connection = process.env.MCP_REDIS_CONNECTION;
    store = connection ? new RedisDedupeStore(connection) : new MemoryDedupeStore();
  }
  return store;
}

/** Test-only: drop the memoized store so tests can swap implementations. */
export function __resetDedupeStoreForTests(next?: DedupeStore): void {
  store = next;
}
