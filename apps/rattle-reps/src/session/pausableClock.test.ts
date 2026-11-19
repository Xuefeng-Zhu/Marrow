import { describe, expect, it } from 'vitest';
import { createPausableClock } from './pausableClock';
import { FakeTime } from './testSupport';

function setup() {
  const time = new FakeTime();
  const clock = createPausableClock({ base: time.clock, now: () => time.now });
  return { time, clock };
}

describe('pausable clock', () => {
  it('runs timers like the base clock while running', () => {
    const { time, clock } = setup();
    const fired: number[] = [];
    clock.setTimeout(() => fired.push(time.now), 100);
    time.advance(99);
    expect(fired).toEqual([]);
    time.advance(1);
    expect(fired).toEqual([100]);
  });

  it('keeps the remaining delay across a pause, however long it is', () => {
    const { time, clock } = setup();
    const fired: number[] = [];
    clock.setTimeout(() => fired.push(time.now), 100);
    time.advance(40);
    clock.pause();
    time.advance(1_000_000);
    expect(fired).toEqual([]);
    clock.resume();
    time.advance(59);
    expect(fired).toEqual([]);
    time.advance(1);
    expect(fired).toEqual([1_000_100]);
  });

  it('starts a timer set while paused on resume, and clearTimeout cancels', () => {
    const { time, clock } = setup();
    const fired: string[] = [];
    clock.pause();
    clock.setTimeout(() => fired.push('a'), 10);
    const b = clock.setTimeout(() => fired.push('b'), 10);
    clock.clearTimeout(b);
    time.advance(100);
    expect(fired).toEqual([]);
    clock.resume();
    time.advance(10);
    expect(fired).toEqual(['a']);
  });
});
