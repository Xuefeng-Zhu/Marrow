import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { findRepoRoot } from './repo';

const repoRoot = findRepoRoot();

const dir = resolve(repoRoot, 'powers/marrow-movements');
const read = (p: string) => readFileSync(resolve(dir, p), 'utf8');

it('plugin.json has required fields and keywords', () => {
  const m = JSON.parse(read('plugin.json'));
  expect(m.name).toBe('marrow-movements');
  expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(typeof m.description).toBe('string');
  expect(m.keywords).toEqual(expect.arrayContaining(['movement', 'rep counter', 'pose', 'exercise', 'range of motion']));
});

it('SKILL.md has name and description front matter', () => {
  const text = read('skills/author-movement/SKILL.md');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  expect(fm).toMatch(/^name: author-movement$/m);
  expect(fm).toMatch(/^description: .+$/m);
  expect(existsSync(resolve(dir, 'README.md'))).toBe(true);
});

it('mcp.json defines a marrow server whose entry point source exists', () => {
  const m = JSON.parse(read('mcp.json'));
  const s = m.mcpServers.marrow;
  expect(s.command).toBe('node');
  const entry = s.args[0] as string;
  expect(entry).toBe('tools/marrow-mcp/dist/index.js');
  // dist is a build output; require its source so the test passes before build.
  expect(existsSync(resolve(repoRoot, entry.replace('/dist/index.js', '/src/index.ts')))).toBe(true);
});
