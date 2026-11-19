import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LM } from '../landmarks';
import { parseMovementSpec } from '../spec/parse';
import type { MovementSpec } from '../spec/schema';
import { arbSpecJson } from '../testing/arbitraries';
import {
  angleFrame,
  cleanCycleFrames,
  nanFrame,
  valueFrames,
  witness,
  withNaNFrames,
} from '../testing/sequences';
import type { Frame } from '../types';
import { createEngine } from './engine';
import type { MarrowEvent } from './events';

const RUNS = { numRuns: 100 };

function mustParse(json: unknown): MovementSpec {
  const r = parseMovementSpec(json);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
}

const arbSpec: fc.Arbitrary<MovementSpec> = arbSpecJson.map(mustParse);

/** Two angle phases, hysteresis 8, minRepMs 600: the shape of the example spec. */
function elbowSpec(overrides: Record<string, unknown> = {}): MovementSpec {
  return mustParse({
    version: 1,
    id: 'unit',
    name: 'Unit',
    hysteresis: 8,
    minRepMs: 600,
    metrics: { m0: { kind: 'angle', points: ['leftShoulder', 'leftElbow', 'leftWrist'] } },
    phases: [
      { id: 'extended', metric: 'm0', min: 150, max: 180 },
      { id: 'bent', metric: 'm0', min: 30, max: 70 },
    ],
    ...overrides,
  });
}

function threePhaseSpec(): MovementSpec {
  return elbowSpec({
    minRepMs: 0,
    phases: [
      { id: 'a', metric: 'm0', min: 0, max: 40 },
      { id: 'b', metric: 'm0', min: 70, max: 110 },
      { id: 'c', metric: 'm0', min: 140, max: 180 },
    ],
  });
}

function run(spec: MovementSpec, frames: Frame[]): MarrowEvent[] {
  const engine = createEngine(spec);
  return frames.flatMap((f) => engine.push(f));
}

function ofType<T extends MarrowEvent['type']>(events: MarrowEvent[], type: T) {
  return events.filter((e): e is Extract<MarrowEvent, { type: T }> => e.type === type);
}

