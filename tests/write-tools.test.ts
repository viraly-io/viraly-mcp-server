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
import {
  __clearDedupeCacheForTests,
  deriveIdempotencyKey,
} from '../src/tools/write/_idempotency.js';

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
  // Pin the clock before the 2026-05/06 fixtures below so they read as future
  // times (the schedule/reschedule/update tools now reject past scheduled_at).
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
  // Writes are now wrapped in the in-process dedupe cache; clear it between
  // tests so cases that reuse identical inputs still issue a fresh call.
  __clearDedupeCacheForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
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

  // get_image_job lives under src/tools/write/ next to generate_image but is a
  // read: it polls a job and mutates nothing, so it counts on the read side.
  it('total tool count is 36 (21 read + 15 write)', () => {
    const tools = listRegisteredTools();
    expect(tools.length).toBe(36);
    expect(tools.filter((t) => !t.isWrite).length).toBe(21);
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

  it('rejects a past scheduled_at with a clear, actionable message (not the opaque API error)', async () => {
    const tool = findTool('schedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          channel_id: 'ch1',
          caption: 'hello',
          scheduled_at: '2025-01-01T12:00:00Z', // before the pinned 2026-01-01 clock
          add_to_queue: false,
          timezone: 'UTC',
          dry_run: false,
        }),
      ),
    ).rejects.toThrow(/in the past/i);
    // Must never reach the API — it's caught client-side.
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('does not block a past scheduled_at when add_to_queue=true (time is ignored)', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'hello',
        scheduled_at: '2025-01-01T12:00:00Z',
        add_to_queue: true,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    expect(mockedRequest).toHaveBeenCalledTimes(1);
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

  it('sends per-attachment alt text from the attachments input', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'pic',
        scheduled_at: '2026-05-01T12:00:00Z',
        attachments: [
          { id: 'att1', alt_text: 'A red bicycle leaning on a wall' },
          { id: 'att2' },
        ],
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.postAttachments).toEqual([
      { attachmentId: 'att1', order: 0, altText: 'A red bicycle leaning on a wall' },
      { attachmentId: 'att2', order: 1 },
    ]);
  });

  it('prefers attachments over attachment_ids when both are given', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'pic',
        scheduled_at: '2026-05-01T12:00:00Z',
        attachment_ids: ['legacy'],
        attachments: [{ id: 'att1', alt_text: 'desc' }],
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.postAttachments).toEqual([
      { attachmentId: 'att1', order: 0, altText: 'desc' },
    ]);
  });
});

describe('post_type placement', () => {
  it('schedule_post forwards post_type as the API postType enum string', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'story time',
        scheduled_at: '2026-05-01T12:00:00Z',
        attachment_ids: ['att1'],
        post_type: 'story',
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.postType).toBe('Story');
  });

  it('schedule_post defaults to Feed when post_type is omitted', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'plain post',
        scheduled_at: '2026-05-01T12:00:00Z',
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.postType).toBe('Feed');
  });

  it('create_draft forwards post_type', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('create_draft');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'reel draft',
        attachment_ids: ['att1'],
        post_type: 'reel',
        timezone: 'UTC',
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.postType).toBe('Reel');
  });

  it('update_post preserves the current story placement on a caption-only edit', async () => {
    // The API rebuilds the config from the caption on update; if the tool
    // didn't echo the placement, this edit would demote the story to a feed post.
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      config: {
        channelType: 'Instagram',
        instagram: { contentOptions: { postType: 'Story', systemPostType: 'PhotoStory' } },
      },
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1', caption: 'new caption', timezone: 'UTC' }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.postType).toBe('Story');
  });

  it('update_post preserves a YouTube Short placement on a caption-only edit', async () => {
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      config: {
        channelType: 'YouTube',
        youTube: { contentOptions: { postType: 'ShortVideo', systemPostType: 'ShortVideo' } },
      },
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1', caption: 'new caption', timezone: 'UTC' }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.postType).toBe('Short');
  });

  it('update_post keeps a future draft calendar date on a caption-only edit', async () => {
    // Regression: omitting scheduledAt on a SaveDraft update makes the API
    // reset the draft's planned date to "now".
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      scheduledAt: '2026-06-01T09:00:00Z',
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1', caption: 'new caption', timezone: 'UTC' }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.scheduleAction).toBe('SaveDraft');
    expect(body.scheduledAt).toBe('2026-06-01T09:00:00Z');
  });

  it('schedule_post forwards board_id as boardId for Pinterest', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        channel_id: 'ch1',
        caption: 'pin it',
        scheduled_at: '2026-05-01T12:00:00Z',
        attachment_ids: ['att1'],
        board_id: 'board42',
        add_to_queue: false,
        timezone: 'UTC',
        dry_run: false,
      }),
    );
    const [, options] = mockedRequest.mock.calls[0]!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.boardId).toBe('board42');
  });

  it('a 429 with retryAfterSeconds reads as a rate limit, not a plan limit', async () => {
    // The platform rate limiter and plan-quota exhaustion share status 429; only
    // the latter should tell the user to upgrade.
    mockResponse(429, { error: 'Too many requests. Please try again later.', retryAfterSeconds: 42 });
    const tool = findTool('schedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          channel_id: 'ch1',
          caption: 'hello',
          scheduled_at: '2026-05-01T12:00:00Z',
          add_to_queue: false,
          timezone: 'UTC',
          dry_run: false,
        }),
      ),
    ).rejects.toThrow(/Rate limited.*42 seconds/s);
  });

  it('update_post lets an explicit post_type override the current placement', async () => {
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      config: {
        channelType: 'Facebook',
        facebook: { contentOptions: { postType: 'Post', systemPostType: 'VideoPost' } },
      },
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1', post_type: 'reel', timezone: 'UTC' }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.postType).toBe('Reel');
  });
});

