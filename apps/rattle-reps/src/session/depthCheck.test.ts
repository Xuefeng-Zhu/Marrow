import type { MarrowEvent } from 'marrow-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDepthChecker, depthRuleFor, withDepthWarnings } from './depthCheck';

const rep = (t: number, count: number): MarrowEvent => ({ type: 'rep', t, count, durationMs: 1000, phaseEntries: {} });
const rom = (t: number, min: number): MarrowEvent => ({
  type: 'rom:sample',
  t,
  metric: 'kneeAngle',
  min,
  max: 170,
  trigger: 'rep',
});
const coreWarn = (t: number): MarrowEvent => ({
  type: 'form:warning',
  t,
  ruleId: 'shallow-depth',
  message: 'Sink a little deeper',
  value: 105,
});
const shallowWarnings = (events: readonly MarrowEvent[]) =>
  events.filter((e) => e.type === 'form:warning' && e.ruleId === 'shallow-depth');

describe('depthRuleFor', () => {
  it('exists for squat and push-up only', () => {
    expect(depthRuleFor('squat')).toMatchObject({ bound: 100 });
    expect(depthRuleFor('push-up')).toMatchObject({ bound: 90 });
    expect(depthRuleFor('lunge')).toBeNull();
    expect(depthRuleFor('plank')).toBeNull();
    expect(depthRuleFor('nope')).toBeNull();
  });
});

describe('withDepthWarnings', () => {
  it('warns for consecutive shallow reps alternating 105 and 170 degrees (core warned once)', () => {
    const events = [coreWarn(1500), rep(2000, 1), rom(2000, 105), rep(4000, 2), rom(4000, 105)];
    const out = withDepthWarnings(events, 'squat');
    expect(shallowWarnings(out).map((e) => e.t)).toEqual([1500, 4000]);
  });

  it('warns a shallow rep that follows a clean one', () => {
    const events = [rep(2000, 1), rom(2000, 90), rep(4000, 2), rom(4000, 110)];
    const out = withDepthWarnings(events, 'squat');
    expect(shallowWarnings(out)).toEqual([
      { type: 'form:warning', t: 4000, ruleId: 'shallow-depth', message: 'Sink a little deeper', value: 110 },
    ]);
    expect(out.indexOf(shallowWarnings(out)[0]!)).toBe(out.indexOf(events[3]!) + 1);
  });

  it('adds no duplicate when the core already warned in the window', () => {
    const events = [rep(2000, 1), coreWarn(2500), rep(3000, 2), rom(3000, 120)];
    expect(withDepthWarnings(events, 'squat')).toEqual(events);
  });

  it('ignores depth at the bound, other metrics and other workouts', () => {
    expect(shallowWarnings(withDepthWarnings([rep(1, 1), rom(1, 100)], 'squat'))).toHaveLength(0);
    expect(withDepthWarnings([rep(1, 1), rom(1, 150)], 'lunge')).toHaveLength(2);
    const other: MarrowEvent = { ...(rom(1, 150) as Extract<MarrowEvent, { type: 'rom:sample' }>), metric: 'other' };
    expect(withDepthWarnings([rep(1, 1), other], 'squat')).toHaveLength(2);
  });

  it('the incremental checker equals the batch form', () => {
    const events = [rep(2000, 1), rom(2000, 105), rep(4000, 2), rom(4000, 105)];
    const checker = createDepthChecker('squat');
    expect(events.flatMap((e) => checker.push(e))).toEqual(withDepthWarnings(events, 'squat'));
  });

  it('property: after merging, each rep window has at most one shallow-depth warning, and one per shallow rep', () => {
    const repArb = fc.record({ min: fc.integer({ min: 60, max: 170 }), core: fc.boolean() });
    fc.assert(
      fc.property(fc.array(repArb, { maxLength: 20 }), (reps) => {
        const events: MarrowEvent[] = [];
        reps.forEach((r, i) => {
          const t = (i + 1) * 2000;
          if (r.core && r.min > 100) events.push(coreWarn(t - 500));
          events.push(rep(t, i + 1), rom(t, r.min));
        });
        const out = withDepthWarnings(events, 'squat');
        reps.forEach((r, i) => {
          const t = (i + 1) * 2000;
          const inWindow = shallowWarnings(out).filter((e) => e.t > t - 2000 && e.t <= t);
          expect(inWindow).toHaveLength(r.min > 100 ? 1 : 0);
        });
      }),
    );
  });
});
