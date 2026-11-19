import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vitest runs each workspace from its own folder (apps/steady).
const css = readFileSync(join(process.cwd(), 'src', 'global.css'), 'utf8');

function tokens(source: string): Record<string, string> {
  const root = /:root\s*{([^}]*)}/.exec(source)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const t = tokens(css);

describe('theme tokens (R15.2)', () => {
  it('defines the tokens used below', () => {
    for (const name of ['bg', 'surface', 'text', 'muted', 'accent', 'accent-text', 'focus']) {
      expect(t[name], name).toBeDefined();
    }
  });

  it('computes known contrast ratios correctly', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  const sevenToOne: [string, string][] = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['accent-text', 'accent'],
    ['accent', 'bg'],
    ['accent', 'surface'],
  ];
  it.each(sevenToOne)('%s on %s is at least 7:1', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(7);
  });

  const fourPointFive: [string, string][] = [
    ['focus', 'bg'],
    ['focus', 'surface'],
  ];
  it.each(fourPointFive)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the 18px body size and 3rem touch targets', () => {
    expect(t['font-size']).toBe('1.125rem');
    expect(/\.btn\s*{[^}]*min-height:\s*3rem/.test(css)).toBe(true);
  });

  it('turns animation off for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