describe('engine phases (R6a)', () => {
  it('selects the containing phase on the first valid frame with from: null', () => {
    const engine = createEngine(elbowSpec());
    expect(engine.phase).toBeNull();
    const ev = engine.push(angleFrame(0, 165));
    expect(ev).toEqual([{ type: 'phase', t: 0, from: null, to: 'extended' }]);
    expect(engine.phase).toBe('extended');
  });

  it('stays unknown and silent while no phase contains the value, then selects with from: null', () => {
    const engine = createEngine(elbowSpec());
    expect(engine.push(angleFrame(0, 100))).toEqual([]);
    expect(engine.phase).toBeNull();
    expect(engine.push(angleFrame(33, 50))).toEqual([{ type: 'phase', t: 33, from: null, to: 'bent' }]);
  });

  it('uses the raw range (no hysteresis) for the first selection', () => {
    const engine = createEngine(elbowSpec());
    expect(engine.push(angleFrame(0, 31))).toEqual([{ type: 'phase', t: 0, from: null, to: 'bent' }]);
  });

  it('picks the first phase in array order when several contain the value', () => {
    const spec = elbowSpec({
      hysteresis: 0,
      phases: [
        { id: 'low', metric: 'm0', min: 0, max: 100 },
        { id: 'high', metric: 'm0', min: 90, max: 180 },
      ],
    });
    const engine = createEngine(spec);
    expect(engine.push(angleFrame(0, 95))[0]).toMatchObject({ to: 'low' });
  });

  it('keeps the phase inside the widened range and changes outside the shrunk target range', () => {
    const engine = createEngine(elbowSpec());
    engine.push(angleFrame(0, 165)); // extended [150,180], retention [142,188]
    expect(engine.push(angleFrame(10, 143))).toEqual([]);
    expect(engine.push(angleFrame(20, 100))).toEqual([]); // gap: keep last phase
    expect(engine.phase).toBe('extended');
    expect(engine.push(angleFrame(30, 69))).toEqual([]); // bent entry band is [38, 62]
    expect(engine.push(angleFrame(40, 62.5))).toEqual([]);
    expect(engine.push(angleFrame(50, 62))).toEqual([{ type: 'phase', t: 50, from: 'extended', to: 'bent' }]);
  });

  it('keeps the current phase when the value is inside its retention band and another entry band', () => {
    const spec = elbowSpec({
      hysteresis: 5,
      phases: [
        { id: 'a1', metric: 'm0', min: 0, max: 100 },
        { id: 'a2', metric: 'm0', min: 90, max: 180 },
      ],
    });
    const engine = createEngine(spec);
    engine.push(angleFrame(0, 50));
    // 97 is in a1's retention band [-5,105] and in a2's entry band [95,175]: retention wins.
    expect(engine.push(angleFrame(10, 97))).toEqual([]);
    expect(engine.phase).toBe('a1');
    expect(engine.push(angleFrame(20, 106))).toEqual([{ type: 'phase', t: 20, from: 'a1', to: 'a2' }]);
  });

  it('holds state and emits nothing on NaN', () => {
    const engine = createEngine(elbowSpec());
    expect(engine.push(nanFrame(0))).toEqual([]);
    expect(engine.phase).toBeNull();
    engine.push(angleFrame(10, 165));
    expect(engine.push(nanFrame(20))).toEqual([]);
    expect(engine.phase).toBe('extended');
  });

  it('emits at most one phase event per frame', () => {
    const spec = threePhaseSpec();
    const events = run(spec, valueFrames([20, 90, 160, 20, 90, 160, 20], [100]));
    const perFrame = new Map<number, number>();
    for (const e of ofType(events, 'phase')) perFrame.set(e.t, (perFrame.get(e.t) ?? 0) + 1);
    for (const count of perFrame.values()) expect(count).toBe(1);
  });

  it('uses normHysteresis for distance metrics', () => {
    const spec = mustParse({
      version: 1,
      id: 'norm',
      name: 'Norm',
      hysteresis: 50,
      normHysteresis: 0.1,
      metrics: { reach: { kind: 'distance', points: ['leftWrist', 'leftHip'] } },
      phases: [
        { id: 'near', metric: 'reach', min: 0.25, max: 0.75 },
        { id: 'far', metric: 'reach', min: 1.25, max: 1.75 },
      ],
    });
    const engine = createEngine(spec);
    // angleFrame has torso length 0.4, hip at (0.4, 0.6). Place the wrist at distance d * 0.4.
    const at = (t: number, d: number): Frame => {
      const f = angleFrame(t, 90);
      f.landmarks[15] = { x: 0.4, y: 0.6 - d * 0.4, z: 0, visibility: 1 };
      return f;
    };
    expect(engine.push(at(0, 0.5))).toEqual([{ type: 'phase', t: 0, from: null, to: 'near' }]);
    expect(engine.push(at(10, 0.84))).toEqual([]); // inside retention [0.15, 0.85]
    expect(engine.push(at(20, 1.3))).toEqual([]); // far entry band is [1.35, 1.65]
    expect(engine.push(at(30, 1.4))).toEqual([{ type: 'phase', t: 30, from: 'near', to: 'far' }]);
  });
});

