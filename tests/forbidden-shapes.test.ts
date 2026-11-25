import { describe, expect, it } from 'vitest';
import { mapErrorResponse } from '../src/api/viraly-client.js';
import { ViralyApiError, ViralyPermissionError, ViralyScopeError } from '../src/api/errors.js';
import { formatToolError } from '../src/tools/registry.js';

// The three 403s the Viraly API answers (permissions program P7, reported by P9): a scope the token lacks, the access
// model's refusal, and a refusal with its own reason. Only the first is fixed by reconnecting.
describe('403 from the Viraly API', () => {
  it('names the scope the agent-tools route sends as missingScope', () => {
    const err = mapErrorResponse(403, { error: "This connection does not have the 'posts:write' scope.", missingScope: 'posts:write' });
    expect(err).toBeInstanceOf(ViralyScopeError);
    expect((err as ViralyScopeError).missingScope).toBe('posts:write');
    expect(formatToolError(err)).toContain('"posts:write" permission');
  });

  it('still reads required_scope', () => {
    const err = mapErrorResponse(403, { required_scope: 'media:write' });
    expect((err as ViralyScopeError).missingScope).toBe('media:write');
  });

  it('tells an access-model refusal (top level, P1) from a scope gap and names who can fix it', () => {
    const err = mapErrorResponse(403, { error: 'This needs the posts:publish permission.', code: 'insufficient_permissions', capability: 'posts:publish' });
    expect(err).toBeInstanceOf(ViralyPermissionError);
    expect((err as ViralyPermissionError).capability).toBe('posts:publish');
    const text = formatToolError(err);
    expect(text).toContain('"posts:publish" permission');
    expect(text).toContain('workspace Owner');
    expect(text).not.toContain('Reconnect Viraly and approve');
  });

  it('reads the public API shape nested under error', () => {
    const err = mapErrorResponse(403, { error: { code: 'insufficient_permissions', message: 'No publishing.', requestId: 'r1', capability: 'posts:publish' } });
    expect(err).toBeInstanceOf(ViralyPermissionError);
    expect(err.message).toBe('No publishing.');
  });

  it('passes any other 403 reason through instead of asking to reconnect', () => {
    const err = mapErrorResponse(403, { error: 'Only a member who can open every social set can change the workspace brief.' });
    expect(err).toBeInstanceOf(ViralyApiError);
    expect(err).not.toBeInstanceOf(ViralyScopeError);
    expect(formatToolError(err)).toBe('Viraly could not do that: Only a member who can open every social set can change the workspace brief.');
  });

  it('falls back to the unnamed scope message for a bare 403', () => {
    expect(mapErrorResponse(403, '')).toBeInstanceOf(ViralyScopeError);
  });
});
