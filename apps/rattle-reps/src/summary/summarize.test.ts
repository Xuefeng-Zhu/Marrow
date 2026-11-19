import type { MarrowEvent } from 'marrow-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarize } from './summarize';

type Ev<T extends MarrowEvent['type']> = Extract<MarrowEvent, { type: T }>;

const rep = (t: number, count: number, durationMs = 500): Ev<'rep'> => ({
  type: 'rep',
  t,
  count,
  durationMs,
  phaseEntries: {},
});
const warn = (t: number, ruleId = 'r1', message = 'msg'): Ev<'form:warning'> => ({
  type: 'form:warning',
  t,
  ruleId,
  message,
  value: 0,
});
const hStart = (t: number): Ev<'hold:start'> => ({ type: 'hold:start', t, holdId: 'h' });
const hEnd = (t: number, durationMs: number, reason: 'released' | 'lost-pose' = 'released'): Ev<'hold:end'> => ({
  type: 'hold:end',
  t,
  holdId: 'h',
  durationMs,
  reason,
});

const repWorkout = { id: 'squat', kind: 'reps' } as const;
const holdWorkout = { id: 'plank', kind: 'hold' } as const;

describe('summarize examples (reps)', () => {
  const events = [rep(1000, 1), rep(2000, 2), rep(3000, 3), rep(4000, 4)];

  it('counts clean reps with no warnings', () => {
    const s = summarize({ workout: repWorkout, events, startT: 0, stopT: 4500 });
    expect(s).toMatchObject({ reps: 4, cleanReps: 4, cleanPct: 100, holdMs: 0, tutMs: 2000, warnings: [] });
  });

  it('attributes a warning at the set start to the first rep', () => {
    const s = summarize({ workout: repWorkout, events: [warn(0), ...events], startT: 0, stopT: 4500 });
    expect(s.cleanReps).toBe(3);
    expect(s.cleanPct).toBe(75);
  });

  it('attributes a warning at a rep time to that rep and not the next', () => {
    const s = summarize({ workout: repWorkout, events: [...events, warn(2000)], startT: 0, stopT: 4500 });
    expect(s.cleanReps).toBe(3);
    const s2 = summarize({ workout: repWorkout, events: [warn(2001), ...events], startT: 0, stopT: 4500 });
    expect(s2.cleanReps).toBe(3);
  });

  it('ignores a warning after the last rep for cleanReps but tallies it', () => {
    const s = summarize({ workout: repWorkout, events: [...events, warn(4200)], startT: 0, stopT: 4500 });
    expect(s.cleanReps).toBe(4);
    expect(s.warnings).toEqual([{ ruleId: 'r1', message: 'msg', count: 1 }]);
  });

  it('returns 0 and no clean reps when there are no reps', () => {
    const s = summarize({ workout: repWorkout, events: [], startT: 0, stopT: 100 });
    expect(s).toMatchObject({ reps: 0, cleanReps: 0, cleanPct: 0, tutMs: 0 });
  });

  it('groups warnings by rule, count descending then rule id', () => {
    const s = summarize({
      workout: repWorkout,
      events: [warn(1, 'b', 'B1'), warn(2, 'a', 'A1'), warn(3, 'b', 'B2'), warn(4, 'c', 'C1'), warn(5, 'c', 'C2'), warn(6, 'c')],
      startT: 0,
      stopT: 10,
    });
    expect(s.warnings).toEqual([
      { ruleId: 'c', message: 'C1', count: 3 },
      { ruleId: 'b', message: 'B1', count: 2 },
      { ruleId: 'a', message: 'A1', count: 1 },
    ]);
  });
});

describe('summarize examples (holds)', () => {
  it('is 100% for a clean hold and counts holdMs and TUT', () => {
    const s = summarize({
      workout: holdWorkout,
      events: [hStart(0), hEnd(20000, 20000)],
      startT: 0,
      stopT: 20000,
    });
    expect(s).toMatchObject({ kind: 'hold', reps: 0, holdMs: 20000, tutMs: 20000, cleanPct: 100 });
  });

  it('clips the penalty to the measured hold: lost-pose example gives 83 and not 17', () => {
    const s = summarize({
      workout: holdWorkout,
      events: [hStart(0), warn(1000), hEnd(2000, 1200, 'lost-pose')],
      startT: 0,
      stopT: 2000,
    });
    expect(s.holdMs).toBe(1200);
    expect(s.cleanPct).toBe(83);
  });

  it('adds no dirty time for a warning after start + durationMs but still tallies it', () => {
    const s = summarize({
      workout: holdWorkout,
      events: [hStart(0), warn(1500), hEnd(2000, 1200, 'lost-pose')],
      startT: 0,
      stopT: 2000,
    });
    expect(s.cleanPct).toBe(100);
    expect(s.warnings[0]?.count).toBe(1);
  });

  it('closes an open hold at the stop time', () => {
    const s = summarize({ workout: holdWorkout, events: [hStart(500), warn(1000)], startT: 0, stopT: 3000 });
    expect(s.holdMs).toBe(2500);
    expect(s.tutMs).toBe(2500);
    expect(s.cleanPct).toBe(Math.round((100 * (2500 - 2000)) / 2500));
  });

  it('never counts negative time for an open hold after stop', () => {
    const s = summarize({ workout: holdWorkout, events: [hStart(5000)], startT: 0, stopT: 3000 });
    expect(s.holdMs).toBe(0);
    expect(s.cleanPct).toBe(0);
  });

  it('merges overlapping penalty windows', () => {
    const s = summarize({
      workout: holdWorkout,
      events: [hStart(0), warn(1000), warn(2000), hEnd(10000, 10000)],
      startT: 0,
      stopT: 10000,
    });
    expect(s.cleanPct).toBe(70);
  });
});

