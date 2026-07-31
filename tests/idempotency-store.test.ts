import { describe, expect, it } from 'vitest';

import {
  CLAIM_TTL_MS,
  DONE_TTL_MS,
  MemoryDedupeStore,
  RedisDedupeStore,
  parseConnectionString,
} from '../src/tools/write/_idempotency-store.js';

describe('parseConnectionString', () => {
  // The platform publishes a StackExchange.Redis style string via the
  // ValkeyConnectionString CloudFormation export, NOT a redis:// URL. Both the
  // .NET fleet and this server read that same export.
  it('parses the beta form (transit encryption off)', () => {
    const r = parseConnectionString(
      'viraly-valkey-beta.pyyiob.ng.0001.use2.cache.amazonaws.com:6379,abortConnect=false',
    );
    expect(r.host).toBe('viraly-valkey-beta.pyyiob.ng.0001.use2.cache.amazonaws.com');
    expect(r.port).toBe(6379);
    expect(r.tls).toBe(false);
  });

  // Production Valkey has transit encryption REQUIRED while beta has it off.
  // Getting this wrong fails closed in prod only, which is the worst place to
  // discover it, so it is pinned here.
  it('parses the production form and enables TLS', () => {
    const r = parseConnectionString(
      'viraly-valkey.abc.ng.0001.use1.cache.amazonaws.com:6379,abortConnect=false,ssl=true',
    );
    expect(r.tls).toBe(true);
    expect(r.port).toBe(6379);
  });

  it('tolerates whitespace and mixed case in options', () => {
    expect(parseConnectionString('h:6379, SSL=True , abortConnect=false').tls).toBe(true);
  });

  it('does not enable TLS for ssl=false', () => {
    expect(parseConnectionString('h:6379,ssl=false').tls).toBe(false);
  });

  it('defaults the port when the endpoint has none', () => {
    expect(parseConnectionString('cache.internal').port).toBe(6379);
  });

  it('rejects a malformed port rather than silently defaulting', () => {
    expect(() => parseConnectionString('host:not-a-port')).toThrow(/invalid port/i);
  });
});

/** Minimal in-memory stand-in for ioredis, honouring NX and PX semantics. */
class FakeRedis {
  readonly store = new Map<string, { value: string; expiresAt: number }>();
  calls: string[] = [];

  async set(key: string, value: string, _px: 'PX', ttl: number, nx?: 'NX') {
    this.calls.push(`set ${key} ttl=${ttl}${nx ? ' NX' : ''}`);
    const existing = this.store.get(key);
    const live = existing && existing.expiresAt > Date.now();
    if (nx === 'NX' && live) return null;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
    return 'OK';
  }

  async get(key: string) {
    const e = this.store.get(key);
    if (!e || e.expiresAt <= Date.now()) return null;
    return e.value;
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
}

/** Build a RedisDedupeStore wired to a fake client. */
function redisStoreWith(fake: FakeRedis): RedisDedupeStore {
  const store = new RedisDedupeStore('host:6379');
  // Bypass the real client factory.
  (store as unknown as { clientPromise: Promise<unknown> }).clientPromise = Promise.resolve(fake);
  return store;
}

describe('RedisDedupeStore', () => {
  it('claims a free key with NX and the claim TTL', async () => {
    const fake = new FakeRedis();
    const store = redisStoreWith(fake);
    await expect(store.claim('k')).resolves.toEqual({ kind: 'claimed' });
    expect(fake.calls[0]).toContain('NX');
    expect(fake.calls[0]).toContain(`ttl=${CLAIM_TTL_MS}`);
  });

  it('namespaces keys so they cannot collide with the inbox rate limiter', async () => {
    const fake = new FakeRedis();
    await redisStoreWith(fake).claim('abc');
    expect([...fake.store.keys()][0]).toBe('mcp:dedupe:abc');
  });

  it('reports in-flight when another caller holds the claim', async () => {
    const fake = new FakeRedis();
    const a = redisStoreWith(fake);
    const b = redisStoreWith(fake);
    await a.claim('k');
    await expect(b.claim('k')).resolves.toEqual({ kind: 'in-flight' });
  });

  it('returns the completed result to a later caller instead of re-running', async () => {
    const fake = new FakeRedis();
    const a = redisStoreWith(fake);
    const b = redisStoreWith(fake);
    await a.claim('k');
    await a.complete('k', { id: 'post_1' });
    await expect(b.claim('k')).resolves.toEqual({
      kind: 'completed',
      result: { id: 'post_1' },
    });
  });

  it('uses the done TTL when recording a result', async () => {
    const fake = new FakeRedis();
    const store = redisStoreWith(fake);
    await store.complete('k', 1);
    expect(fake.calls.at(-1)).toContain(`ttl=${DONE_TTL_MS}`);
  });

  it('frees the key on abandon so a genuine retry re-executes', async () => {
    const fake = new FakeRedis();
    const a = redisStoreWith(fake);
    const b = redisStoreWith(fake);
    await a.claim('k');
    await a.abandon('k');
    await expect(b.claim('k')).resolves.toEqual({ kind: 'claimed' });
  });

  it('treats a missing entry as free', async () => {
    await expect(redisStoreWith(new FakeRedis()).poll('nope')).resolves.toEqual({
      kind: 'claimed',
    });
  });

  it('treats an unparseable entry as free rather than deadlocking on it', async () => {
    const fake = new FakeRedis();
    fake.store.set('mcp:dedupe:k', { value: 'not json', expiresAt: Date.now() + 60_000 });
    await expect(redisStoreWith(fake).poll('k')).resolves.toEqual({ kind: 'claimed' });
  });

  it('propagates connection errors from claim rather than proceeding undeduped', async () => {
    const store = new RedisDedupeStore('host:6379');
    (store as unknown as { clientPromise: Promise<unknown> }).clientPromise = Promise.resolve({
      set: () => Promise.reject(new Error('ECONNREFUSED')),
      get: () => Promise.reject(new Error('ECONNREFUSED')),
      del: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    // Failing here is deliberate: proceeding without a usable dedupe store is
    // how a retried schedule_post becomes a duplicate post.
    await expect(store.claim('k')).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('MemoryDedupeStore', () => {
  it('behaves like the Redis store for the same sequence', async () => {
    const store = new MemoryDedupeStore();
    await expect(store.claim('k')).resolves.toEqual({ kind: 'claimed' });
    await expect(store.claim('k')).resolves.toEqual({ kind: 'in-flight' });
    await store.complete('k', 'value');
    await expect(store.claim('k')).resolves.toEqual({ kind: 'completed', result: 'value' });
    await store.abandon('k');
    await expect(store.claim('k')).resolves.toEqual({ kind: 'claimed' });
  });
});
