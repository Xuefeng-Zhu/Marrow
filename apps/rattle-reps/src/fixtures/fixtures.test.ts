// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createEngine,
  createFixturePlayer,
  createPipeline,
  parseFixture,
  replay,
  type Clock,
  type MarrowEvent,
} from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { generateFixtures, serializeFixture } from '../../scripts/make-fixtures';
import { getWorkout } from '../movements/registry';
import { getFixture } from './index';

const IDS = ['squat', 'push-up', 'lunge', 'jumping-jack', 'plank'] as const;
const generated = generateFixtures();

/** What each clip must produce through the core engine, before any app-side checks. */
const EXPECTED: Record<string, { reps: number; warnings: Record<string, number> }> = {
  // Three clean reps, knees caving once, then two consecutive shallow reps. The core latches the
  // shallow-depth rule, so it warns for the first shallow rep only.
  squat: { reps: 6, warnings: { 'knees-caving': 1, 'shallow-depth': 1 } },
  'push-up': { reps: 6, warnings: { 'hips-sagging': 1, 'shallow-depth': 1 } },
  lunge: { reps: 5, warnings: { 'knee-past-ankle': 1 } },
  'jumping-jack': { reps: 8, warnings: { 'arms-low': 1 } },
  // The plank spec also counts a rep when the hold ends; the app ignores plank reps.
  plank: { reps: 1, warnings: { 'hips-sagging': 1 } },
};

function warningCounts(events: readonly MarrowEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) if (e.type === 'form:warning') out[e.ruleId] = (out[e.ruleId] ?? 0) + 1;
  return out;
}

function replayEvents(id: string): MarrowEvent[] {
  const engine = createEngine(getWorkout(id)!.spec);
  return [...replay(getFixture(id)!)].flatMap((f) => engine.push(f));
}

/** A clock that runs timers in due order, immediately, without waiting. */
function drainingClock() {
  const timers: { at: number; fn: () => void }[] = [];
  let now = 0;
  const clock: Clock = {
    setTimeout(fn, ms) {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return timer;
    },
    clearTimeout(h) {
      const i = timers.indexOf(h as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  return {
    clock,
    drain() {
      while (timers.length > 0) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers.shift()!;
        now = next.at;
        next.fn();
      }
    },
  };
}

describe.each(IDS)('fixture %s', (id) => {
  it('the committed file equals the generated output, byte for byte', () => {
    const committed = readFileSync(fileURLToPath(new URL(`./${id}.json`, import.meta.url)), 'utf8');
    expect(committed).toBe(serializeFixture(generated[id]!));
  });

  it('is accepted by parseFixture, is 15 to 30 s long at 20 fps and has a matching id', () => {
    const fx = parseFixture(JSON.parse(serializeFixture(generated[id]!)));
    expect(fx.id).toBe(id);
    expect(fx.fps).toBe(20);
    const seconds = fx.frames[fx.frames.length - 1]!.t / 1000;
    expect(seconds).toBeGreaterThanOrEqual(15);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(getFixture(id)).toEqual(fx);
  });

  it('is the clip named by the workout', () => {
    expect(getWorkout(id)!.fixtureId).toBe(id);
  });

  it('replays to the expected reps and warnings through the core engine', () => {
    const events = replayEvents(id);
    expect(events.filter((e) => e.type === 'rep')).toHaveLength(EXPECTED[id]!.reps);
    expect(warningCounts(events)).toEqual(EXPECTED[id]!.warnings);
  });

  it('replays deterministically and equals the fixture player output (P35)', () => {
    const first = replayEvents(id);
    expect(replayEvents(id)).toEqual(first);

    const { clock, drain } = drainingClock();
    const source = createFixturePlayer(getFixture(id)!, { clock });
    const engine = createEngine(getWorkout(id)!.spec);
    const played: MarrowEvent[] = [];
    source.onFrame((f) => played.push(...engine.push(f)));
    void source.start();
    drain();
    expect(played).toEqual(first);
  });

  it('gives the same reps and warnings through the smoothed pipeline the app uses', () => {
    const { clock, drain } = drainingClock();
    const pipeline = createPipeline({
      source: createFixturePlayer(getFixture(id)!, { clock }),
      spec: getWorkout(id)!.spec,
    });
    const events: MarrowEvent[] = [];
    for (const type of ['rep', 'form:warning', 'hold:start', 'hold:end'] as const) {
      pipeline.on(type, (e) => events.push(e));
    }
    void pipeline.start();
    drain();
    expect(events.filter((e) => e.type === 'rep')).toHaveLength(EXPECTED[id]!.reps);
    expect(warningCounts(events)).toEqual(EXPECTED[id]!.warnings);
  });
});

describe('squat and push-up depth', () => {
  it.each([
    ['squat', 100],
    ['push-up', 90],
  ])('%s: the last two reps are shallow and the first four are not, per rom:sample', (id, bound) => {
    const mins = replayEvents(id)
      .filter((e): e is Extract<MarrowEvent, { type: 'rom:sample' }> => e.type === 'rom:sample')
      .map((e) => e.min);
    expect(mins).toHaveLength(6);
    expect(mins.slice(0, 4).every((m) => m <= bound)).toBe(true);
    expect(mins.slice(4).every((m) => m > bound)).toBe(true);
  });

  it.each(['squat', 'push-up'])('%s: the core warns shallow-depth in the first shallow rep window only', (id) => {
    const events = replayEvents(id);
    const reps = events.filter((e) => e.type === 'rep').map((e) => e.t);
    const shallow = events.filter((e) => e.type === 'form:warning' && e.ruleId === 'shallow-depth');
    expect(shallow).toHaveLength(1);
    expect(shallow[0]!.t).toBeGreaterThan(reps[3]!);
    expect(shallow[0]!.t).toBeLessThanOrEqual(reps[4]!);
  });
});

describe('plank clip', () => {
  it('has one hold that starts, ticks and is released', () => {
    const events = replayEvents('plank');
    expect(events.filter((e) => e.type === 'hold:start')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'hold:tick').length).toBeGreaterThan(20);
    const ends = events.filter((e) => e.type === 'hold:end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'released' });
    expect((ends[0] as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(15000);
  });
});

describe('getFixture', () => {
  it('returns undefined for an unknown movement id', () => {
    expect(getFixture('nope')).toBeUndefined();
    expect(getFixture('toString')).toBeUndefined();
  });
});