describe('engine reps (R6b)', () => {
  it('emits a rep with count, duration and phase entries after a full cycle', () => {
    const spec = elbowSpec();
    const events = run(spec, [angleFrame(0, 165), angleFrame(700, 50), angleFrame(1400, 165)]);
    expect(events).toEqual([
      { type: 'phase', t: 0, from: null, to: 'extended' },
      { type: 'phase', t: 700, from: 'extended', to: 'bent' },
      { type: 'phase', t: 1400, from: 'bent', to: 'extended' },
      { type: 'rep', t: 1400, count: 1, durationMs: 1400, phaseEntries: { extended: 0, bent: 700 } },
    ]);
  });

  it('counts consecutive reps 1, 2, 3 and starts each cycle at the first phase', () => {
    const spec = elbowSpec();
    const frames = valueFrames([165, 50, 165, 50, 165, 50, 165], [700]);
    const reps = ofType(run(spec, frames), 'rep');
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
    expect(reps[1]).toMatchObject({ durationMs: 1400, phaseEntries: { extended: 1400, bent: 2100 } });
  });

  it('discards a cycle that is faster than minRepMs', () => {
    const spec = elbowSpec();
    const events = run(spec, [angleFrame(0, 165), angleFrame(100, 50), angleFrame(200, 165)]);
    expect(ofType(events, 'rep')).toEqual([]);
    // The next cycle starts at the return to the first phase and counts normally.
    const more = run(spec, valueFrames([165, 50, 165, 50, 165], [100, 100, 100, 500, 700]));
    expect(ofType(more, 'rep').map((r) => r.count)).toEqual([1]);
  });

  it('accepts a cycle of exactly minRepMs', () => {
    const spec = elbowSpec();
    const events = run(spec, [angleFrame(0, 165), angleFrame(300, 50), angleFrame(600, 165)]);
    expect(ofType(events, 'rep')).toHaveLength(1);
  });

  it('gives no rep when a phase is skipped', () => {
    const spec = threePhaseSpec();
    const events = run(spec, valueFrames([20, 160, 20, 160, 20], [100]));
    expect(ofType(events, 'rep')).toEqual([]);
  });

  it('gives no rep when the order is reversed', () => {
    const spec = threePhaseSpec();
    const events = run(spec, valueFrames([160, 90, 20, 90, 160, 90, 20], [100]));
    expect(ofType(events, 'rep')).toEqual([]);
  });

  it('discards a partial cycle that starts mid-array and then counts a full one', () => {
    const spec = threePhaseSpec();
    const events = run(spec, valueFrames([90, 160, 20, 90, 160, 20], [100]));
    expect(ofType(events, 'rep').map((r) => r.count)).toEqual([1]);
    expect(ofType(events, 'rep')[0]!.t).toBe(500);
  });

  it('restarts the cycle when the first phase is re-entered mid-cycle', () => {
    const spec = threePhaseSpec();
    const events = run(spec, valueFrames([20, 90, 20, 90, 160, 20], [100]));
    const reps = ofType(events, 'rep');
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ durationMs: 300, phaseEntries: { a: 200, b: 300, c: 400 } });
  });

  it('reset clears state, count and phase', () => {
    const spec = elbowSpec();
    const engine = createEngine(spec);
    for (const f of valueFrames([165, 50, 165], [700])) engine.push(f);
    expect(engine.repCount).toBe(1);
    engine.reset();
    expect(engine.repCount).toBe(0);
    expect(engine.phase).toBeNull();
    expect(engine.push(angleFrame(0, 165))).toEqual([{ type: 'phase', t: 0, from: null, to: 'extended' }]);
  });
});

const arbDts = fc.array(fc.integer({ min: 10, max: 100 }), { minLength: 1, maxLength: 5 });
const arbNoise = fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 20 });

/** Random value sequence mixing arbitrary angles with transition witnesses. */
const arbMixed = arbSpec.chain((spec) =>
  fc.record({
    spec: fc.constant(spec),
    values: fc
      .array(
        fc.oneof(
          fc.integer({ min: 0, max: 180 }),
          fc.nat({ max: spec.phases.length - 1 }).map((k) => {
            const n = spec.phases.length;
            return witness(spec, k, (k - 1 + n) % n)?.value ?? 90;
          }),
        ),
        { minLength: 1, maxLength: 80 },
      ),
    dts: fc.array(fc.integer({ min: 1, max: 2000 }), { minLength: 1, maxLength: 8 }),
  }),
);

