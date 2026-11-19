import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$|\.setup\.ts$/.test(name) ? [path] : [];
  });
}

describe('network use (R12.4, R17.3)', () => {
  const files = sources(join(root, 'src'));

  it('never imports MediaPipe directly (marrow-core loads it lazily when the camera starts)', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/(from|import\()\s*['"]@mediapipe/);
  });

  it('makes no fetch, XHR or beacon calls of its own', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  });

  it('loads no external scripts, fonts or styles', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/(src|href)="https?:/);
    for (const f of files.filter((p) => p.endsWith('.css'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/@import|url\(\s*['"]?https?:/);
    }
  });
});
