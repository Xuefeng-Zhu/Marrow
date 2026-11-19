import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LandmarkSmoother } from './landmarkSmoother';
import { OneEuroFilter, type OneEuroOptions } from './oneEuro';
import type { Frame } from '../types';

const RUNS = { numRuns: 100 };

const config: fc.Arbitrary<OneEuroOptions> = fc.record({
  minCutoff: fc.double({ min: 0.01, max: 20, noNaN: true }),
  beta: fc.double({ min: 0, max: 50, noNaN: true }),
  dCutoff: fc.double({ min: 0.01, max: 20, noNaN: true }),
});
const val = fc.double({ min: -1e3, max: 1e3, noNaN: true });
/** Samples with strictly increasing t. */
const series = fc
  .array(fc.tuple(val, fc.integer({ min: 1, max: 200 })), { minLength: 1, maxLength: 60 })
  .map((xs) => {
    let t = 0;
    return xs.map(([v, dt]) => ({ v, t: (t += dt) }));
  });

function run(opts: OneEuroOptions, s: { v: number; t: number }[]): number[] {
  const f = new OneEuroFilter(opts);
  return s.map((p) => f.filter(p.v, p.t));
}

describe('OneEuroFilter unit cases', () => {
  it('returns the first sample unchanged', () => {
    expect(new OneEuroFilter().filter(0.37, 100)).toBe(0.37);
  });
  it('lags a step then converges', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    const first = f.filter(1, 33);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    let y = first;
    for (let t = 66; t < 5000; t += 33) y = f.filter(1, t);
    expect(y).toBeGreaterThan(0.999);
  });
  it('returns the previous output for repeated or decreasing t', () => {
    const f = new OneEuroFilter();
    f.filter(1, 100);
    const y = f.filter(2, 133);
    expect(f.filter(50, 133)).toBe(y);
    expect(f.filter(50, 120)).toBe(y);
    expect(Number.isFinite(f.filter(3, 166))).toBe(true);
  });
  it('returns NaN for NaN input and keeps state', () => {
    const a = new OneEuroFilter();
    const b = new OneEuroFilter();
    a.filter(1, 0);
    b.filter(1, 0);
    expect(a.filter(NaN, 33)).toBeNaN();
    expect(a.filter(2, 66)).toBe(b.filter(2, 66));
  });
  it('reset forgets state', () => {
    const f = new OneEuroFilter();
    f.filter(1, 0);
    f.filter(5, 33);
    f.reset();
    expect(f.filter(9, 40)).toBe(9);
  });
  it('rejects invalid configuration', () => {
    expect(() => new OneEuroFilter({ minCutoff: 0 })).toThrow(RangeError);
    expect(() => new OneEuroFilter({ beta: -1 })).toThrow(RangeError);
    expect(() => new OneEuroFilter({ dCutoff: NaN })).toThrow(RangeError);
  });
});

describe('OneEuroFilter properties', () => {
  it('P6 constant fixed point', () => {
    fc.assert(
      fc.property(config, val, fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 100 }), (opts, c, n, dt) => {
        const f = new OneEuroFilter(opts);
        for (let i = 0; i < n; i++) if (f.filter(c, i * dt) !== c) return false;
        return true;
      }),
      RUNS,
    );
  });

  it('P7 boundedness', () => {
    fc.assert(
      fc.property(config, series, (opts, s) => {
        const out = run(opts, s);
        let lo = Infinity;
        let hi = -Infinity;
        return out.every((y, i) => {
          lo = Math.min(lo, s[i]!.v);
          hi = Math.max(hi, s[i]!.v);
          return y >= lo && y <= hi;
        });
      }),
      RUNS,
    );
  });

  it('P8 finite with repeated or decreasing t, NaN only for NaN input', () => {
    const anyT = fc.array(
      fc.tuple(fc.oneof(val, fc.constant(NaN)), fc.integer({ min: -50, max: 200 })),
      { minLength: 1, maxLength: 60 },
    );
    fc.assert(
      fc.property(config, anyT, (opts, xs) => {
        const f = new OneEuroFilter(opts);
        let t = 0;
        return xs.every(([v, dt]) => {
          t += dt;
          const y = f.filter(v, t);
          if (y === Infinity || y === -Infinity) return false;
          return Number.isNaN(y) ? Number.isNaN(v) : true;
        });
      }),
      RUNS,
    );
  });

  it('P9 jitter reduction', () => {
    fc.assert(
      fc.property(config, val, fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 2, maxLength: 60 }), fc.integer({ min: 5, max: 100 }), (opts, c, noise, dt) => {
        const s = noise.map((n, i) => ({ v: c + n, t: i * dt }));
        const out = run(opts, s);
        const pp = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
        return pp(out) <= pp(s.map((p) => p.v));
      }),
      RUNS,
    );
  });

  it('P10 determinism', () => {
    fc.assert(
      fc.property(config, series, (opts, s) => {
        const a = run(opts, s);
        const b = run(opts, s);
        return a.length === b.length && a.every((y, i) => Object.is(y, b[i]));
      }),
      RUNS,
    );
  });
});

describe('LandmarkSmoother', () => {
  const frame = (t: number, x: number, vis = 0.9): Frame => ({
    t,
    landmarks: [{ x, y: x / 2, z: 0, visibility: vis }, { x: 1 - x, y: 0.5, z: 0.1, visibility: 0.2 }],
  });

  it('passes the first frame through and keeps t and visibility', () => {
    const s = new LandmarkSmoother();
    expect(s.smooth(frame(0, 0.3))).toEqual(frame(0, 0.3));
    const out = s.smooth(frame(33, 0.9, 0.77));
    expect(out.t).toBe(33);
    expect(out.landmarks[0]!.visibility).toBe(0.77);
    expect(out.landmarks[0]!.x).toBeGreaterThan(0.3);
    expect(out.landmarks[0]!.x).toBeLessThan(0.9);
  });

  it('keeps a constant pose constant', () => {
    const s = new LandmarkSmoother();
    for (let i = 0; i < 20; i++) expect(s.smooth(frame(i * 33, 0.4))).toEqual(frame(i * 33, 0.4));
  });

  it('reset restarts filtering', () => {
    const s = new LandmarkSmoother();
    s.smooth(frame(0, 0.1));
    s.smooth(frame(33, 0.9));
    s.reset();
    expect(s.smooth(frame(66, 0.5))).toEqual(frame(66, 0.5));
  });

  it('handles an empty frame', () => {
    expect(new LandmarkSmoother().smooth({ t: 5, landmarks: [] })).toEqual({ t: 5, landmarks: [] });
  });
});
