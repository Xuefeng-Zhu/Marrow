import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createPromptGate } from './prompts';

describe('createPromptGate', () => {
  it('allows the first offer', () => {
    expect(createPromptGate().offer('Raise your arm', 0)).toBe(true);
  });

  it('blocks the same text within 4 seconds and allows it at 4 seconds', () => {
    const g = createPromptGate();
    expect(g.offer('a', 1000)).toBe(true);
    expect(g.offer('a', 4999)).toBe(false);
    expect(g.offer('a', 5000)).toBe(true);
  });

  it('measures the gap from the last allowed offer, not from blocked ones', () => {
    const g = createPromptGate();
    g.offer('a', 0);
    expect(g.offer('a', 3000)).toBe(false);
    expect(g.offer('a', 4000)).toBe(true);
  });

  it('does not block different text', () => {
    const g = createPromptGate();
    expect(g.offer('a', 0)).toBe(true);
    expect(g.offer('b', 10)).toBe(true);
  });

  it('never allows the same text twice within the gap (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom('a', 'b', 'c'), fc.integer({ min: 0, max: 600 })), { maxLength: 60 }),
        (offers) => {
          const g = createPromptGate(4000);
          let t = 0;
          const allowed = new Map<string, number[]>();
          for (const [text, dt] of offers) {
            t += dt * 10;
            if (g.offer(text, t)) allowed.set(text, [...(allowed.get(text) ?? []), t]);
          }
          for (const times of allowed.values()) {
            for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(4000);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
