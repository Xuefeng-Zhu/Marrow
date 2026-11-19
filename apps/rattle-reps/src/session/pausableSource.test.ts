import { createPipeline, replay, type Frame, type MarrowEvent } from 'marrow-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getFixture } from '../fixtures';
import { getWorkout } from '../movements/registry';
import { createPausableSource } from './pausableSource';
import { ScriptedSource } from './testSupport';

const plank = getWorkout('plank')!;
const frames: Frame[] = [...replay(getFixture('plank')!)];

function setup() {
  const inner = new ScriptedSource();
  let holdOpen = false;
  const source = createPausableSource(inner, {
    holdGapMs: plank.spec.holdGapMs,
    isHoldActive: () => holdOpen,
  });
  const pipeline = createPipeline({ source, spec: plank.spec, smoothing: false });
  const events: MarrowEvent[] = [];
  const times: number[] = [];
  for (const type of ['rep', 'hold:start', 'hold:tick', 'hold:end', 'form:warning'] as const) {
    pipeline.on(type, (e) => {
      events.push(e);
      if (e.type === 'hold:start') holdOpen = true;
      if (e.type === 'hold:end') holdOpen = false;
    });
  }
  pipeline.onFrame((f) => times.push(f.frame.t));
  return { inner, source, pipeline, events, times };
}

/** Index of the first frame at which the plank hold is active in the fixture. */
function holdStartIndex(): number {
  const probe = setup();
  void probe.pipeline.start();
  for (let i = 0; i < frames.length; i++) {
    probe.inner.emit(frames[i]!);
    if (probe.events.some((e) => e.type === 'hold:start')) return i;
  }
  throw new Error('no hold in fixture');
}

describe('pausable camera source', () => {
  it('drops frames while paused and keeps t increasing', async () => {
    const { inner, source, times, pipeline } = setup();
    await pipeline.start();
    for (let i = 0; i < 5; i++) inner.emit(frames[i]!);
    source.pause();
    for (let i = 5; i < 20; i++) inner.emit(frames[i]!);
    source.resume();
    for (let i = 20; i < 25; i++) inner.emit(frames[i]!);
    expect(times).toHaveLength(10);
    expect(times.every((t, i) => i === 0 || t > times[i - 1]!)).toBe(true);
    // The whole pause is removed except one frame spacing.
    expect(times[5]! - times[4]!).toBe(50);
  });

  it('drops pose-lost notifications while paused', async () => {
    const { inner, source } = setup();
    const lost: number[] = [];
    source.onPoseLost((t) => lost.push(t));
    await source.start();
    inner.emit(frames[0]!);
    source.pause();
    inner.lost(500);
    source.resume();
    inner.lost(900);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toBeLessThan(900);
  });

  it('removes its inner subscriptions on stop', async () => {
    const { inner, source } = setup();
    await source.start();
    expect(inner.listenerCount).toBe(3);
    source.stop();
    expect(inner.listenerCount).toBe(0);
    expect(inner.stopCount).toBe(1);
  });

  it.each([
    ['a short pause at normal frame spacing', 0],
    ['a long pause', 40],
  ])('ends an open hold with lost-pose on the first frame after resume: %s', async (_name, skipped) => {
    const { inner, source, events, times, pipeline } = setup();
    await pipeline.start();
    const k = holdStartIndex() + 10;
    for (let i = 0; i <= k; i++) inner.emit(frames[i]!);
    expect(events.some((e) => e.type === 'hold:start')).toBe(true);
    const lastBefore = times[times.length - 1]!;
    const tick = [...events].reverse().find((e) => e.type === 'hold:tick') as Extract<MarrowEvent, { type: 'hold:tick' }>;
    source.pause();
    for (let i = k + 1; i <= k + skipped; i++) inner.emit(frames[i]!);
    source.resume();
    inner.emit(frames[k + skipped + 1]!);

    const ends = events.filter((e) => e.type === 'hold:end');
    expect(ends).toHaveLength(1);
    const end = ends[0] as Extract<MarrowEvent, { type: 'hold:end' }>;
    expect(end.reason).toBe('lost-pose');
    expect(end.t).toBe(lastBefore + plank.spec.holdGapMs + 1);
    // The measured hold stops at the last valid frame before the pause.
    expect(end.durationMs).toBe(lastBefore - (tick.t - tick.elapsedMs));
    expect(times.every((t, i) => i === 0 || t > times[i - 1]!)).toBe(true);
  });

  it('a pause with no open hold leaves a one-frame gap and no lost-pose', async () => {
    const { inner, source, events, times, pipeline } = setup();
    await pipeline.start();
    for (let i = 0; i < 5; i++) inner.emit(frames[i]!);
    source.pause();
    for (let i = 5; i < 30; i++) inner.emit(frames[i]!);
    source.resume();
    inner.emit(frames[30]!);
    expect(times[5]! - times[4]!).toBeLessThanOrEqual(plank.spec.holdGapMs);
    expect(events.filter((e) => e.type === 'hold:end')).toHaveLength(0);
  });

  it('property: for any pause pattern, t strictly increases and no hold includes paused time', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 80 }), { maxLength: 14 }), async (runs) => {
        const { inner, source, events, times, pipeline } = setup();
        await pipeline.start();
        let index = 0;
        let paused = false;
        for (const run of runs) {
          for (let n = 0; n < run && index < frames.length; n++) inner.emit(frames[index++]!);
          paused = !paused;
          if (paused) source.pause();
          else source.resume();
        }
        if (paused) source.resume();
        while (index < frames.length) inner.emit(frames[index++]!);

        expect(times.every((t, i) => i === 0 || t > times[i - 1]!)).toBe(true);
        const heldMs = events.reduce((sum, e) => sum + (e.type === 'hold:end' ? e.durationMs : 0), 0);
        // Delivered frames are 50 ms apart inside a hold, so a hold cannot be longer than that.
        expect(heldMs).toBeLessThanOrEqual(times.length * 50);
        for (const e of events) {
          if (e.type === 'hold:end') expect(e.durationMs).toBeLessThanOrEqual(frames[frames.length - 1]!.t);
        }
      }),
      { numRuns: 40 },
    );
  });
});
