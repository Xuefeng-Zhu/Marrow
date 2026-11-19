import { createEngine, replay, type Frame, type PoseSource, type SourceError } from 'marrow-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTCOMES, type ClipId, type RomOutcome, type StanceOutcome } from '../clips/outcomes';
import { buildResult, type RunOutcome } from '../logic/result';
import { TEST_BY_ID, TESTS, type TestDef } from '../tests';
import { createRunController, type RunController } from './controller';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A source that delivers some frames synchronously on start and then goes silent, like a stalled camera. */
function silentSource(frames: Frame[]) {
  const frameFns = new Set<(f: Frame) => void>();
  const errorFns = new Set<(e: SourceError) => void>();
  const stop = vi.fn();
  const source: PoseSource = {
    async start() {
      for (const f of frames) for (const fn of [...frameFns]) fn(f);
    },
    stop,
    onFrame: (fn) => (frameFns.add(fn), () => frameFns.delete(fn)),
    onPoseLost: () => () => undefined,
    onError: (fn) => (errorFns.add(fn), () => errorFns.delete(fn)),
  };
  return { source, stop, emitError: (e: SourceError) => errorFns.forEach((fn) => fn(e)) };
}

function harness(test: TestDef, source?: PoseSource) {
  const outcomes: RunOutcome[] = [];
  const errors: SourceError[] = [];
  const prompts: string[] = [];
  const factory = vi.fn(async () => source as PoseSource);
  const c: RunController = createRunController({
    test,
    mode: 'demo',
    ...(source ? { createSource: factory } : {}),
    onEnd: (o) => outcomes.push(o),
    onSourceError: (e) => errors.push(e),
    onPrompt: (p) => prompts.push(p),
  });
  return { c, outcomes, errors, prompts, factory };
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function runUntilEnded(outcomes: RunOutcome[], maxMs = 120000): Promise<void> {
  for (let t = 0; t < maxMs && outcomes.length === 0; t += 500) await advance(500);
}

function framesUntil(test: TestDef, untilT: number): Frame[] {
  return [...replay(test.clip)].filter((f) => f.t <= untilT);
}

describe('demo clips run to their designed results (R13)', () => {
  for (const test of TESTS) {
    it(`${test.id}`, async () => {
      const { c, outcomes } = harness(test);
      c.start();
      await advance(5000);
      await runUntilEnded(outcomes);
      expect(outcomes).toHaveLength(1);
      const o = outcomes[0]!;
      const model = buildResult(o);
      const designed = OUTCOMES[test.id as ClipId];
      expect(o.source).toBe('demo');
      expect(model.saveable).toBe(true);
      if (designed.kind === 'rom-peak') {
        expect(Math.abs(model.value! - (designed as RomOutcome).result)).toBeLessThanOrEqual((designed as RomOutcome).toleranceDeg);
        expect(o.stop).toBe('reps');
      } else if (designed.kind === 'count') {
        expect(model.value).toBe(designed.stands);
        expect(o.stop).toBe('window');
      } else {
        const d = designed as StanceOutcome;
        expect(o.stop).toBe(d.reason);
        expect(Math.abs(model.value! - d.seconds)).toBeLessThanOrEqual(0.3);
      }
    });
  }
});

describe('countdown and stop', () => {
  it('counts down 5 to 1 before the source is created', async () => {
    const test = TEST_BY_ID['chair-stand'];
    const { source } = silentSource([]);
    const seen: number[] = [];
    const factory = vi.fn(async () => source);
    const c = createRunController({ test, mode: 'demo', createSource: factory, onCountdown: (n) => seen.push(n) });
    c.start();
    await advance(4000);
    expect(seen).toEqual([5, 4, 3, 2, 1]);
    expect(factory).not.toHaveBeenCalled();
    await advance(1000);
    expect(factory).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('stop during the countdown never creates the source', async () => {
    const { source } = silentSource([]);
    const { c, factory, outcomes } = harness(TEST_BY_ID['chair-stand'], source);
    c.start();
    await advance(2000);
    c.stop();
    await advance(10000);
    expect(factory).not.toHaveBeenCalled();
    expect(outcomes).toHaveLength(0);
  });

  it('stop releases the source (R4.7)', async () => {
    const test = TEST_BY_ID['knee-flexion-left'];
    const { source, stop } = silentSource(framesUntil(test, 3000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    expect(stop).not.toHaveBeenCalled();
    c.stop();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.stop).toBe('user');
    expect(outcomes[0]!.stoppedEarly).toBe(true);
  });

  it('a finished run releases the source too', async () => {
    const test = TEST_BY_ID['chair-stand'];
    const { source, stop } = silentSource(framesUntil(test, 1000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(30000);
    expect(outcomes).toHaveLength(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('Done ends a ROM run with the peak so far', async () => {
    const test = TEST_BY_ID['shoulder-flexion-left'];
    const { source } = silentSource(framesUntil(test, 3000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    c.done();
    expect(outcomes[0]!.stop).toBe('done');
  });

  it('stance Stop before the foot is lifted gives no result', async () => {
    const test = TEST_BY_ID['single-leg-stance-left'];
    const { source } = silentSource(framesUntil(test, 500));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    c.stop();
    const model = buildResult(outcomes[0]!);
    expect(model.saveable).toBe(false);
    expect(model.noResultText).toBe('Foot was not lifted.');
  });
});

describe('deadlines are enforced by a timer when frames stop (R5.1, R7.1, R8.2)', () => {
  it('chair stand ends 30 s after the first frame with no more frames', async () => {
    const test = TEST_BY_ID['chair-stand'];
    const { source } = silentSource(framesUntil(test, 12000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(29000);
    expect(outcomes).toHaveLength(0);
    await advance(1000);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.stop).toBe('window');
    const engine = createEngine(test.spec);
    let reps = 0;
    for (const f of framesUntil(test, 12000)) reps += engine.push(f).filter((e) => e.type === 'rep').length;
    const count = outcomes[0]!.raw!;
    expect(count).toBeGreaterThanOrEqual(reps);
    expect(count).toBeLessThanOrEqual(reps + 1);
    expect(count).toBeGreaterThan(0);
  });

  it('ROM run ends at 60 s with the peak seen, when frames stop', async () => {
    const test = TEST_BY_ID['shoulder-flexion-left'];
    const { source } = silentSource(framesUntil(test, 6000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(59000);
    expect(outcomes).toHaveLength(0);
    await advance(1000);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.stop).toBe('timeout');
    expect(outcomes[0]!.raw).toBeGreaterThan(0);
    expect(buildResult(outcomes[0]!).saveable).toBe(true);
  });

  it('ROM run with no frames at all ends at 60 s with no result', async () => {
    const test = TEST_BY_ID['knee-flexion-right'];
    const { source } = silentSource([]);
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(60000);
    expect(outcomes).toHaveLength(1);
    expect(buildResult(outcomes[0]!).noResultText).toBe('No movement detected.');
  });

  it('stance run stops at the 30 s cap when frames stop after the lift', async () => {
    const test = TEST_BY_ID['single-leg-stance-left'];
    const { source } = silentSource(framesUntil(test, 5000));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(28000);
    expect(outcomes).toHaveLength(0);
    await advance(3000);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.stop).toBe('cap');
    expect(outcomes[0]!.raw).toBe(30);
  });

  it('stance run in which the foot is never lifted ends by timer without a result', async () => {
    const test = TEST_BY_ID['single-leg-stance-left'];
    const { source } = silentSource(framesUntil(test, 500));
    const { c, outcomes } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(61000);
    expect(outcomes).toHaveLength(1);
    expect(buildResult(outcomes[0]!).saveable).toBe(false);
  });
});

describe('camera errors (R3.5)', () => {
  it('a source error ends the run, releases the source and is reported typed', async () => {
    const test = TEST_BY_ID['chair-stand'];
    const s = silentSource([]);
    const { c, errors, outcomes } = harness(test, s.source);
    c.start();
    await advance(5000);
    s.emitError({ code: 'camera-denied', message: 'denied' });
    expect(errors).toEqual([{ code: 'camera-denied', message: 'denied' }]);
    expect(s.stop).toHaveBeenCalled();
    await advance(60000);
    expect(outcomes).toHaveLength(0);
  });

  it('a source that cannot be created is reported', async () => {
    const errors: SourceError[] = [];
    const c = createRunController({
      test: TEST_BY_ID['chair-stand'],
      mode: 'camera',
      createSource: async () => {
        throw new Error('no camera');
      },
      onSourceError: (e) => errors.push(e),
    });
    c.start();
    await advance(5000);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('camera-unavailable');
  });
});

describe('lost-pose prompt without any frame', () => {
  it('prompts after two seconds when the source never delivers a frame', async () => {
    const test = TEST_BY_ID['chair-stand'] ?? TESTS[0]!;
    const { source } = silentSource([]);
    const { c, prompts } = harness(test, source);
    c.start();
    await advance(5000);
    await advance(1900);
    expect(prompts).not.toContain(test.script.lost);
    await advance(200);
    expect(prompts).toContain(test.script.lost);
    c.stop();
  });
});
