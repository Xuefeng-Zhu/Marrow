import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isValidAngle, kneeFlexion, selectPeak } from './rom';

const RUNS = { numRuns: 100 };
const anyNumber = fc.oneof(
  fc.double({ noNaN: false }),
  fc.constantFrom(NaN, Infinity, -Infinity, -1, 181, 0, 180),
  fc.integer({ min: -50, max: 250 }),
);
const validAngle = fc.double({ min: 0, max: 180, noNaN: true });

describe('isValidAngle', () => {
  it('accepts 0 to 180 inclusive and rejects the rest', () => {
    expect([0, 90, 180, 179.9].every(isValidAngle)).toBe(true);
    expect([NaN, Infinity, -Infinity, -0.1, 180.1].some(isValidAngle)).toBe(false);
  });
});

describe('kneeFlexion', () => {
  it('converts a joint angle to flexion', () => {
    expect(kneeFlexion(180)).toBe(0);
    expect(kneeFlexion(60)).toBe(120);
  });
});

describe('selectPeak unit cases', () => {
  it('returns null for empty input', () => expect(selectPeak([])).toBeNull());
  it('returns null when only NaN or out-of-range values exist', () => {
    expect(selectPeak([NaN, Infinity, -5, 200])).toBeNull();
  });
  it('picks the max of the valid values', () => expect(selectPeak([10, NaN, 150, 400, 90])).toBe(150));
  it('accepts the bounds', () => expect(selectPeak([0, 180])).toBe(180));
});

describe('selectPeak properties', () => {
  it('P1 equals the max of the valid values, or null', () => {
    fc.assert(
      fc.property(fc.array(anyNumber), (xs) => {
        const valid = xs.filter(isValidAngle);
        const peak = selectPeak(xs);
        if (valid.length === 0) return peak === null;
        return peak === Math.max(...valid) && valid.every((v) => peak >= v);
      }),
      RUNS,
    );
  });

  it('P2 ignores invalid values', () => {
    const invalid = fc.constantFrom(NaN, Infinity, -Infinity, -0.5, 180.5, 1e9, -1e9);
    fc.assert(
      fc.property(fc.array(anyNumber), fc.array(invalid), (xs, bad) => {
        expect(selectPeak([...xs, ...bad])).toBe(selectPeak(xs));
      }),
      RUNS,
    );
  });

  it('P3 is the same for permutations and duplicates', () => {
    fc.assert(
      fc.property(fc.array(anyNumber), fc.infiniteStream(fc.nat()), (xs, _s) => {
        const reversed = [...xs].reverse();
        const sorted = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const peak = selectPeak(xs);
        return selectPeak(reversed) === peak && selectPeak(sorted) === peak && selectPeak([...xs, ...xs]) === peak;
      }),
      RUNS,
    );
  });

  it('P3 holds for arbitrary shuffles', () => {
    fc.assert(
      fc.property(
        fc.array(anyNumber).chain((xs) => fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length }))),
        ([xs, shuffled]) => selectPeak(xs) === selectPeak(shuffled),
      ),
      RUNS,
    );
  });

  it('P4 adding a valid value never lowers the peak', () => {
    fc.assert(
      fc.property(fc.array(anyNumber), validAngle, (xs, v) => {
        const before = selectPeak(xs);
        const after = selectPeak([...xs, v]);
        return after !== null && (before === null || after >= before);
      }),
      RUNS,
    );
  });
});

describe('kneeFlexion properties', () => {
  it('P5 is 180 - a, stays in 0..180 and strictly decreases in a', () => {
    fc.assert(
      fc.property(validAngle, validAngle, (a, b) => {
        const f = kneeFlexion(a);
        const inRange = f === 180 - a && f >= 0 && f <= 180;
        const decreasing = b - a < 1e-6 || kneeFlexion(a) > kneeFlexion(b);
        return inRange && decreasing;
      }),
      RUNS,
    );
  });
});