// Independent oracles. Times are integers in ms.
interface RepCase {
  startT: number;
  stopT: number;
  reps: { t: number; durationMs: number }[];
  warnings: number[];
}

const repCase = fc
  .record({
    startT: fc.integer({ min: 0, max: 100 }),
    gaps: fc.array(fc.integer({ min: 1, max: 500 }), { maxLength: 12 }),
    durations: fc.array(fc.integer({ min: 0, max: 900 }), { minLength: 12, maxLength: 12 }),
    warnOffsets: fc.array(fc.integer({ min: -100, max: 7000 }), { maxLength: 8 }),
  })
  .map(({ startT, gaps, durations, warnOffsets }): RepCase => {
    let t = startT;
    const reps = gaps.map((g, i) => {
      t += g;
      return { t, durationMs: durations[i]! };
    });
    return { startT, stopT: t + 100, reps, warnings: warnOffsets.map((o) => startT + o) };
  });

function repEvents(c: RepCase): MarrowEvent[] {
  return c.reps.map((r, i) => rep(r.t, i + 1, r.durationMs));
}

function oracleClean(c: RepCase, warnings: readonly number[]): number {
  let clean = 0;
  c.reps.forEach((r, i) => {
    const lo = i === 0 ? c.startT : c.reps[i - 1]!.t;
    const dirty = warnings.some((w) => (i === 0 ? w >= lo : w > lo) && w <= r.t);
    if (!dirty) clean += 1;
  });
  return clean;
}

function run(c: RepCase, warnings: readonly number[] = c.warnings) {
  const events = [...repEvents(c), ...warnings.map((w) => warn(w))].sort((a, b) => a.t - b.t || (a.type === 'rep' ? -1 : 1));
  return summarize({ workout: repWorkout, events, startT: c.startT, stopT: c.stopT });
}

describe('summarize properties (reps)', () => {
  it('P1 rep count, matches the oracle clean count', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const s = run(c);
        expect(s.reps).toBe(c.reps.length);
        expect(s.cleanReps).toBe(oracleClean(c, c.warnings));
      }),
    );
  });

  it('P2 bounds', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const s = run(c);
        expect(s.cleanReps).toBeGreaterThanOrEqual(0);
        expect(s.cleanReps).toBeLessThanOrEqual(s.reps);
        expect(Number.isInteger(s.cleanPct)).toBe(true);
        expect(s.cleanPct).toBeGreaterThanOrEqual(0);
        expect(s.cleanPct).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('P3 no warnings means all clean', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const s = run(c, []);
        expect(s.cleanReps).toBe(s.reps);
        if (s.reps > 0) expect(s.cleanPct).toBe(100);
      }),
    );
  });

  it('P4 and P5 an added warning never helps and removes at most one clean rep', () => {
    fc.assert(
      fc.property(repCase, fc.integer({ min: -100, max: 7000 }), (c, off) => {
        const w = c.startT + off;
        const before = run(c);
        const after = run(c, [...c.warnings, w]);
        expect(after.cleanReps).toBeLessThanOrEqual(before.cleanReps);
        expect(before.cleanReps - after.cleanReps).toBeLessThanOrEqual(1);
        expect(after.cleanPct).toBeLessThanOrEqual(before.cleanPct);
        const last = c.reps[c.reps.length - 1];
        if (w < c.startT || (last && w > last.t) || !last) expect(after.cleanReps).toBe(before.cleanReps);
      }),
    );
  });

  it('P6 a warning in every window leaves no clean rep', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const all = c.reps.map((r) => r.t);
        const s = run(c, all);
        expect(s.cleanReps).toBe(0);
      }),
    );
  });

  it('P7 TUT is the sum of rep durations and ignores warning order', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const a = run(c);
        const b = run(c, [...c.warnings].reverse());
        expect(a.tutMs).toBe(c.reps.reduce((n, r) => n + r.durationMs, 0));
        expect(a.tutMs).toBeGreaterThanOrEqual(0);
        expect(b.tutMs).toBe(a.tutMs);
        expect(b.cleanReps).toBe(a.cleanReps);
        expect(b.cleanPct).toBe(a.cleanPct);
      }),
    );
  });

  it('P8 is pure: same result twice and inputs unchanged', () => {
    fc.assert(
      fc.property(repCase, (c) => {
        const events = [...repEvents(c), ...c.warnings.map((w) => warn(w))];
        const snapshot = structuredClone(events);
        const input = { workout: repWorkout, events, startT: c.startT, stopT: c.stopT };
        const a = summarize(input);
        const b = summarize(input);
        expect(a).toEqual(b);
        expect(events).toEqual(snapshot);
      }),
    );
  });

  it('P11 grouped counts add up to the number of warning events', () => {
    fc.assert(
      fc.property(repCase, fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 15 }), (c, rules) => {
        const events = [...repEvents(c), ...rules.map((r, i) => warn(i * 10, r))];
        const s = summarize({ workout: repWorkout, events, startT: c.startT, stopT: c.stopT });
        expect(s.warnings.reduce((n, w) => n + w.count, 0)).toBe(rules.length);
      }),
    );
  });
});

