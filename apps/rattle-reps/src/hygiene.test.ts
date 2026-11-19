// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`],
  );
}

const files = [...walk(`${root}src/`), ...walk(`${root}scripts/`)].filter(
  (f) => /\.(ts|tsx|js|mjs)$/.test(f) && f !== SELF,
);

// Built from parts so that this file does not match its own patterns.
const PKG = ['marrow', 'core'].join('-');
const SUBPATH = new RegExp(`['"\`]${PKG}/`);

describe('core import hygiene (R4.5, R4.6, R20.2)', () => {
  it('scans the source and script files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no file imports a sub-path of the core package', () => {
    const offenders = files.filter((f) => SUBPATH.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(root.length))).toEqual([]);
  });
});
