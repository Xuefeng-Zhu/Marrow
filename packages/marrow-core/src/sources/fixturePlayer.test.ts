/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateElbowCycleFixture, serializeFixture } from '../../scripts/make-fixture';
import { createEngine } from '../engine/engine';
import type { MarrowEvent } from '../engine/events';
import { parseFixture, type Fixture } from '../fixtures/schema';
import { parseMovementSpec } from '../spec/parse';
import type { Frame } from '../types';
import { createFixturePlayer, replay, type Clock } from './fixturePlayer';

const fixtureUrl = new URL('../../fixtures/elbow-cycle-3reps.json', import.meta.url);
const committedText = readFileSync(fixtureUrl, 'utf8');
const fixture = parseFixture(JSON.parse(committedText));

const specFile = Object.values(
  import.meta.glob('../../specs/elbow-cycle.json', { eager: true, import: 'default' }),
)[0];
const parsed = parseMovementSpec(specFile);
if (!parsed.ok) throw new Error('example spec invalid');
const spec = parsed.spec;

/** A fake clock whose timers fire only when `advance` is called. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
  };
  return {
    clock,
    pending: () => timers.size,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let best: [number, { at: number; fn: () => void }] | undefined;
        for (const e of timers) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        timers.delete(best[0]);
        now = Math.max(now, best[1].at);
        best[1].fn();
      }
      now = end;
    },
  };
}

function tiny(frames: number, fps = 10): Fixture {
  const l = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]) as Fixture['frames'][number]['l'];
  return {
    version: 1,
    id: 'tiny',
    description: '',
    fps,
    landmarkCount: 33,
    frames: Array.from({ length: frames }, (_, i) => ({ t: i * (1000 / fps), l })),
  };
}

function collect(player: ReturnType<typeof createFixturePlayer>): Frame[] {
  const out: Frame[] = [];
  player.onFrame((f) => out.push(f));
  return out;
}

describe('committed fixture', () => {
  it('equals the output of scripts/make-fixture.ts', () => {
    expect(committedText).toBe(serializeFixture(generateElbowCycleFixture()));
  });

  it('is a valid fixture with 33 landmarks per frame', () => {
    expect(fixture.id).toBe('elbow-cycle-3reps');
    expect(fixture.frames.every((f) => f.l.length === 33)).toBe(true);
  });
});

describe('fixture player timing (R2b)', () => {
  it('delivers frames in order at their recorded times', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(3), { clock: fc.clock });
    const got = collect(player);
    await player.start();
    expect(got).toHaveLength(0);
    fc.advance(0);
    expect(got.map((f) => f.t)).toEqual([0]);
    fc.advance(99);
    expect(got.map((f) => f.t)).toEqual([0]);
    fc.advance(1);
    expect(got.map((f) => f.t)).toEqual([0, 100]);
    fc.advance(100);
    expect(got.map((f) => f.t)).toEqual([0, 100, 200]);
    expect(fc.pending()).toBe(0);
    expect(got[0]!.landmarks).toHaveLength(33);
  });

  it('speed scales the schedule but not the frame timestamps', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(3), { clock: fc.clock, speed: 2 });
    const got = collect(player);
    await player.start();
    fc.advance(50);
    expect(got.map((f) => f.t)).toEqual([0, 100]);
    fc.advance(50);
    expect(got.map((f) => f.t)).toEqual([0, 100, 200]);
  });

  it('loops with an offset that keeps t increasing', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(3), { clock: fc.clock, loop: true });
    const got = collect(player);
    await player.start();
    fc.advance(500);
    expect(got.map((f) => f.t)).toEqual([0, 100, 200, 300, 400, 500]);
  });

  it('start twice is a no-op and stop halts delivery and clears the timer', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(5), { clock: fc.clock });
    const got = collect(player);
    await player.start();
    await player.start();
    fc.advance(100);
    expect(got).toHaveLength(2);
    player.stop();
    expect(fc.pending()).toBe(0);
    fc.advance(1000);
    expect(got).toHaveLength(2);
  });

  it('restarts from the first frame after stop, with increasing t', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(3), { clock: fc.clock });
    const got = collect(player);
    await player.start();
    fc.advance(100);
    player.stop();
    await player.start();
    fc.advance(0);
    expect(got.map((f) => f.t)).toEqual([0, 100, 200]);
  });

  it('unsubscribe stops delivery to that listener only, and onPoseLost never fires', async () => {
    const fc = fakeClock();
    const player = createFixturePlayer(tiny(3), { clock: fc.clock });
    const a: number[] = [];
    const b: number[] = [];
    const lost: number[] = [];
    const offA = player.onFrame((f) => a.push(f.t));
    player.onFrame((f) => b.push(f.t));
    player.onPoseLost((t) => lost.push(t));
    await player.start();
    fc.advance(0);
    offA();
    fc.advance(1000);
    expect(a).toEqual([0]);
    expect(b).toEqual([0, 100, 200]);
    expect(lost).toEqual([]);
  });

  it('rejects an invalid speed', () => {
    expect(() => createFixturePlayer(tiny(2), { speed: 0 })).toThrow(RangeError);
  });
});

describe('replay (R2b.6)', () => {
  it('yields every frame synchronously with the recorded t', () => {
    const frames = [...replay(fixture)];
    expect(frames).toHaveLength(fixture.frames.length);
    expect(frames.map((f) => f.t)).toEqual(fixture.frames.map((f) => f.t));
  });
});

function runEngine(frames: Iterable<Frame>): MarrowEvent[] {
  const engine = createEngine(spec);
  const out: MarrowEvent[] = [];
  for (const f of frames) out.push(...engine.push(f));
  return out;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
function rounded(events: MarrowEvent[]): MarrowEvent[] {
  return events.map((e) =>
    e.type === 'rom:sample'
      ? { ...e, min: round(e.min), max: round(e.max) }
      : e.type === 'form:warning'
        ? { ...e, value: round(e.value) }
        : e,
  );
}

describe('P15 deterministic replay on the committed fixture', () => {
  it('gives deeply equal events across fresh engines, the player and replay()', async () => {
    const a = runEngine(replay(fixture));
    const b = runEngine(replay(fixture));
    const fc = fakeClock();
    const player = createFixturePlayer(fixture, { clock: fc.clock });
    const played: Frame[] = [];
    player.onFrame((f) => played.push(f));
    await player.start();
    fc.advance(60_000);
    expect(played).toHaveLength(fixture.frames.length);
    const c = runEngine(played);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('yields the golden event list: 3 reps, holds, one form warning, ROM samples', () => {
    const events = rounded(runEngine(replay(fixture)));
    const rom = (t: number): MarrowEvent => ({
      type: 'rom:sample',
      t,
      metric: 'elbowAngle',
      min: 49.987,
      max: 169.987,
      trigger: 'rep',
    });
    const cycle = (enter: number, rep: number, count: number, prev: number): MarrowEvent[] => [
      { type: 'phase', t: enter, from: 'extended', to: 'bent' },
      { type: 'hold:start', t: enter, holdId: 'bent-hold' },
      { type: 'hold:tick', t: enter + 1500, holdId: 'bent-hold', elapsedMs: 1500 },
      { type: 'phase', t: rep, from: 'bent', to: 'extended' },
      { type: 'rep', t: rep, count, durationMs: rep - prev, phaseEntries: { extended: prev, bent: enter } },
      rom(rep),
      { type: 'hold:end', t: rep, holdId: 'bent-hold', durationMs: rep - enter, reason: 'released' },
    ];
    const expected: MarrowEvent[] = [
      { type: 'phase', t: 0, from: null, to: 'extended' },
      ...cycle(750, 2650, 1, 0),
      { type: 'phase', t: 3750, from: 'extended', to: 'bent' },
      {
        type: 'form:warning',
        t: 4500,
        ruleId: 'elbow-drift',
        message: 'Keep your elbow close to your side',
        value: 0.4,
      },
      ...cycle(3750, 5650, 2, 2650).slice(1),
      ...cycle(6750, 8650, 3, 5650),
    ];
    expect(events).toEqual(expected);
  });
});
