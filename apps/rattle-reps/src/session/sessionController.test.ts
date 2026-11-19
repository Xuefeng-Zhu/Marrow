import { replay, type Frame, type MarrowEvent } from 'marrow-core';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '../fixtures';
import { getWorkout } from '../movements/registry';
import { createSessionController, type SessionControllerOptions, type SessionResult } from './sessionController';
import { createSource } from './sourceFactory';
import { FakeTime, ScriptedSource } from './testSupport';

const clip = (id: string): Frame[] => [...replay(getFixture(id)!)];
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function scripted(id: string, target: SessionControllerOptions['target'], extra: Partial<SessionControllerOptions> = {}) {
  const source = new ScriptedSource();
  const results: SessionResult[] = [];
  const controller = createSessionController({
    workout: getWorkout(id)!,
    mode: 'demo',
    target,
    createSource: async () => ({ source, pause: () => undefined, resume: () => undefined }),
    onEnd: (r) => results.push(r),
    ...extra,
  });
  return { source, controller, results };
}

function repEvents(events: readonly MarrowEvent[]) {
  return events.filter((e): e is Extract<MarrowEvent, { type: 'rep' }> => e.type === 'rep');
}

describe('session controller', () => {
  it('the counter equals the count of the last rep event', async () => {
    const { source, controller } = scripted('squat', { kind: 'reps', reps: 99 });
    await controller.start();
    for (const f of clip('squat')) source.emit(f);
    const reps = repEvents(controller.getEvents());
    expect(reps.length).toBeGreaterThan(0);
    expect(controller.getView().reps).toBe(reps[reps.length - 1]!.count);
    expect(controller.getView().status).toBe('running');
  });

  it('ends the set at the target, with the frame fully processed', async () => {
    const { source, controller, results } = scripted('squat', { kind: 'reps', reps: 3 });
    await controller.start();
    for (const f of clip('squat')) {
      source.emit(f);
      await flush();
      if (results.length) break;
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ reason: 'target' });
    expect(results[0]!.summary.reps).toBe(3);
    expect(controller.getView().status).toBe('ended');
    expect(source.listenerCount).toBe(0);
  });

  it('a final shallow rep that reaches the target still gets its shallow-depth warning, and is not clean', async () => {
    const { source, controller, results } = scripted('squat', { kind: 'reps', reps: 6 });
    await controller.start();
    for (const f of clip('squat')) {
      source.emit(f);
      await flush();
    }
    expect(results).toHaveLength(1);
    const { events, summary } = results[0]!;
    const lastRep = repEvents(events).at(-1)!;
    const shallow = events.filter((e) => e.type === 'form:warning' && e.ruleId === 'shallow-depth');
    expect(shallow).toHaveLength(2);
    expect(shallow.at(-1)!.t).toBe(lastRep.t);
    expect(events.some((e) => e.type === 'rom:sample' && e.t === lastRep.t)).toBe(true);
    expect(summary.reps).toBe(6);
    expect(summary.cleanReps).toBe(3);
  });

  it('stop closes an open hold at the stop time', async () => {
    const { source, controller, results } = scripted('plank', { kind: 'hold', seconds: 999 });
    await controller.start();
    const frames = clip('plank');
    for (const f of frames.slice(0, 120)) source.emit(f);
    controller.stop();
    expect(results).toHaveLength(1);
    const { summary, events, stopT } = results[0]!;
    expect(events.some((e) => e.type === 'hold:start')).toBe(true);
    expect(events.some((e) => e.type === 'hold:end')).toBe(false);
    expect(stopT).toBe(frames[119]!.t);
    expect(summary.kind).toBe('hold');
    expect(summary.holdMs).toBeGreaterThan(0);
    expect(summary.reps).toBe(0);
    controller.stop();
    expect(results).toHaveLength(1);
  });

  it('unmount stops the pipeline and removes every listener', async () => {
    const { source, controller, results } = scripted('squat', { kind: 'reps', reps: 5 });
    await controller.start();
    expect(source.listenerCount).toBeGreaterThan(0);
    controller.dispose();
    expect(source.listenerCount).toBe(0);
    expect(source.started).toBe(false);
    controller.dispose();
    expect(results).toHaveLength(0);
  });

  it('a late source after dispose is stopped and never used', async () => {
    const source = new ScriptedSource();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const controller = createSessionController({
      workout: getWorkout('squat')!,
      mode: 'camera',
      target: { kind: 'reps', reps: 5 },
      createSource: async () => {
        await gate;
        return { source, pause: () => undefined, resume: () => undefined };
      },
    });
    const started = controller.start();
    controller.dispose();
    release();
    await started;
    expect(source.listenerCount).toBe(0);
    expect(source.stopCount).toBe(1);
  });

  it('a camera error exposes the demo fallback', async () => {
    const { source, controller } = scripted('squat', { kind: 'reps', reps: 5 }, { mode: 'camera' });
    await controller.start();
    source.fail({ code: 'camera-denied', message: 'Permission denied' });
    expect(controller.getView().status).toBe('error');
    expect(controller.getView().error).toEqual({
      code: 'camera-denied',
      message: 'Permission denied',
      demoFallback: true,
    });
  });

  it('a camera that cannot be created exposes the demo fallback', async () => {
    const controller = createSessionController({
      workout: getWorkout('squat')!,
      mode: 'camera',
      target: { kind: 'reps', reps: 5 },
      createSource: () => Promise.reject(new Error('The camera needs a secure (HTTPS) page.')),
    });
    await controller.start();
    expect(controller.getView()).toMatchObject({ status: 'error', error: { demoFallback: true } });
  });

  it('a demo error does not offer a demo fallback', async () => {
    const { source, controller } = scripted('squat', { kind: 'reps', reps: 5 });
    await controller.start();
    source.fail({ code: 'fixture-invalid', message: 'bad clip' });
    expect(controller.getView().error?.demoFallback).toBe(false);
  });

  it('shows the pose-lost cue after 2 s without a frame in camera mode', async () => {
    vi.useFakeTimers();
    let wall = 0;
    const { source, controller } = scripted('squat', { kind: 'reps', reps: 5 }, { mode: 'camera', now: () => wall });
    await controller.start();
    source.emit(clip('squat')[0]!);
    wall = 2600;
    vi.advanceTimersByTime(500);
    expect(controller.getView().poseLost).toBe(true);
    source.emit(clip('squat')[1]!);
    expect(controller.getView().poseLost).toBe(false);
    controller.dispose();
    vi.useRealTimers();
  });
});

