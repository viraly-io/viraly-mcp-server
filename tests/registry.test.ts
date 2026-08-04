import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { listRegisteredTools, registerAllTools } from '../src/tools/registry.js';
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

  // The SDK calls registerCapabilities({ tools: { listChanged: true } }) inside
  // every registerTool, so this reverts the moment the override in
  // registerAllTools is dropped, reordered after connect, or lost in an SDK
  // upgrade. Nothing else would fail: the server would simply resume promising
  // a notification it has no channel to send.
  it('does not advertise tools.listChanged, which it cannot deliver', () => {
    const server = new McpServer({ name: 'viraly-test', version: '0.0.0' });
    registerAllTools(server);

    // getCapabilities() is what the initialize response reports to a client.
    const caps = server.server.getCapabilities();
    expect(caps.tools).toBeDefined();
    expect(caps.tools?.listChanged).toBe(false);
  });
});