describe('engine properties', () => {
  it('P11 (rep monotonic): rep counts are 1, 2, 3, ... and the count never decreases', () => {
    fc.assert(
      fc.property(arbMixed, ({ spec, values, dts }) => {
        const engine = createEngine(spec);
        let prev = 0;
        let expected = 1;
        for (const f of valueFrames(values, dts)) {
          for (const e of engine.push(f)) {
            if (e.type === 'rep') expect(e.count).toBe(expected++);
          }
          expect(engine.repCount).toBeGreaterThanOrEqual(prev);
          prev = engine.repCount;
        }
        expect(prev).toBe(expected - 1);
      }),
      RUNS,
    );
  });

  it('P12 (phase order): phase events between reps visit every phase in array order', () => {
    fc.assert(
      fc.property(arbMixed, ({ spec, values, dts }) => {
        const ids = spec.phases.map((p) => p.id);
        const n = ids.length;
        const cycle = [...ids.slice(1), ids[0]!];
        let seen: string[] = [];
        let reps = 0;
        for (const e of run(spec, valueFrames(values, dts))) {
          if (e.type === 'phase') seen.push(e.to);
          if (e.type === 'rep') {
            reps += 1;
            if (reps === 1) expect(seen.slice(-(n + 1))).toEqual([ids[0], ...cycle]);
            else expect(seen.slice(-n)).toEqual(cycle);
            if (reps > 1 && spec.minRepMs === 0) expect(seen).toEqual(cycle);
            seen = [];
          }
        }
      }),
      RUNS,
    );
  });

  it('P12: a sequence that never visits some phase yields zero reps', () => {
    fc.assert(
      fc.property(arbSpec, fc.nat(), arbDts, arbNoise, (spec, skipRaw, dts, noise) => {
        const skip = skipRaw % spec.phases.length;
        const frames = cleanCycleFrames(spec, { cycles: 3, dts, noise, skip: [skip] });
        expect(ofType(run(spec, frames), 'rep')).toEqual([]);
      }),
      RUNS,
    );
  });

  it('P13 (sub-hysteresis noise): noise below the hysteresis causes no phase change and no rep', () => {
    fc.assert(
      fc.property(
        arbSpec,
        fc.nat(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 60 }),
        arbDts,
        (spec, which, frac, noise, dts) => {
          const phase = spec.phases[which % spec.phases.length]!;
          const h = spec.hysteresis;
          // A small margin keeps the base off the exact boundary, where float error in the angle matters.
          const eps = 1e-6;
          const base = phase.min + h + eps + frac * (phase.max - phase.min - 2 * h - 2 * eps);
          const values = noise.map((u) => base + 0.99 * h * u);
          const events = run(spec, valueFrames(values, dts));
          expect(ofType(events, 'phase')).toHaveLength(1);
          expect(ofType(events, 'rep')).toHaveLength(0);
        },
      ),
      RUNS,
    );
  });

  it('P14 (full cycles): N clean cycles give exactly N reps at any frame rate and noise', () => {
    fc.assert(
      fc.property(arbSpec, fc.integer({ min: 1, max: 5 }), arbDts, arbNoise, (spec, cycles, dts, noise) => {
        const frames = cleanCycleFrames(spec, { cycles, dts, noise });
        const events = run(spec, frames);
        expect(ofType(events, 'rep')).toHaveLength(cycles);
        expect(ofType(events, 'rep').map((r) => r.count)).toEqual(Array.from({ length: cycles }, (_, i) => i + 1));
      }),
      RUNS,
    );
  });

  it('P14: the worked example bound is 7 (extended: 30 / 2 - 8)', () => {
    const spec = elbowSpec();
    const w = witness(spec, 1, 0)!; // bent entered from extended
    const x = witness(spec, 0, 1)!; // extended entered from bent
    expect(w.value).toBeCloseTo(50, 9);
    expect(w.halfWidth).toBeCloseTo(12, 9);
    expect(x.value).toBeCloseTo(165, 9);
    expect(x.halfWidth).toBeCloseTo(7, 9);
  });

  it('P24 (reachability, acceptance): clean cycles through the witnesses give N reps for every accepted spec', () => {
    fc.assert(
      fc.property(arbSpec, fc.integer({ min: 1, max: 4 }), arbDts, (spec, cycles, dts) => {
        const frames = cleanCycleFrames(spec, { cycles, dts, noise: [], noiseScale: 0 });
        expect(ofType(run(spec, frames), 'rep')).toHaveLength(cycles);
        // Every phase has a witness from every other phase.
        spec.phases.forEach((_, q) => {
          spec.phases.forEach((__, p) => {
            if (p !== q) expect(witness(spec, q, p)).not.toBeNull();
          });
        });
      }),
      RUNS,
    );
  });

  it('P16 (reset): after reset(), a sequence gives the same events as on a fresh engine', () => {
    fc.assert(
      fc.property(arbMixed, arbMixed, (a, b) => {
        // Use a's spec for both sequences.
        const spec = a.spec;
        const warm = createEngine(spec);
        for (const f of valueFrames(a.values, a.dts)) warm.push(f);
        warm.reset();
        const framesB = valueFrames(b.values, b.dts);
        const after = framesB.flatMap((f) => warm.push(f));
        expect(after).toEqual(run(spec, framesB));
        expect(warm.repCount).toBe(createRepCount(spec, framesB));
      }),
      RUNS,
    );
  });

  it('P17 (NaN neutrality): frames with NaN metrics do not change the rep count or phase events', () => {
    fc.assert(
      fc.property(
        arbSpec,
        fc.integer({ min: 1, max: 4 }),
        arbDts,
        arbNoise,
        fc.array(fc.nat(), { maxLength: 30 }),
        (spec, cycles, dts, noise, positions) => {
          const frames = cleanCycleFrames(spec, { cycles, dts, noise });
          const plain = run(spec, frames);
          const withNaN = run(spec, withNaNFrames(frames, positions));
          expect(ofType(withNaN, 'rep')).toHaveLength(ofType(plain, 'rep').length);
          // Other metrics of the spec may stay valid on these frames, so compare the rep cycle only.
          const cycle = (ev: MarrowEvent[]) => ev.filter((e) => e.type === 'phase' || e.type === 'rep');
          expect(cycle(withNaN)).toEqual(cycle(plain));
        },
      ),
      RUNS,
    );
  });
});

