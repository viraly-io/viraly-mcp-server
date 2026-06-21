import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request as undiciRequest } from 'undici';

import { setConfig } from '../src/api/client-factory.js';
import { runWithTokenContext } from '../src/auth/token-context.js';
import { listRegisteredTools } from '../src/tools/registry.js';
import '../src/tools/index.js';
import { assertSafeMediaUrl, MediaUrlError } from '../src/tools/write/_url-guard.js';
import { deriveIdempotencyKey } from '../src/tools/write/_idempotency.js';

const mockedRequest = undiciRequest as unknown as ReturnType<typeof vi.fn>;

function findTool(name: string) {
  const tool = listRegisteredTools().find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function mockResponse(status: number, body: unknown): void {
  mockedRequest.mockResolvedValueOnce({
    statusCode: status,
    body: { text: async () => JSON.stringify(body) },
  });
}

beforeEach(() => {
  setConfig({
    transport: 'http',
    port: 8080,
    publicOrigin: 'https://mcp.test.viraly.io',
    viralyApiOrigin: 'https://api.test.viraly.io',
    oauthIssuer: 'https://api.test.viraly.io',
    corsAllowedOrigins: [],
    logLevel: 'warn',
    rateLimitPerMinute: 300,
  });
  mockedRequest.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('write tools registered', () => {
  it('all 7 Phase 4 write tools are present', () => {
    const names = listRegisteredTools()
      .filter((t) => t.isWrite)
      .map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'schedule_post',
        'update_post',
        'cancel_post',
        'create_draft',
        'upload_media',
        'generate_image',
        'generate_caption',
      ]),
    );
  });

  it('the post-Phase-4 write tools are also present', () => {
    const names = listRegisteredTools()
      .filter((t) => t.isWrite)
      .map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'reschedule_post',
        'publish_post_now',
        'generate_hashtags',
        'update_social_set_timezone',
        'trigger_analytics_sync',
        'export_analytics_csv',
        'get_url_preview',
        'disconnect_channel',
      ]),
    );
  });

  it('total tool count is 33 (18 read + 15 write)', () => {
    const tools = listRegisteredTools();
    expect(tools.length).toBe(33);
    expect(tools.filter((t) => !t.isWrite).length).toBe(18);
    expect(tools.filter((t) => t.isWrite).length).toBe(15);
  });
});

describe('schedule_post', () => {
  it('rejects when neither scheduled_at nor add_to_queue is provided', async () => {
    const tool = findTool('schedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          channel_id: 'ch1',
          caption: 'hello',
          add_to_queue: false,
          timezone: 'UTC',
          dry_run: false,
        }),
      ),
    ).rejects.toThrow();
  });

  it('dry_run does not call the API', async () => {
    const tool = findTool('schedule_post');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'hello',
        scheduled_at: '2026-05-01T12:00:00Z',
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: true,
      }),
    );
    expect(mockedRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dry_run: true,
      would_create: expect.objectContaining({
        channel_id: 'ch1',
        caption: 'hello',
      }),
      idempotency_key: expect.any(String),
    });
  });

  it('forwards the Idempotency-Key header on real submissions', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'hello',
        scheduled_at: '2026-05-01T12:00:00Z',
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const headers = (options as { headers: Record<string, string> }).headers;
    expect(headers['Idempotency-Key']).toBeDefined();
    expect(headers['Idempotency-Key']).toMatch(/^[a-f0-9]{32}$/);
  });

  it('normalizes offset datetimes to UTC Z before sending', async () => {
    // Non-Z offsets parse to DateTimeKind.Local in the .NET API and crash
    // TimeZoneInfo.ConvertTimeFromUtc with a 500 (PostService.FindMatchingSlotAsync).
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'hello',
        scheduled_at: '2026-06-12T15:00:00+02:00',
        add_to_queue: false,
        timezone: 'Europe/Skopje',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.scheduledAt).toBe('2026-06-12T13:00:00.000Z');
  });

  it('surfaces the API validation errors[] verbatim so the model can fix and retry', async () => {
    // The API returns media/caption validation failures as { errors: [...] }; the model
    // must see the actionable text, not a generic "Upstream returned 400".
    mockResponse(400, {
      statusCode: 400,
      errors: [
        'Image aspect ratio must be between 3:4 and 1.91:1.',
        'Instagram allows a maximum of 5 hashtags per post. Found 8.',
      ],
    });
    const tool = findTool('schedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          channel_id: 'ch1',
          caption: 'hello',
          scheduled_at: '2026-05-01T12:00:00Z',
          attachment_ids: ['att1'],
          add_to_queue: false,
          timezone: 'UTC',
          dry_run: false,
        }),
      ),
    ).rejects.toThrow(/aspect ratio.*maximum of 5 hashtags/s);
  });

  it('prefers errors[] over the generic top-level message', async () => {
    // The Platform API always sets message to the generic "Bad Request"; the real reasons
    // are in errors[]. The model must get the reasons, not "Bad Request".
    mockResponse(400, {
      statusCode: 400,
      message: 'Bad Request',
      errors: ['Video file size can\'t exceed 512MB - Found 700.00MB.'],
    });
    const tool = findTool('schedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          channel_id: 'ch1',
          caption: 'hi',
          scheduled_at: '2026-05-01T12:00:00Z',
          attachment_ids: ['att1'],
          add_to_queue: false,
          timezone: 'UTC',
          dry_run: false,
        }),
      ),
    ).rejects.toThrow(/Video file size can't exceed 512MB/);
  });

  it('add_to_queue routes to AddToQueue ScheduleAction', async () => {
    mockResponse(200, { id: 'p1' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'queued',
        add_to_queue: true,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.scheduleAction).toBe('AddToQueue');
  });
});