describe('update_post alt text', () => {
  it('preserves existing attachment alt text on a caption-only edit', async () => {
    // Regression: replacing attachments used to drop altText; a caption-only
    // edit (no attachments input) must echo back the post's existing alt text.
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      postAttachments: [{ attachment: { id: 'att1' }, order: 0, altText: 'A red bicycle' }],
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1', caption: 'new caption', timezone: 'UTC' }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.postAttachments).toEqual([
      { attachmentId: 'att1', order: 0, altText: 'A red bicycle' },
    ]);
  });

  it('sets new alt text via the attachments input', async () => {
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Draft',
      caption: 'old',
      postAttachments: [{ attachment: { id: 'att1' }, order: 0 }],
    });
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Draft' });
    const tool = findTool('update_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        post_id: 'p1',
        attachments: [{ id: 'att1', alt_text: 'Now described' }],
        timezone: 'UTC',
      }),
    );
    const [, putOptions] = mockedRequest.mock.calls[1]!;
    const body = JSON.parse((putOptions as { body: string }).body);
    expect(body.postAttachments).toEqual([
      { attachmentId: 'att1', order: 0, altText: 'Now described' },
    ]);
  });
});

describe('past-date scheduling guards', () => {
  it('reschedule_post rejects a past scheduled_at before hitting the API', async () => {
    const tool = findTool('reschedule_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          post_id: 'p1',
          scheduled_at: '2025-01-01T12:00:00Z',
          timezone: 'UTC',
        }),
      ),
    ).rejects.toThrow(/in the past/i);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('update_post rejects a past caller-supplied scheduled_at', async () => {
    // update_post GETs the current post first, then validates the new time.
    mockResponse(200, {
      id: 'p1',
      channelId: 'ch1',
      status: 'Scheduled',
      scheduledAt: '2026-05-01T00:00:00Z',
    });
    const tool = findTool('update_post');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({
          post_id: 'p1',
          scheduled_at: '2025-01-01T12:00:00Z',
          timezone: 'UTC',
        }),
      ),
    ).rejects.toThrow(/in the past/i);
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

  it('rejects IPv6 loopback ::1 and unspecified ::', () => {
    expect(() => assertSafeMediaUrl('https://[::1]/x')).toThrow(MediaUrlError);
    expect(() => assertSafeMediaUrl('https://[::]/x')).toThrow(MediaUrlError);
  });

  it('rejects IPv4-mapped IPv6 to AWS metadata (dotted-quad form)', () => {
    expect(() => assertSafeMediaUrl('https://[::ffff:169.254.169.254]/latest/meta-data/')).toThrow(
      MediaUrlError,
    );
  });

  it('rejects IPv4-mapped IPv6 to private ranges (dotted-quad form)', () => {
    expect(() => assertSafeMediaUrl('https://[::ffff:10.0.0.1]/x')).toThrow(MediaUrlError);
    expect(() => assertSafeMediaUrl('https://[::ffff:192.168.0.1]/x')).toThrow(MediaUrlError);
    expect(() => assertSafeMediaUrl('https://[::ffff:127.0.0.1]/x')).toThrow(MediaUrlError);
  });

  it('rejects IPv4-mapped IPv6 in hex form (::ffff:a9fe:a9fe = 169.254.169.254)', () => {
    expect(() => assertSafeMediaUrl('https://[::ffff:a9fe:a9fe]/x')).toThrow(MediaUrlError);
    // ::ffff:c0a8:0001 = 192.168.0.1
    expect(() => assertSafeMediaUrl('https://[::ffff:c0a8:0001]/x')).toThrow(MediaUrlError);
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

describe('get_url_preview SSRF guard', () => {
  it('rejects metadata endpoint before calling the API', async () => {
    const tool = findTool('get_url_preview');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({ url: 'https://169.254.169.254/latest/meta-data/' }),
      ),
    ).rejects.toThrow(/Refusing to fetch/);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('rejects IPv4-mapped IPv6 metadata target before calling the API', async () => {
    const tool = findTool('get_url_preview');
    await expect(
      runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
        tool.handler({ url: 'https://[::ffff:169.254.169.254]/latest/meta-data/' }),
      ),
    ).rejects.toThrow(/Refusing to fetch/);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('allows a public https URL', async () => {
    mockResponse(200, { url: 'https://example.com', isSuccess: true, title: 'Example' });
    const tool = findTool('get_url_preview');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ url: 'https://example.com' }),
    );
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ url: 'https://example.com', success: true, title: 'Example' });
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

describe('write dedupe (retries do not duplicate upstream writes)', () => {
  it('schedule_post with identical inputs issues only one upstream call', async () => {
    mockResponse(200, { id: 'p1', channelId: 'ch1', status: 'Scheduled' });
    mockResponse(200, { id: 'p2', channelId: 'ch1', status: 'Scheduled' });
    const tool = findTool('schedule_post');
    const args = {
      channel_id: 'ch1',
      caption: 'dedupe me',
      scheduled_at: '2026-05-01T12:00:00Z',
      add_to_queue: false,
      timezone: 'UTC',
      dry_run: false,
    };
    const first = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ ...args }),
    );
    const second = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ ...args }),
    );
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('upload_media with identical inputs issues only one upstream call', async () => {
    mockResponse(200, { id: 'att1', info: { url: 'https://cdn/x.jpg' }, type: 'Photo' });
    mockResponse(200, { id: 'att2', info: { url: 'https://cdn/y.jpg' }, type: 'Photo' });
    const tool = findTool('upload_media');
    const args = { url: 'https://example.com/x.jpg', social_set_id: 'ss1' };
    const first = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ ...args }),
    );
    const second = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ ...args }),
    );
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});