describe('demo mode on a fake clock', () => {
  afterEach(() => vi.unstubAllGlobals());

  function demo(id: string, target: SessionControllerOptions['target'], time: FakeTime) {
    const results: SessionResult[] = [];
    const seen: Frame[] = [];
    const workout = getWorkout(id)!;
    const controller = createSessionController({
      workout,
      mode: 'demo',
      target,
      createSource: ({ isHoldActive }) =>
        createSource({ mode: 'demo', workout, isHoldActive, clock: { base: time.clock, now: () => time.now } }),
      onEnd: (r) => results.push(r),
    });
    return { controller, results, seen };
  }

  it('delivers every fixture frame exactly once, in order, with the recorded t, for any pause pattern', async () => {
    const recorded = clip('lunge');
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 600_000 })), { maxLength: 8 }),
        async (pattern) => {
          const time = new FakeTime();
          const { controller } = demo('lunge', { kind: 'reps', reps: 99 }, time);
          const ts: number[] = [];
          await controller.start();
          controller.onFrame((f) => ts.push(f.frame.t));
          time.advance(0);
          for (const [run, pause] of pattern) {
            time.advance(run);
            controller.pause();
            const before = ts.length;
            time.advance(pause);
            expect(ts.length).toBe(before);
            controller.resume();
          }
          time.advance(120_000);
          await flush();
          expect(ts).toEqual(recorded.map((f) => f.t));
          controller.dispose();
        },
      ),
      { numRuns: 25 },
    );
  });

  it('a pause longer than the remaining clip does not end the clip', async () => {
    const time = new FakeTime();
    const { controller, results } = demo('lunge', { kind: 'reps', reps: 99 }, time);
    await controller.start();
    time.advance(5000);
    controller.pause();
    time.advance(10 * 60_000);
    await flush();
    expect(results).toHaveLength(0);
    expect(controller.getView().status).toBe('paused');
    controller.resume();
    time.advance(60_000);
    await flush();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ reason: 'clip-end' });
  });

  it('a hold open at pause continues after resume without lost-pose', async () => {
    const time = new FakeTime();
    const { controller, results } = demo('plank', { kind: 'hold', seconds: 999 }, time);
    await controller.start();
    time.advance(9000);
    expect(controller.getEvents().some((e) => e.type === 'hold:start')).toBe(true);
    expect(controller.getEvents().some((e) => e.type === 'hold:end')).toBe(false);
    controller.pause();
    time.advance(60_000);
    controller.resume();
    time.advance(60_000);
    await flush();
    const ends = results[0]!.events.filter((e) => e.type === 'hold:end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'released' });
  });

  it('never calls getUserMedia', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { ...globalThis.navigator, mediaDevices: { getUserMedia } });
    const time = new FakeTime();
    const { controller, results } = demo('squat', { kind: 'reps', reps: 99 }, time);
    await controller.start();
    time.advance(60_000);
    await flush();
    expect(results).toHaveLength(1);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
