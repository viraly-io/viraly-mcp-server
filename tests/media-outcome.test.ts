/**
 * Media ingest review, entry point 43 (package 15, item 5; defects D7 and D9): the MCP server's media tools retry
 * through the same row and report the row's outcome. upload_media reads the row (GET /api/platforms/media/{id}
 * ?wait=true) until it is Completed or Failed within its budget, answers ready only for Completed and failed with the
 * code for Failed (never the processor's message), and a call with the same arguments is the read of the same upload.
 * get_image_job answers a job whose row is Failed as failed at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request as undiciRequest } from 'undici';

import { setConfig } from '../src/api/client-factory.js';
import { runWithTokenContext } from '../src/auth/token-context.js';
import { listRegisteredTools } from '../src/tools/registry.js';
import '../src/tools/index.js';
import { __clearDedupeCacheForTests } from '../src/tools/write/_idempotency.js';

const mockedRequest = undiciRequest as unknown as ReturnType<typeof vi.fn>;

function findTool(name: string) {
  const tool = listRegisteredTools().find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

/** Answers each upstream call by its method and path, recording every call. */
function routeUpstream(route: (method: string, path: string) => { status: number; body: unknown } | Error) {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = [];
  mockedRequest.mockImplementation(async (url: string, options: { method: string; headers: Record<string, string> }) => {
    const u = new URL(url);
    const path = u.pathname + u.search;
    calls.push({ method: options.method, path, headers: options.headers });
    const answer = route(options.method, path);
    if (answer instanceof Error) throw answer;
    return { statusCode: answer.status, body: { text: async () => JSON.stringify(answer.body) } };
  });
  return calls;
}

const call = (name: string, input: Record<string, unknown>) =>
  runWithTokenContext({ accessToken: 'vat_abc' }, async () => findTool(name).handler(input)) as Promise<Record<string, unknown>>;

const URL_INPUT = { url: 'https://cdn.example.com/clip.mp4', social_set_id: 'ss1' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  setConfig({
    transport: 'http',
    port: 8080,
    publicOrigin: 'https://mcp.test.viraly.io',
    viralyApiOrigin: 'https://api.test.viraly.io',
    oauthIssuer: 'https://api.test.viraly.io',
    corsAllowedOrigins: [],
    logLevel: 'warn',
  });
  mockedRequest.mockReset();
  __clearDedupeCacheForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('upload_media reads the row', () => {
  it('reads an Uploading answer until the row is Completed, and only then is it ready', async () => {
    let reads = 0;
    const calls = routeUpstream((method, path) => {
      if (method === 'POST') return { status: 200, body: { id: 'att1', status: 'Uploading', type: 'Video' } };
      reads++;
      return { status: 200, body: { id: 'att1', status: reads < 2 ? 'Processing' : 'Completed', type: 'Video' } };
    });

    const result = await call('upload_media', URL_INPUT);

    const readCalls = calls.filter((c) => c.method === 'GET');
    expect(readCalls.length).toBeGreaterThanOrEqual(1);
    expect(readCalls[0].path).toBe('/api/platforms/media/att1?wait=true');
    expect(result.status).toBe('Completed');
    expect(result.ready).toBe(true);
    expect(result.failed).toBe(false);
  });

  it('answers a Failed row as failed with its code, never the processor\'s message', async () => {
    routeUpstream((method) => {
      if (method === 'POST') return { status: 200, body: { id: 'att2', status: 'Failed', type: 'Video' } };
      return {
        status: 200,
        body: {
          id: 'att2', status: 'Failed', type: 'Video',
          error: { code: 'corrupt_media', message: 'https://bucket.s3.amazonaws.com/x.mp4?X-Amz-Security-Token=abc: Invalid data' },
        },
      };
    });

    const result = await call('upload_media', URL_INPUT);
    const text = JSON.stringify(result);

    expect(result.ready).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.error_code).toBe('corrupt_media');
    expect(text).not.toContain('X-Amz');
    expect(text).not.toContain('https://bucket');
    expect(String(result.next_step)).toContain('idempotency_key');
  });

  it('answers a row still in flight at its budget with the same-arguments next step', async () => {
    routeUpstream((method) => {
      if (method === 'POST') return { status: 200, body: { id: 'att3', status: 'Uploading', type: 'Video' } };
      return { status: 200, body: { id: 'att3', status: 'Processing', type: 'Video' } };
    });

    const pending = call('upload_media', URL_INPUT);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(result.ready).toBe(false);
    expect(result.failed).toBe(false);
    expect(String(result.next_step)).toMatch(/upload_media again with the same arguments/);
  });

  it('reads the row afresh on a repeat inside the dedupe cache', async () => {
    let done = false;
    const calls = routeUpstream((method) => {
      if (method === 'POST') return { status: 200, body: { id: 'att4', status: 'Uploading', type: 'Video' } };
      return { status: 200, body: { id: 'att4', status: done ? 'Completed' : 'Processing', type: 'Video' } };
    });

    // Inside the dedupe cache's 60 s: the second call finds the create's answer there.
    const first = call('upload_media', URL_INPUT);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await first).ready).toBe(false);

    done = true;
    const second = await call('upload_media', URL_INPUT);

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(second.ready).toBe(true);
  });

  it('tells the model to call again with the same arguments when the create timed out', async () => {
    routeUpstream(() => Object.assign(new Error('Headers Timeout Error'), { name: 'HeadersTimeoutError' }));

    await expect(call('upload_media', URL_INPUT)).rejects.toThrow(/same arguments/);
  });

  it('sends the derived Idempotency-Key on the create (the control)', async () => {
    const calls = routeUpstream((method) => {
      if (method === 'POST') return { status: 200, body: { id: 'att5', status: 'Completed', type: 'Photo' } };
      return { status: 200, body: { id: 'att5', status: 'Completed', type: 'Photo' } };
    });

    await call('upload_media', URL_INPUT);

    const create = calls.find((c) => c.method === 'POST');
    expect(create?.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('get_image_job reads the row', () => {
  it('answers a Succeeded job whose row is Failed as failed at once', async () => {
    const calls = routeUpstream(() => ({
      status: 200,
      body: { id: 'job1', status: 'Succeeded', attachment: { id: 'att6', type: 'Photo', status: 'Failed', info: {} } },
    }));

    const pending = call('get_image_job', { job_id: 'job1' });
    await vi.advanceTimersByTimeAsync(41_000);
    const result = await pending;

    expect(calls).toHaveLength(1);
    expect(result.ready).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.next_step).toBeUndefined();
  });
});

describe('get_media_requirements', () => {
  it('no longer says Viraly does not always measure', () => {
    expect(findTool('get_media_requirements').description).not.toMatch(/does not always measure/);
  });
});
