import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { asymmetryPct, describeAsymmetry } from './asymmetry';

const RUNS = { numRuns: 100 };
const nonNeg = fc.double({ min: 0, max: 1e6, noNaN: true });

describe('asymmetry unit cases', () => {
  it('is 0 for equal sides and for two zeros', () => {
    expect(asymmetryPct(120, 120)).toBe(0);
    expect(asymmetryPct(0, 0)).toBe(0);
  });
  it('is 100 when one side is zero', () => expect(asymmetryPct(0, 80)).toBe(100));
  it('computes |a-b| / max * 100', () => expect(asymmetryPct(140, 160)).toBeCloseTo(12.5, 10));
  it('is 0 for non-finite input', () => expect(asymmetryPct(NaN, 5)).toBe(0));
});

describe('describeAsymmetry', () => {
  it('names the larger side with one decimal', () => {
    expect(describeAsymmetry(140, 160)).toEqual({ pct: 12.5, larger: 'right', text: 'Right is 12.5% larger.' });
    expect(describeAsymmetry(160, 140).larger).toBe('left');
  });
  it('reports equal sides', () => {
    expect(describeAsymmetry(100, 100)).toMatchObject({ pct: 0, larger: 'equal' });
    expect(describeAsymmetry(0, 0).larger).toBe('equal');
  });
  it('never uses judging words', () => {
    expect(describeAsymmetry(10, 90).text).not.toMatch(/abnormal|normal|fail|pass|risk/i);
  });
});

describe('asymmetry properties', () => {
  it('P6 is symmetric', () => {
    fc.assert(fc.property(nonNeg, nonNeg, (a, b) => asymmetryPct(a, b) === asymmetryPct(b, a)), RUNS);
  });
  it('P7 is in 0..100 and 0 when equal', () => {
    fc.assert(
      fc.property(nonNeg, nonNeg, (a, b) => {
        const p = asymmetryPct(a, b);
        return p >= 0 && p <= 100 && asymmetryPct(a, a) === 0;
      }),
      RUNS,
    );
  });
  it('P8 is scale invariant', () => {
    const value = fc.oneof(fc.constant(0), fc.double({ min: 0.001, max: 1e3, noNaN: true }));
    fc.assert(
      fc.property(value, value, fc.double({ min: 0.001, max: 1e3, noNaN: true }), (a, b, k) => {
        return Math.abs(asymmetryPct(k * a, k * b) - asymmetryPct(a, b)) < 1e-6;
      }),
      RUNS,
    );
  });
});
