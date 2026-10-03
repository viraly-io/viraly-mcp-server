/**
 * The release gate of the server's version (media ingest package 15, item 6): both transports report the version in
 * package.json, the one clients see in `initialize`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;

/** The version a transport's server declares, read from its source. */
function declaredVersion(source: string): string | null {
  const match = source.match(/version:\s*'([^']+)'/);
  return match ? match[1] : null;
}

describe('the server version', () => {
  for (const transport of ['src/transport/http.ts', 'src/transport/stdio.ts']) {
    it(`${transport} reports package.json's version`, () => {
      const source = readFileSync(join(root, transport), 'utf8');
      expect(declaredVersion(source)).toBe(pkgVersion);
    });
  }

  it('fails a planted mismatch (the control)', () => {
    const planted = readFileSync(join(root, 'src/transport/http.ts'), 'utf8').replace(/version:\s*'[^']+'/, "version: '0.0.0-planted'");
    expect(declaredVersion(planted)).not.toBe(pkgVersion);
  });
});
