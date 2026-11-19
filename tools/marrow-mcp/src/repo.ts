import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk upward from `start` to the directory whose package.json declares workspaces. */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('could not find the repo root (no package.json with workspaces)');
    dir = parent;
  }
}

export type Loaded = { ok: true; value: unknown } | { ok: false; message: string };

/** Read a JSON file inside the repo. Paths outside the repo are refused. Never throws. */
export function readRepoJson(path: string, root: string): Loaded {
  const abs = isAbsolute(path) ? resolve(path) : resolve(root, path);
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return { ok: false, message: `cannot read file: ${path}` };
  }
  const rel = relative(realpathSync(root), real);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return { ok: false, message: `path is outside the repo: ${path}` };
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(real, 'utf8')) };
  } catch (e) {
    return { ok: false, message: `cannot read or parse ${path}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