function createRepCount(spec: MovementSpec, frames: Frame[]): number {
  const e = createEngine(spec);
  for (const f of frames) e.push(f);
  return e.repCount;
}

/** Frame with the left elbow shifted so the offset (elbow - shoulder, x) in torso units is `d`. */
function offsetFrame(t: number, d: number, angle = 90): Frame {
  const f = angleFrame(t, angle);
  const shoulder = f.landmarks[LM.leftShoulder]!;
  f.landmarks[LM.leftElbow] = { ...f.landmarks[LM.leftElbow]!, x: shoulder.x + d * 0.4 };
  return f;
}

function holdSpec(overrides: Record<string, unknown> = {}): MovementSpec {
  return elbowSpec({
    minRepMs: 0,
    holds: [{ id: 'bent-hold', phase: 'bent', minMs: 1000, tickMs: 500 }],
    rom: [{ metric: 'm0', sampleOn: 'rep' }],
    ...overrides,
  });
}

function formSpec(rule: Record<string, unknown>, phases?: string[]): MovementSpec {
  return elbowSpec({
    minRepMs: 0,
    metrics: {
      m0: { kind: 'angle', points: ['leftShoulder', 'leftElbow', 'leftWrist'] },
      d: { kind: 'offset', points: ['leftElbow', 'leftShoulder'], axis: 'x' },
    },
    formRules: [{ id: 'r', metric: 'd', debounceMs: 300, message: 'msg', ...(phases ? { phases } : {}), ...rule }],
  });
}

describe('holds (R6c)', () => {
  it('starts after minMs with the condition start time, ticks every tickMs, ends released', () => {
    const engine = createEngine(holdSpec());
    const ev: MarrowEvent[] = [];
    for (let t = 0; t <= 2000; t += 100) ev.push(...engine.push(angleFrame(t, 50)));
    ev.push(...engine.push(angleFrame(2100, 165)));
    expect(ev.filter((e) => e.type.startsWith('hold:'))).toEqual([
      { type: 'hold:start', t: 0, holdId: 'bent-hold' },
      { type: 'hold:tick', t: 1500, holdId: 'bent-hold', elapsedMs: 1500 },
      { type: 'hold:tick', t: 2000, holdId: 'bent-hold', elapsedMs: 2000 },
      { type: 'hold:end', t: 2100, holdId: 'bent-hold', durationMs: 2100, reason: 'released' },
    ]);
  });

  it('emits nothing when the condition lasts less than minMs', () => {
    const engine = createEngine(holdSpec());
    const ev = [0, 300, 600, 900].flatMap((t) => engine.push(angleFrame(t, 50)));
    ev.push(...engine.push(angleFrame(950, 165)));
    expect(ev.some((e) => e.type.startsWith('hold:'))).toBe(false);
  });

  it('ends with lost-pose when the next push comes after a gap, once', () => {
    const engine = createEngine(holdSpec());
    for (let t = 0; t <= 1200; t += 100) engine.push(angleFrame(t, 50));
    const ev = engine.push(angleFrame(2000, 50));
    expect(ev[0]).toEqual({ type: 'hold:end', t: 2000, holdId: 'bent-hold', durationMs: 1200, reason: 'lost-pose' });
    expect(ev.filter((e) => e.type === 'hold:end')).toHaveLength(1);
  });

  it('ends with lost-pose on a NaN push after the gap', () => {
    const engine = createEngine(holdSpec());
    for (let t = 0; t <= 1200; t += 100) engine.push(angleFrame(t, 50));
    expect(engine.push(nanFrame(1500))).toEqual([]);
    const ev = engine.push(nanFrame(1800));
    expect(ev).toEqual([{ type: 'hold:end', t: 1800, holdId: 'bent-hold', durationMs: 1200, reason: 'lost-pose' }]);
  });

  it('restarts the hold timer after a lost-pose end when the phase is unchanged', () => {
    const engine = createEngine(holdSpec());
    for (let t = 0; t <= 1200; t += 100) engine.push(angleFrame(t, 50));
    engine.push(angleFrame(3000, 50));
    const ev = [3500, 4000, 4100].flatMap((t) => engine.push(angleFrame(t, 50)));
    expect(ev).toEqual([{ type: 'hold:start', t: 3000, holdId: 'bent-hold' }]);
  });
});

