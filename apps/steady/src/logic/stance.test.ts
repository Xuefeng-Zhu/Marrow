import fc from 'fast-check';
import type { MarrowEvent } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { createStanceTimer, type StanceStop } from './stance';

const RUNS = { numRuns: 100 };
const CAP = 30000;

const start = (t: number): MarrowEvent => ({ type: 'hold:start', t, holdId: 'stance' });
const tick = (t: number, elapsedMs: number): MarrowEvent => ({ type: 'hold:tick', t, holdId: 'stance', elapsedMs });
const end = (t: number, reason: 'released' | 'lost-pose'): MarrowEvent => ({
  type: 'hold:end', t, holdId: 'stance', durationMs: 0, reason,
});
const sway = (t: number, ruleId = 'sway-limit'): MarrowEvent => ({ type: 'form:warning', t, ruleId, message: 'Steady yourself', value: 0.3 });

function run(events: MarrowEvent[], cap?: number) {
  const timer = createStanceTimer(cap);
  events.forEach((e) => timer.push(e));
  return timer;
}

describe('stance timer unit cases', () => {
  it('has no result before hold:start', () => {
    const t = run([sway(500), end(900, 'released')]);
    expect(t.result()).toBeNull();
    expect(t.state.status).toBe('waiting');
  });

  it('runs after hold:start and reports elapsed from ticks', () => {
    const t = run([start(1000), tick(2000, 1000)]);
    expect(t.state).toMatchObject({ status: 'running', startT: 1000, elapsedMs: 1000 });
    expect(t.result()).toBeNull();
  });

  it('stops on released and rounds down to one decimal', () => {
    const t = run([start(1000), end(14570, 'released')]);
    expect(t.result()).toEqual({ seconds: 13.5, reason: 'released' });
  });

  it('stops on lost-pose', () => {
    expect(run([start(0), end(4200, 'lost-pose')]).result()).toEqual({ seconds: 4.2, reason: 'lost-pose' });
  });

  it('stops on a sway warning after the start', () => {
    expect(run([start(1000), sway(9300)]).result()).toEqual({ seconds: 8.3, reason: 'sway' });
  });

  it('ignores warnings of other rules', () => {
    expect(run([start(1000), sway(2000, 'other')]).result()).toBeNull();
  });

  it('stops at the 30 second cap', () => {
    expect(run([start(1000), tick(31000, 30000)]).result()).toEqual({ seconds: 30, reason: 'cap' });
    expect(run([start(1000), end(40000, 'released')]).result()).toEqual({ seconds: 30, reason: 'cap' });
  });

  it('supports a custom cap', () => {
    expect(run([start(0), tick(5000, 5000)], 5000).result()).toEqual({ seconds: 5, reason: 'cap' });
  });

  it('stopByUser ends a running timer', () => {
    const t = run([start(1000)]);
    t.stopByUser(6040);
    expect(t.result()).toEqual({ seconds: 5, reason: 'user' });
    expect(t.state.status).toBe('stopped');
  });

  it('stopByUser before hold:start gives no result and a late hold:start is ignored', () => {
    const t = createStanceTimer();
    t.stopByUser(500);
    t.push(start(600));
    expect(t.result()).toBeNull();
    expect(t.state.status).toBe('stopped');
  });

  it('does not change after the stop (R8.6)', () => {
    const t = run([start(1000), end(5000, 'released'), sway(6000), end(7000, 'lost-pose'), tick(8000, 7000)]);
    t.stopByUser(9000);
    expect(t.result()).toEqual({ seconds: 4, reason: 'released' });
  });
});

describe('early sway warning (finding: warning before hold:start)', () => {
  // The engine emits hold:start about 500 ms after the lift time it carries, so a warning can come first.
  it('a sway warning seen before hold:start, at or after the lift time, stops the timer with reason sway', () => {
    const t = run([sway(1300), start(1000)]);
    expect(t.state.status).toBe('stopped');
    expect(t.result()).toEqual({ seconds: 0.3, reason: 'sway' });
  });

  it('the earliest buffered warning wins', () => {
    expect(run([sway(1400), sway(1200), start(1000)]).result()).toEqual({ seconds: 0.2, reason: 'sway' });
  });

  it('a warning from before the lift time is ignored', () => {
    const t = run([sway(900), start(1000)]);
    expect(t.state.status).toBe('running');
    expect(t.result()).toBeNull();
  });

  it('later events do not change the early sway result', () => {
    const t = run([sway(1300), start(1000), end(5000, 'released')]);
    expect(t.result()).toEqual({ seconds: 0.3, reason: 'sway' });
  });

  it('a warning for another rule is not buffered', () => {
    expect(run([sway(1300, 'other'), start(1000)]).result()).toBeNull();
  });
});

