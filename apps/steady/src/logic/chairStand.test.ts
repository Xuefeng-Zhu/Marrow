import fc from 'fast-check';
import type { MarrowEvent } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { createChairStandCounter } from './chairStand';

const RUNS = { numRuns: 100 };

const rep = (t: number, count = 1): MarrowEvent => ({ type: 'rep', t, count, durationMs: 2000, phaseEntries: {} });
const phase = (t: number, to: string, from: string | null = null): MarrowEvent => ({ type: 'phase', t, from, to });

describe('chair stand counter unit cases', () => {
  it('counts reps inside the window', () => {
    const c = createChairStandCounter(0);
    [rep(2000), rep(4000), rep(30000)].forEach((e) => c.push(e));
    c.finish();
    expect(c.result()).toBe(3);
  });

  it('measures the window from startT', () => {
    const c = createChairStandCounter(5000);
    [rep(4000), rep(6000), rep(35000), rep(35001)].forEach((e) => c.push(e));
    c.finish();
    expect(c.result()).toBe(2);
  });

  it('ignores events after the window (R7.3)', () => {
    const c = createChairStandCounter(0);
    c.push(rep(10000));
    c.push(rep(30001));
    c.push(rep(31000));
    expect(c.closed).toBe(true);
    expect(c.result()).toBe(1);
  });

  it('adds 1 when the phase is standing at the end of the window (R7.2)', () => {
    const c = createChairStandCounter(0);
    c.push(rep(5000));
    c.push(phase(29000, 'standing', 'seated'));
    c.finish();
    expect(c.result()).toBe(2);
  });

  it('adds nothing when the phase is seated at the end', () => {
    const c = createChairStandCounter(0);
    c.push(phase(1000, 'standing'));
    c.push(rep(2000));
    c.push(phase(2000, 'seated'));
    c.finish();
    expect(c.result()).toBe(1);
  });

  it('setPhase works like a phase event', () => {
    const c = createChairStandCounter(0);
    c.setPhase('standing', 29500);
    c.finish();
    expect(c.result()).toBe(1);
  });

  it('uses the phase at the window end, not a later one', () => {
    const c = createChairStandCounter(0);
    c.push(phase(29000, 'standing'));
    c.push(phase(30500, 'seated'));
    expect(c.result()).toBe(1);
  });

  it('does not double count the stand in progress at the end: its rep arrives after the window', () => {
    const c = createChairStandCounter(0);
    c.push(rep(28000));
    c.push(phase(29000, 'standing'));
    c.push(phase(30400, 'seated'));
    c.push(rep(30400, 2));
    expect(c.result()).toBe(2);
  });

  it('finish is idempotent and freezes the result', () => {
    const c = createChairStandCounter(0);
    c.push(phase(29000, 'standing'));
    c.finish();
    c.finish();
    c.push(rep(29500));
    c.setPhase('seated', 29600);
    expect(c.result()).toBe(1);
  });
});

describe('standing bonus with fast cycles under minRepMs (finding: monotone count)', () => {
  it('a stand that was standing earlier but discarded as too fast never lowers the count', () => {
    const c = createChairStandCounter(0);
    const seen: number[] = [];
    const feed = (e: MarrowEvent) => {
      c.push(e);
      seen.push(c.result());
    };
    feed(rep(3000));
    feed(phase(29000, 'standing', 'seated'));
    // The user sits again 300 ms later. The engine drops this cycle (under minRepMs) so there is no rep event.
    feed(phase(29300, 'seated', 'standing'));
    c.finish();
    seen.push(c.result());
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(c.result()).toBe(1);
  });

  it('the bonus is not part of the live count, so reaching standing then closing never double counts', () => {
    const c = createChairStandCounter(0);
    c.push(rep(1000));
    c.push(phase(29500, 'standing'));
    expect(c.result()).toBe(1);
    c.finish();
    expect(c.result()).toBe(2);
  });
});

type Step = { kind: 'rep' | 'phase'; dt: number; to: string };
const stepArb = fc.record({
  kind: fc.constantFrom<'rep' | 'phase'>('rep', 'phase'),
  dt: fc.integer({ min: 0, max: 4000 }),
  to: fc.constantFrom('seated', 'standing'),
});

function build(startT: number, steps: Step[]): MarrowEvent[] {
  let t = startT - 500;
  return steps.map((s) => {
    t += s.dt;
    return s.kind === 'rep' ? rep(t) : phase(t, s.to);
  });
}

function reference(startT: number, windowMs: number, events: MarrowEvent[]): { reps: number; finalPhase: string | null } {
  const end = startT + windowMs;
  let reps = 0;
  let finalPhase: string | null = null;
  for (const e of events) {
    if (e.t > end) continue;
    if (e.type === 'rep' && e.t >= startT) reps++;
    if (e.type === 'phase') finalPhase = e.to;
  }
  return { reps, finalPhase };
}

const scenario = fc.tuple(fc.integer({ min: 0, max: 5000 }), fc.array(stepArb, { maxLength: 40 }));

describe('chair stand properties', () => {
  it('P9 count equals in-window reps plus one if the final phase is standing', () => {
    fc.assert(
      fc.property(scenario, ([startT, steps]) => {
        const events = build(startT, steps);
        const c = createChairStandCounter(startT);
        events.forEach((e) => c.push(e));
        c.finish();
        const ref = reference(startT, 30000, events);
        return c.result() === ref.reps + (ref.finalPhase === 'standing' ? 1 : 0);
      }),
      RUNS,
    );
  });

  it('P10 the running count never decreases', () => {
    fc.assert(
      fc.property(scenario, ([startT, steps]) => {
        const c = createChairStandCounter(startT);
        let prev = c.result();
        for (const e of build(startT, steps)) {
          c.push(e);
          if (c.result() < prev) return false;
          prev = c.result();
        }
        c.finish();
        return c.result() >= prev;
      }),
      RUNS,
    );
  });

  it('P11 events after the window never change the count', () => {
    fc.assert(
      fc.property(scenario, fc.array(stepArb, { maxLength: 10 }), ([startT, steps], late) => {
        const events = build(startT, steps);
        const a = createChairStandCounter(startT);
        events.forEach((e) => a.push(e));
        a.finish();
        const b = createChairStandCounter(startT);
        events.forEach((e) => b.push(e));
        b.finish();
        let t = startT + 30000;
        for (const s of late) {
          t += s.dt + 1;
          b.push(s.kind === 'rep' ? rep(t) : phase(t, s.to));
        }
        return a.result() === b.result();
      }),
      RUNS,
    );
  });

  it('P12 the count is between 0 and in-window reps plus one', () => {
    fc.assert(
      fc.property(scenario, ([startT, steps]) => {
        const events = build(startT, steps);
        const c = createChairStandCounter(startT);
        events.forEach((e) => c.push(e));
        c.finish();
        const { reps } = reference(startT, 30000, events);
        return c.result() >= 0 && c.result() <= reps + 1;
      }),
      RUNS,
    );
  });
});