describe('advance (R6f)', () => {
  function active(): { engine: ReturnType<typeof createEngine>; last: number } {
    const engine = createEngine(holdSpec());
    for (let t = 0; t <= 1200; t += 100) engine.push(angleFrame(t, 50));
    return { engine, last: 1200 };
  }

  it('ends an active hold only when the gap exceeds holdGapMs', () => {
    const { engine, last } = active();
    expect(engine.advance(last + 500)).toEqual([]);
    expect(engine.advance(last + 501)).toEqual([
      { type: 'hold:end', t: last + 501, holdId: 'bent-hold', durationMs: 1200, reason: 'lost-pose' },
    ]);
    expect(engine.advance(last + 900)).toEqual([]);
  });

  it('ignores t not newer than the latest seen t', () => {
    const { engine, last } = active();
    expect(engine.advance(last)).toEqual([]);
    expect(engine.advance(last - 100)).toEqual([]);
  });

  it('does not change phase, reps or partial cycle', () => {
    const { engine } = active();
    engine.advance(5000);
    expect(engine.phase).toBe('bent');
    expect(engine.repCount).toBe(0);
    const ev = engine.push(angleFrame(5100, 165));
    expect(ev.find((e) => e.type === 'rep')).toBeUndefined();
    const ev2 = [5200, 5300].flatMap((t) => engine.push(angleFrame(t, 50)));
    expect(ev2.some((e) => e.type === 'phase')).toBe(true);
  });

  it('emits nothing without an active hold', () => {
    const engine = createEngine(holdSpec());
    engine.push(angleFrame(0, 50));
    expect(engine.advance(5000)).toEqual([]);
  });

  it('triggers a hold:end rom sample through advance', () => {
    const engine = createEngine(holdSpec({ rom: [{ metric: 'm0', sampleOn: 'hold:end' }] }));
    for (let t = 0; t <= 1200; t += 100) engine.push(angleFrame(t, t === 600 ? 40 : 50));
    const ev = engine.advance(3000);
    expect(ev.map((e) => e.type)).toEqual(['hold:end', 'rom:sample']);
    const rom = ev[1] as Extract<MarrowEvent, { type: 'rom:sample' }>;
    expect(rom.t).toBe(3000);
    expect(rom.min).toBeCloseTo(40, 6);
    expect(rom.max).toBeCloseTo(50, 6);
    expect(rom.trigger).toBe('hold:end');
  });

  it('P23 (pose-loss timeout): advance ends the hold once and a later push adds no duplicate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 3000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 20, max: 200 }),
        (holdMs, extra, dt) => {
          const spec = holdSpec();
          const engine = createEngine(spec);
          let last = 0;
          for (let t = 0; ; t += dt) {
            engine.push(angleFrame(t, 50));
            last = t;
            if (t >= holdMs) break;
          }
          const t = last + spec.holdGapMs + extra;
          const ev = engine.advance(t);
          expect(ev.filter((e) => e.type === 'hold:end')).toEqual([
            { type: 'hold:end', t, holdId: 'bent-hold', durationMs: last, reason: 'lost-pose' },
          ]);
          const later = engine.push(angleFrame(t, 50));
          expect(later.filter((e) => e.type === 'hold:end')).toEqual([]);
        },
      ),
      RUNS,
    );
  });

  it('P18 (hold bounds): durations reach minMs, ticks are tickMs apart, starts pair with at most one end', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(50, 165, NaN), fc.integer({ min: 1, max: 700 })), { minLength: 1, maxLength: 60 }),
        (steps) => {
          const spec = holdSpec();
          const engine = createEngine(spec);
          let t = 0;
          const ev: MarrowEvent[] = [];
          for (const [v, dt] of steps) {
            t += dt;
            ev.push(...engine.push(Number.isNaN(v) ? nanFrame(t) : angleFrame(t, v)));
          }
          const hold = spec.holds![0]!;
          let open = false;
          let lastTick: number | null = null;
          for (const e of ev) {
            if (e.type === 'hold:start') {
              expect(open).toBe(false);
              open = true;
              lastTick = null;
            } else if (e.type === 'hold:tick') {
              expect(open).toBe(true);
              if (lastTick !== null) expect(e.t - lastTick).toBeGreaterThanOrEqual(hold.tickMs);
              lastTick = e.t;
            } else if (e.type === 'hold:end') {
              expect(open).toBe(true);
              expect(e.durationMs).toBeGreaterThanOrEqual(hold.minMs);
              open = false;
            }
          }
        },
      ),
      RUNS,
    );
  });
});

