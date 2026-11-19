import { createEngine, replay, type MarrowEvent } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { OUTCOMES, type CountOutcome, type StanceOutcome } from '../clips/outcomes';
import { TEST_BY_ID } from '../tests';
import { createChairStandCounter } from './chairStand';
import { createStanceTimer } from './stance';

type ClipKey = 'chair-stand' | 'single-leg-stance-left' | 'single-leg-stance-right';

function run(id: ClipKey): MarrowEvent[] {
  const test = TEST_BY_ID[id];
  const engine = createEngine(test.spec);
  const events: MarrowEvent[] = [];
  for (const frame of replay(test.clip)) events.push(...engine.push(frame));
  return events;
}

describe('clip events through the logic modules (R7, R8, R13.4)', () => {
  it('chair-stand: the counter gives the designed count', () => {
    const o = OUTCOMES['chair-stand'] as CountOutcome;
    const counter = createChairStandCounter(0, o.windowMs);
    run('chair-stand').forEach((e) => counter.push(e));
    counter.finish();
    expect(counter.result()).toBe(o.stands);
  });

  it('single-leg-stance-left: released at the designed time', () => {
    const o = OUTCOMES['single-leg-stance-left'] as StanceOutcome;
    const timer = createStanceTimer();
    run('single-leg-stance-left').forEach((e) => timer.push(e));
    expect(timer.result()).toEqual({ seconds: o.seconds, reason: o.reason });
  });

  it('single-leg-stance-right: sway stop at the designed time', () => {
    const o = OUTCOMES['single-leg-stance-right'] as StanceOutcome;
    const timer = createStanceTimer();
    run('single-leg-stance-right').forEach((e) => timer.push(e));
    expect(timer.result()).toEqual({ seconds: o.seconds, reason: o.reason });
  });

  it('single-leg-stance-right: the stop is the same when the user presses Stop later', () => {
    const timer = createStanceTimer();
    run('single-leg-stance-right').forEach((e) => timer.push(e));
    timer.stopByUser(20000);
    expect(timer.result()?.reason).toBe('sway');
  });
});