interface HoldCase {
  holds: { start: number; durationMs: number; endExtra: number; lost: boolean }[];
  open: boolean;
  stopT: number;
  warnings: number[];
}

const holdCase = fc
  .record({
    parts: fc.array(
      fc.record({
        gap: fc.integer({ min: 0, max: 500 }),
        durationMs: fc.integer({ min: 0, max: 3000 }),
        endExtra: fc.integer({ min: 0, max: 400 }),
        lost: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    open: fc.boolean(),
    openGap: fc.integer({ min: 0, max: 500 }),
    tail: fc.integer({ min: -200, max: 3000 }),
    warnings: fc.array(fc.integer({ min: 0, max: 9000 }), { maxLength: 6 }),
  })
  .map(({ parts, open, openGap, tail, warnings }): HoldCase => {
    let t = 0;
    const holds = parts.map((p) => {
      const start = t + p.gap;
      const endExtra = p.lost ? p.endExtra : 0;
      t = start + p.durationMs + endExtra;
      return { start, durationMs: p.durationMs, endExtra, lost: p.lost };
    });
    const openStart = t + openGap;
    const events: HoldCase = { holds, open, stopT: (open ? openStart : t) + tail, warnings };
    if (open) events.holds.push({ start: openStart, durationMs: -1, endExtra: 0, lost: false });
    return events;
  });

function holdEvents(c: HoldCase, warnings: readonly number[]): MarrowEvent[] {
  const evs: MarrowEvent[] = [];
  for (const h of c.holds) {
    evs.push(hStart(h.start));
    if (h.durationMs >= 0) evs.push(hEnd(h.start + h.durationMs + h.endExtra, h.durationMs, h.lost ? 'lost-pose' : 'released'));
  }
  return [...evs, ...warnings.map((w) => warn(w))];
}

/** Millisecond-by-millisecond oracle. */
function oracleHold(c: HoldCase, warnings: readonly number[]) {
  let total = 0;
  let dirty = 0;
  for (const h of c.holds) {
    const end = h.durationMs >= 0 ? h.start + h.durationMs : Math.max(h.start, c.stopT);
    const ws = warnings.filter((w) => w >= h.start && w <= end);
    for (let m = h.start; m < end; m++) {
      total += 1;
      if (ws.some((w) => w <= m && m < w + 2000)) dirty += 1;
    }
  }
  return { total, dirty };
}

function runHold(c: HoldCase, warnings: readonly number[] = c.warnings) {
  return summarize({ workout: holdWorkout, events: holdEvents(c, warnings), startT: 0, stopT: c.stopT });
}

describe('summarize properties (holds)', () => {
  it('P9 and P9b hold clean share matches the ms oracle and uses [start, start + durationMs]', () => {
    fc.assert(
      fc.property(holdCase, (c) => {
        const s = runHold(c);
        const o = oracleHold(c, c.warnings);
        expect(s.holdMs).toBe(o.total);
        expect(s.cleanPct).toBe(o.total > 0 ? Math.round((100 * (o.total - o.dirty)) / o.total) : 0);
        expect(s.cleanPct).toBeGreaterThanOrEqual(0);
        expect(s.cleanPct).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('P9 is 100 with no warnings (when there is hold time) and warnings never raise it', () => {
    fc.assert(
      fc.property(holdCase, fc.integer({ min: 0, max: 9000 }), (c, w) => {
        const clean = runHold(c, []);
        if (clean.holdMs > 0) expect(clean.cleanPct).toBe(100);
        const before = runHold(c);
        const after = runHold(c, [...c.warnings, w]);
        expect(after.cleanPct).toBeLessThanOrEqual(before.cleanPct);
      }),
    );
  });

  it('P10 an open hold counts stop - start, never negative, and TUT equals holdMs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: -2000, max: 5000 }), (start, delta) => {
        const s = summarize({ workout: holdWorkout, events: [hStart(start)], startT: 0, stopT: start + delta });
        expect(s.holdMs).toBe(Math.max(0, delta));
        expect(s.tutMs).toBe(s.holdMs);
      }),
    );
  });

  it('P11 grouped counts add up for holds too', () => {
    fc.assert(
      fc.property(holdCase, (c) => {
        const s = runHold(c);
        expect(s.warnings.reduce((n, w) => n + w.count, 0)).toBe(c.warnings.length);
      }),
    );
  });
});