describe('cancel_post', () => {
  it('issues DELETE to the right path', async () => {
    mockResponse(204, null);
    const tool = findTool('cancel_post');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'abc' }),
    );
    const [url, options] = mockedRequest.mock.calls[0]!;
    expect((options as { method: string }).method).toBe('DELETE');
    expect(String(url)).toContain('/api/platforms/posts/abc');
    expect(result).toEqual({ post_id: 'abc', cancelled: true });
  });
});

describe('upload_media SSRF guard', () => {
  it('accepts public https URL', () => {
    expect(() => assertSafeMediaUrl('https://example.com/photo.jpg')).not.toThrow();
  });

  it('rejects http://10.x.x.x', () => {
    expect(() => assertSafeMediaUrl('http://10.0.0.1/x')).toThrow(MediaUrlError);
  });

  it('rejects http://192.168.x.x', () => {
    expect(() => assertSafeMediaUrl('https://192.168.1.5/x')).toThrow(MediaUrlError);
  });

  it('rejects http://127.x.x.x', () => {
    expect(() => assertSafeMediaUrl('https://127.0.0.1/x')).toThrow(MediaUrlError);
  });

  it('rejects http://169.254.169.254 (AWS metadata)', () => {
    expect(() => assertSafeMediaUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
      MediaUrlError,
    );
  });

  it('rejects metadata.google.internal', () => {
    expect(() => assertSafeMediaUrl('https://metadata.google.internal/')).toThrow(MediaUrlError);
  });

  it('rejects ftp://', () => {
    expect(() => assertSafeMediaUrl('ftp://example.com/x')).toThrow(MediaUrlError);
  });

  it('rejects all http URLs (only https accepted)', () => {
    expect(() => assertSafeMediaUrl('http://example.com/x')).toThrow(MediaUrlError);
    expect(() => assertSafeMediaUrl('http://localhost/x')).toThrow(MediaUrlError);
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(() => assertSafeMediaUrl('https://[fe80::1]/x')).toThrow(MediaUrlError);
  });

  it('upload_media tool rejects private IP at handler level', async () => {
    const tool = findTool('upload_media');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({ url: 'https://10.0.0.5/x.jpg', social_set_id: 'ss1' }),
      ),
    ).rejects.toThrow(/Refusing to fetch/);
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});

describe('idempotency key derivation', () => {
  it('same inputs → same key', () => {
    const a = deriveIdempotencyKey('schedule_post', { channel_id: 'ch1', caption: 'hi' });
    const b = deriveIdempotencyKey('schedule_post', { caption: 'hi', channel_id: 'ch1' }); // key order swapped
    expect(a).toBe(b);
  });

  it('different inputs → different keys', () => {
    const a = deriveIdempotencyKey('schedule_post', { channel_id: 'ch1', caption: 'hi' });
    const b = deriveIdempotencyKey('schedule_post', { channel_id: 'ch1', caption: 'bye' });
    expect(a).not.toBe(b);
  });

  it('explicit key is honored', () => {
    const a = deriveIdempotencyKey('schedule_post', { channel_id: 'ch1' }, 'EXPLICIT');
    expect(a).toBe('EXPLICIT');
  });
});

describe('generate_image', () => {
  it('forwards plan-relevant fields', async () => {
    mockResponse(200, { id: 'att1', url: 'https://cdn/x.png', type: 'Photo' });
    const tool = findTool('generate_image');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        prompt: 'a cat',
        aspect_ratio: 'portrait',
        quality: 'hd',
        use_brand_palette: false,
      }),
    );
    const [url, options] = mockedRequest.mock.calls[0]!;
    expect(String(url)).toContain('/api/platforms/ai/generate-image');
    const body = JSON.parse((options as { body: string }).body);
    expect(body).toEqual({
      prompt: 'a cat',
      aspectRatio: 'portrait',
      quality: 'hd',
      useBrandPalette: false,
    });
  });
});
