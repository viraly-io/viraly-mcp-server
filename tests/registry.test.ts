import { describe, expect, it } from 'vitest';

import { listRegisteredTools } from '../src/tools/registry.js';
// Side-effect import — registers all tools.
import '../src/tools/index.js';

describe('tool registry', () => {
  it('registers every Phase 3 read tool', () => {
    const names = listRegisteredTools().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_channels',
        'list_pending_posts',
        'list_published_posts',
        'list_drafts',
        'get_post',
        'get_post_analytics',
        'get_channel_analytics',
        'list_media',
        'list_media_collections',
        'list_pinterest_boards',
        'list_hashtag_groups',
        'list_categories',
        'get_workspace_info',
      ]),
    );
  });

  it('does not duplicate tool names', () => {
    const names = listRegisteredTools().map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every tool has a non-empty description', () => {
    for (const tool of listRegisteredTools()) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});
