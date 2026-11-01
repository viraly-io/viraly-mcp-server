// Rewrites the tool list in README.md from tools-catalog.json.
// Usage: node scripts/generate-readme.mjs [--check]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'tools-catalog.json');
const readmePath = join(root, 'README.md');
const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';
const ORDER = [
  'workspace', 'social_sets', 'channels', 'posts', 'categories', 'media', 'hashtags',
  'analytics', 'ai', 'inbox', 'bio_links', 'short_links', 'ideas', 'feeds', 'approvals', 'evergreen',
];
const RISK = { Read: 'read', ReversibleWrite: 'reversible write', AlwaysAsk: 'always ask' };

function fail(msg) {
  console.error(`generate-readme: ${msg}`);
  process.exit(1);
}

function lastChangeDate() {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'tools-catalog.json'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    if (out) return out;
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

function generate(tools, date) {
  const byModule = new Map();
  for (const t of tools) {
    if (!byModule.has(t.module)) byModule.set(t.module, []);
    byModule.get(t.module).push(t);
  }
  const rest = [...byModule.keys()].filter((m) => !ORDER.includes(m)).sort();
  const modules = [...ORDER.filter((m) => byModule.has(m)), ...rest];
  const lines = [`${tools.length} tools in the registry, catalog last changed ${date}.`, ''];
  for (const m of modules) {
    lines.push(`#### ${m}`, '', '| Tool | What it does | Scope | Risk | Undo |', '|---|---|---|---|---|');
    for (const t of byModule.get(m)) {
      lines.push(
        `| \`${t.name}\` | ${cell(t.description)} | \`${cell(t.scope)}\` | ${RISK[t.risk] ?? cell(t.risk)} | ${t.undoable ? 'yes' : ''} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

const tools = JSON.parse(readFileSync(catalogPath, 'utf8'));
const readme = readFileSync(readmePath, 'utf8');
const s = readme.indexOf(START);
const e = readme.indexOf(END);
if (s === -1 || e === -1 || e < s) fail(`README.md must contain ${START} and ${END} markers, in that order`);
const head = readme.slice(0, s + START.length);
const tail = readme.slice(e);
const current = readme.slice(s + START.length, e);
const next = `\n${generate(tools, lastChangeDate())}`;

if (process.argv.includes('--check')) {
  if (current !== next) fail('README.md tool list is out of date; run `npm run readme`');
  console.log('README.md tool list is up to date');
} else {
  writeFileSync(readmePath, head + next + tail);
  console.log(`README.md updated with ${tools.length} tools`);
}
