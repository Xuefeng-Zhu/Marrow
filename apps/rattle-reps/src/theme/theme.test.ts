// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, TOKENS, contrastRatio } from './tokens';

const css = readFileSync(fileURLToPath(new URL('../global.css', import.meta.url)), 'utf8');

describe('theme tokens (R16.1, R19.1, R19.2)', () => {
  it('global.css defines every token with the same value as tokens.ts', () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });

  it.each(CONTRAST_PAIRS)('$fg on $bg has at least $min:1', ({ fg, bg, min }) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min);
  });

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('sets 44 px targets, a focus ring and a reduced-motion query', () => {
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('the live counter is at least 6rem and uses no external fonts or URLs', () => {
    expect(css).toMatch(/--display-size:\s*clamp\(6rem/);
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/@import|@font-face/);
  });
});