describe('form warnings (R6d)', () => {
  it('warns in an applicable phase', () => {
    const engine = createEngine(formSpec({ max: 0.25 }, ['bent']));
    const ev = [0, 100, 200, 300, 400].flatMap((t) => engine.push(offsetFrame(t, 0.4, 50)));
    expect(ev.filter((e) => e.type === 'form:warning')).toHaveLength(1);
  });

  it('counts the debounce from the first violating frame and reports the value', () => {
    const engine = createEngine(formSpec({ max: 0.25 }));
    const ev = [0, 100, 200, 300, 400, 500].flatMap((t) => engine.push(offsetFrame(t, 0.4)));
    const w = ev.filter((e) => e.type === 'form:warning');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ t: 300, ruleId: 'r', message: 'msg' });
    expect((w[0] as Extract<MarrowEvent, { type: 'form:warning' }>).value).toBeCloseTo(0.4, 6);
  });

  it('ignores violations outside the rule phases', () => {
    const engine = createEngine(formSpec({ max: 0.25 }, ['bent']));
    const ev = [0, 100, 200, 300, 400].flatMap((t) => engine.push(offsetFrame(t, 0.4)));
    expect(ev.some((e) => e.type === 'form:warning')).toBe(false);
  });

  it('handles min bounds', () => {
    const engine = createEngine(formSpec({ min: 0.1 }));
    const ev = [0, 200, 400].flatMap((t) => engine.push(offsetFrame(t, -0.2)));
    expect(ev.filter((e) => e.type === 'form:warning')).toHaveLength(1);
  });

  it('does not clear the latch inside the hysteresis margin, and NaN neither raises nor clears', () => {
    const engine = createEngine(formSpec({ max: 0.25 }));
    const ev: MarrowEvent[] = [];
    for (const t of [0, 400]) ev.push(...engine.push(offsetFrame(t, 0.4)));
    // 0.22 is within bounds but inside the 0.05 margin: still latched.
    for (const t of [500, 600]) engine.push(offsetFrame(t, 0.22));
    const hidden = offsetFrame(650, 0);
    hidden.landmarks[LM.leftElbow] = { ...hidden.landmarks[LM.leftElbow]!, visibility: 0 };
    engine.push(hidden);
    for (const t of [700, 1200]) ev.push(...engine.push(offsetFrame(t, 0.4)));
    expect(ev.filter((e) => e.type === 'form:warning')).toHaveLength(1);
  });

  it('P19 (form debounce): short violations never warn, a long one warns exactly once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 20, max: 300 }),
        fc.double({ min: 0.3, max: 1, noNaN: true }),
        (frames, dt, d) => {
          const spec = formSpec({ max: 0.25 });
          const rule = spec.formRules![0]!;
          const engine = createEngine(spec);
          const ev: MarrowEvent[] = [];
          for (let i = 0; i < frames; i++) ev.push(...engine.push(offsetFrame(i * dt, d)));
          ev.push(...engine.push(offsetFrame(frames * dt, 0)));
          const span = (frames - 1) * dt;
          const warnings = ev.filter((e) => e.type === 'form:warning').length;
          expect(warnings).toBe(span >= rule.debounceMs ? 1 : 0);
        },
      ),
      RUNS,
    );
  });

  it('P22 (form rearm): a compliant value inside the margin re-arms the rule, for any metric kind', () => {
    const kinds = fc.constantFrom('offset', 'angle');
    fc.assert(
      fc.property(kinds, fc.boolean(), fc.double({ min: 0.001, max: 0.5, noNaN: true }), (kind, useMax, over) => {
        const isAngle = kind === 'angle';
        const h = isAngle ? 8 : 0.05;
        const unit = isAngle ? 10 : 0.2;
        const bound = isAngle ? 90 : 0.2;
        const bad = (useMax ? bound + over * unit * 4 : bound - over * unit * 4) * 1;
        const good = useMax ? bound - h - 0.01 * unit : bound + h + 0.01 * unit;
        const bounds = useMax ? { max: bound } : { min: bound };
        const spec = isAngle
          ? elbowSpec({
              minRepMs: 0,
              formRules: [{ id: 'r', metric: 'm0', debounceMs: 300, message: 'msg', ...bounds }],
            })
          : formSpec(bounds);
        const frame = (t: number, v: number) => (isAngle ? angleFrame(t, v) : offsetFrame(t, v));
        const engine = createEngine(spec);
        const ev: MarrowEvent[] = [];
        for (const t of [0, 300]) ev.push(...engine.push(frame(t, bad)));
        ev.push(...engine.push(frame(400, good)));
        for (const t of [500, 800]) ev.push(...engine.push(frame(t, bad)));
        expect(ev.filter((e) => e.type === 'form:warning')).toHaveLength(2);
      }),
      RUNS,
    );
  });
});