type Raw =
  | { k: 'tick' | 'swayWarn' | 'otherWarn' | 'released' | 'lost' | 'start'; dt: number; lag: number };

const rawArb = fc.record({
  k: fc.constantFrom<Raw['k']>('tick', 'swayWarn', 'otherWarn', 'released', 'lost', 'start'),
  dt: fc.integer({ min: 0, max: 8000 }),
  lag: fc.integer({ min: 0, max: 500 }),
});

function build(raws: Raw[], allowStart: boolean): MarrowEvent[] {
  let now = 1000;
  const out: MarrowEvent[] = [];
  for (const r of raws) {
    now += r.dt;
    if (r.k === 'start') {
      if (allowStart) out.push(start(now - r.lag));
      continue;
    }
    if (r.k === 'tick') out.push(tick(now, 0));
    else if (r.k === 'swayWarn') out.push(sway(now));
    else if (r.k === 'otherWarn') out.push(sway(now, 'other'));
    else if (r.k === 'released') out.push(end(now, 'released'));
    else out.push(end(now, 'lost-pose'));
  }
  return out;
}

/** Independent model of the rules for P16. */
function expectedReason(events: MarrowEvent[]): StanceStop | null {
  const idx = events.findIndex((e) => e.type === 'hold:start');
  if (idx < 0) return null;
  const startT = events[idx]!.t;
  const early = events.slice(0, idx).filter((e) => e.type === 'form:warning' && e.ruleId === 'sway-limit' && e.t >= startT);
  if (early.length > 0) return Math.min(...early.map((e) => e.t)) - startT >= CAP ? 'cap' : 'sway';
  for (const e of events.slice(idx + 1)) {
    if (e.t < startT) continue;
    if (e.t - startT >= CAP) return 'cap';
    if (e.type === 'hold:end') return e.reason;
    if (e.type === 'form:warning' && e.ruleId === 'sway-limit') return 'sway';
  }
  return null;
}

describe('stance timer properties', () => {
  const seq = fc.array(rawArb, { maxLength: 30 });

  it('P13 the first stop wins and later events change nothing', () => {
    fc.assert(
      fc.property(seq, fc.array(rawArb, { maxLength: 10 }), (raws, more) => {
        const events = build([...raws, ...more], true);
        const timer = createStanceTimer();
        let frozen: ReturnType<typeof timer.result> = null;
        for (const e of events) {
          timer.push(e);
          const r = timer.result();
          if (frozen) {
            if (JSON.stringify(r) !== JSON.stringify(frozen)) return false;
          } else if (r) frozen = r;
        }
        if (!frozen) return true;
        timer.stopByUser(1e9);
        return JSON.stringify(timer.result()) === JSON.stringify(frozen);
      }),
      RUNS,
    );
  });

  it('P14 seconds is between 0 and 30', () => {
    fc.assert(
      fc.property(seq, (raws) => {
        const r = run(build(raws, true)).result();
        return r === null || (r.seconds >= 0 && r.seconds <= 30);
      }),
      RUNS,
    );
  });

  it('P15 no hold:start never gives a result', () => {
    fc.assert(
      fc.property(seq, (raws) => run(build(raws, false)).result() === null),
      RUNS,
    );
  });

  it('P16 the reason is the type of the first stop event and one of the five reasons', () => {
    fc.assert(
      fc.property(seq, (raws) => {
        const events = build(raws, true);
        const r = run(events).result();
        const exp = expectedReason(events);
        if (r === null) return exp === null;
        return exp === r.reason && ['lost-pose', 'released', 'sway', 'cap', 'user'].includes(r.reason);
      }),
      RUNS,
    );
  });
});
