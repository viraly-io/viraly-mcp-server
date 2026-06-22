import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// IMPORTANT: vi.mock is hoisted above all imports. Reach the mocked module via
// dynamic import inside `beforeEach` so each test can install a fresh impl.
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request as undiciRequest } from 'undici';

import { setConfig } from '../src/api/client-factory.js';
import { runWithTokenContext } from '../src/auth/token-context.js';
import { listRegisteredTools } from '../src/tools/registry.js';
import '../src/tools/index.js';

const mockedRequest = undiciRequest as unknown as ReturnType<typeof vi.fn>;

function findTool(name: string) {
  const tool = listRegisteredTools().find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function mockResponse(status: number, body: unknown): void {
  mockedRequest.mockResolvedValueOnce({
    statusCode: status,
    body: {
      text: async () => JSON.stringify(body),
    },
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

describe('list_channels', () => {
  it('forwards Authorization and maps DTOs', async () => {
    mockResponse(200, [
      { id: 'ch1', name: 'My IG', type: 'instagram', socialSetId: 'ss1', status: 'Active' },
      { id: 'ch2', name: 'My X', type: 'twitter', status: 'Locked' },
    ]);

    const tool = findTool('list_channels');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({}),
    );

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const [url, options] = mockedRequest.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test.viraly.io/api/platforms/channels');
    expect((options as { headers: Record<string, string> }).headers['Authorization']).toBe(
      'Bearer vat_abc',
    );

    expect(result).toEqual({
      count: 2,
      channels: [
        {
          id: 'ch1',
          name: 'My IG',
          platform: 'instagram',
          social_set_id: 'ss1',
          status: 'Active',
          is_locked: false,
          picture_url: undefined,
        },
        {
          id: 'ch2',
          name: 'My X',
          platform: 'twitter',
          social_set_id: undefined,
          status: 'Locked',
          is_locked: true,
          picture_url: undefined,
        },
      ],
    });
  });
});

describe('list_hashtag_groups', () => {
  it('maps topic->name and splits the hashtags string into an array', async () => {
    mockResponse(200, [
      {
        id: 'h1',
        topic: 'Launch',
        hashtags: '#viral #launch   #growth',
        socialSetId: 'ss1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const tool = findTool('list_hashtag_groups');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({}),
    );

    expect(result).toEqual({
      count: 1,
      groups: [
        {
          id: 'h1',
          name: 'Launch',
          social_set_id: 'ss1',
          hashtags: ['#viral', '#launch', '#growth'],
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
  });
});

describe('list_categories', () => {
  it('maps sortOrder->order and surfaces post_count, dropping phantom fields', async () => {
    mockResponse(200, [
      {
        id: 'c1',
        name: 'News',
        color: '#ff0000',
        sortOrder: 2,
        postCount: 7,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
      },
    ]);

    const tool = findTool('list_categories');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({}),
    );

    expect(result).toEqual({
      count: 1,
      categories: [
        {
          id: 'c1',
          name: 'News',
          color: '#ff0000',
          order: 2,
          post_count: 7,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        },
      ],
    });
  });
});

describe('get_post displayStatus mapping', () => {
  it('prefers displayStatus over the raw transient status', async () => {
    mockResponse(200, {
      id: 'p1',
      caption: 'hi',
      status: 'PublishingEnqueued',
      displayStatus: 'Scheduled',
      channelId: 'ch1',
      scheduledAt: '2026-05-01T10:00:00Z',
    });

    const tool = findTool('get_post');
    const result = (await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'p1' }),
    )) as Record<string, unknown>;

    expect(result.status).toBe('Scheduled');
  });
});

describe('get_workspace_info', () => {
  it('returns plan info', async () => {
    mockResponse(200, {
      id: 'tnt1',
      name: 'Acme Inc',
      plan: 'Business',
      status: 'Active',
      createdAt: '2025-06-01T00:00:00Z',
    });

    const tool = findTool('get_workspace_info');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({}),
    );

    expect(result).toEqual({
      id: 'tnt1',
      name: 'Acme Inc',
      plan: 'Business',
      status: 'Active',
      created_at: '2025-06-01T00:00:00Z',
    });
  });
});

describe('list_pending_posts', () => {
  it('queries with status=Scheduled and date filters', async () => {
    mockResponse(200, {
      items: [
        {
          id: 'p1',
          caption: 'Hello',
          status: 'Scheduled',
          channelId: 'ch1',
          config: { channelType: 'Instagram' },
          scheduledAt: '2026-05-01T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const tool = findTool('list_pending_posts');
    const result = await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ start_date: '2026-05-01', end_date: '2026-05-31', page: 1, per_page: 25 }),
    );

    const [url] = mockedRequest.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/platforms/posts/list');
    expect(parsed.searchParams.get('status')).toBe('Scheduled');
    expect(parsed.searchParams.get('startDate')).toBe('2026-05-01');
    expect(parsed.searchParams.get('endDate')).toBe('2026-05-31');
    expect(parsed.searchParams.get('sort')).toBe('ScheduledAt');
    expect(parsed.searchParams.get('order')).toBe('Asc');

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      per_page: 25,
      posts: [
        expect.objectContaining({
          id: 'p1',
          caption: 'Hello',
          status: 'Scheduled',
          platform: 'Instagram',
          scheduled_at: '2026-05-01T10:00:00Z',
        }),
      ],
    });
  });

  it('rejects malformed start_date', () => {
    const tool = findTool('list_pending_posts');
    expect(() => tool.inputSchema.parse({ start_date: '01/05/2026' })).toThrow();
  });
});

describe('get_post', () => {
  it('encodes the post id in the URL', async () => {
    mockResponse(200, { id: 'a/b' });
    const tool = findTool('get_post');
    await runWithTokenContext({ accessToken: 'vat_abc' }, async () =>
      tool.handler({ post_id: 'a/b' }),
    );
    const [url] = mockedRequest.mock.calls[0]!;
    expect(String(url)).toContain('/api/platforms/posts/a%2Fb');
  });
});

describe('list_media', () => {
  it('requires social_set_id and collection_id', () => {
    const tool = findTool('list_media');
    expect(() => tool.inputSchema.parse({})).toThrow();
    expect(() =>
      tool.inputSchema.parse({ social_set_id: 'ss1', collection_id: 'col1' }),
    ).not.toThrow();
  });
});