describe('rom sampling (R6e)', () => {
  it('samples min and max since the previous trigger on rep and ignores NaN', () => {
    const spec = holdSpec({ holds: undefined });
    const engine = createEngine(spec);
    const frames = [
      angleFrame(0, 170),
      angleFrame(100, 50),
      nanFrame(200),
      angleFrame(300, 45),
      angleFrame(400, 165),
      angleFrame(500, 50),
      angleFrame(600, 165),
    ];
    const roms = frames.flatMap((f) => engine.push(f)).filter((e) => e.type === 'rom:sample') as Extract<
      MarrowEvent,
      { type: 'rom:sample' }
    >[];
    expect(roms).toHaveLength(2);
    expect(roms[0]).toMatchObject({ t: 400, metric: 'm0', trigger: 'rep' });
    expect(roms[0]!.min).toBeCloseTo(45, 6);
    expect(roms[0]!.max).toBeCloseTo(170, 6);
    expect(roms[1]!.min).toBeCloseTo(50, 6);
    expect(roms[1]!.max).toBeCloseTo(165, 6);
  });

  it('samples on phase entry', () => {
    const engine = createEngine(holdSpec({ rom: [{ metric: 'm0', sampleOn: 'phase:bent' }] }));
    const ev = [angleFrame(0, 170), angleFrame(100, 50)].flatMap((f) => engine.push(f));
    expect(ev.map((e) => e.type)).toEqual(['phase', 'phase', 'rom:sample']);
  });

  it('reset clears extremes, holds and latches', () => {
    const spec = holdSpec();
    const engine = createEngine(spec);
    const frames = [angleFrame(0, 170), angleFrame(700, 50), angleFrame(1800, 50), angleFrame(2000, 170), angleFrame(2100, 50), angleFrame(2800, 170)];
    const first = frames.flatMap((f) => engine.push(f));
    engine.reset();
    const second = frames.flatMap((f) => engine.push(f));
    expect(second).toEqual(first);
    expect(first.some((e) => e.type === 'hold:start')).toBe(true);
  });
});