describe('generate_image', () => {
  it('starts a job on the async endpoint and forwards plan-relevant fields', async () => {
    mockResponse(202, { id: 'job1', status: 'Pending', prompt: 'a cat' });
    const tool = findTool('generate_image');
    const result = (await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({
        prompt: 'a cat',
        aspect_ratio: 'portrait',
        quality: 'hd',
        use_brand_palette: false,
      }),
    )) as Record<string, unknown>;

    const [url, options] = mockedRequest.mock.calls[0]!;
    expect(String(url)).toContain('/api/platforms/ai/generate-image-async');
    const body = JSON.parse((options as { body: string }).body);
    expect(body).toEqual({
      prompt: 'a cat',
      aspectRatio: 'portrait',
      quality: 'hd',
      useBrandPalette: false,
    });

    // The tool must hand back a job handle, never an attachment: the image does
    // not exist yet when this returns.
    expect(result.job_id).toBe('job1');
    expect(result.status).toBe('Pending');
    expect(result.attachment_id).toBeUndefined();
    expect(String(result.next_step)).toContain('get_image_job');
  });
});

describe('get_image_job', () => {
  it('polls the job endpoint and nudges the model to wait while running', async () => {
    mockResponse(200, { id: 'job1', status: 'Running', prompt: 'a cat' });
    const tool = findTool('get_image_job');
    const result = (await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ job_id: 'job1' }),
    )) as Record<string, unknown>;

    const [url, options] = mockedRequest.mock.calls[0]!;
    expect(String(url)).toContain('/api/platforms/ai/image-jobs/job1');
    expect((options as { method: string }).method).toBe('GET');
    expect(result.status).toBe('Running');
    expect(String(result.next_step)).toContain('Wait');
  });

  it('flattens the attachment once the job succeeds and stops nudging', async () => {
    mockResponse(200, {
      id: 'job1',
      status: 'Succeeded',
      attachment: {
        id: 'att1',
        type: 'Photo',
        info: { url: 'https://cdn/x.png', width: 1024, height: 1536 },
        thumbnails: { medium: { url: 'https://cdn/x-m.png' } },
      },
    });
    const tool = findTool('get_image_job');
    const result = (await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ job_id: 'job1' }),
    )) as Record<string, unknown>;

    expect(result.attachment_id).toBe('att1');
    expect(result.url).toBe('https://cdn/x.png');
    expect(result.thumbnail_url).toBe('https://cdn/x-m.png');
    expect(result.width).toBe(1024);
    expect(result.next_step).toBeUndefined();
  });

  it('surfaces the failure reason on a failed job', async () => {
    mockResponse(200, {
      id: 'job1',
      status: 'Failed',
      errorCode: 'prompt-rejected',
      errorMessage: "We couldn't generate an image for that prompt.",
    });
    const tool = findTool('get_image_job');
    const result = (await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ job_id: 'job1' }),
    )) as Record<string, unknown>;

    expect(result.status).toBe('Failed');
    expect(result.error_code).toBe('prompt-rejected');
    expect(result.attachment_id).toBeUndefined();
    expect(result.next_step).toBeUndefined();
  });
});
