import type { MarrowEvent } from 'marrow-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getWorkout } from '../movements/registry';
import {
  MIN_WARNING_MS,
  cueFor,
  isMilestone,
  nextCue,
  shouldEmit,
  type ActiveCue,
  type Cue,
} from './cues';

const squat = getWorkout('squat')!;
const warn = (text: string): Cue => ({ kind: 'warning', text });
const phase = (text: string): Cue => ({ kind: 'phase', text });

describe('cueFor', () => {
  const events: MarrowEvent[] = [
    { type: 'rep', t: 1, count: 5, durationMs: 900, phaseEntries: {} },
    { type: 'phase', t: 1, from: null, to: 'bottom' },
    { type: 'hold:start', t: 1, holdId: 'h' },
    { type: 'hold:tick', t: 1, holdId: 'h', elapsedMs: 500 },
    { type: 'hold:end', t: 1, holdId: 'h', durationMs: 5, reason: 'released' },
    { type: 'hold:end', t: 1, holdId: 'h', durationMs: 5, reason: 'lost-pose' },
    { type: 'form:warning', t: 1, ruleId: 'knees-caving', message: 'Push your knees out', value: 0.1 },
    { type: 'rom:sample', t: 1, metric: 'kneeAngle', min: 90, max: 170, trigger: 'rep' },
  ];

  it('maps every event type', () => {
    expect(events.map((e) => cueFor(e, squat))).toEqual([
      { kind: 'rep', text: 'Rep 5', milestone: true },
      { kind: 'phase', text: 'Down' },
      { kind: 'hold', text: 'Hold it!' },
      null,
      { kind: 'hold', text: 'Nice hold' },
      { kind: 'info', text: 'Lost you, get back in frame' },
      { kind: 'warning', text: 'Push your knees out', ruleId: 'knees-caving', voice: 'Push your knees out' },
      null,
    ]);
  });

  it('gives no cue for a phase without cue text and flags non-milestone reps', () => {
    expect(cueFor({ type: 'phase', t: 1, from: null, to: 'unknown' }, squat)).toBeNull();
    expect(cueFor({ type: 'rep', t: 1, count: 4, durationMs: 1, phaseEntries: {} }, squat)).toMatchObject({
      milestone: false,
    });
  });

  it('isMilestone: every 5th rep and the final rep', () => {
    expect(isMilestone(5)).toBe(true);
    expect(isMilestone(4)).toBe(false);
    expect(isMilestone(4, 4)).toBe(true);
    expect(isMilestone(0, 0)).toBe(false);
  });
});

describe('nextCue', () => {
  it('shows an incoming cue when nothing is shown', () => {
    expect(nextCue(null, phase('Down'), 100)).toMatchObject({ cue: phase('Down'), shownAt: 100, expiresAt: null });
  });

  it('a newer warning replaces the current one', () => {
    const first = nextCue(null, warn('a'), 0);
    const second = nextCue(first, warn('b'), 500);
    expect(second?.cue.text).toBe('b');
    expect(second?.shownAt).toBe(500);
  });

  it('keeps a warning for at least 2 s against other cues', () => {
    const w = nextCue(null, warn('a'), 0);
    expect(nextCue(w, phase('Down'), MIN_WARNING_MS - 1)).toBe(w);
    expect(nextCue(w, null, 100)).toBe(w);
    expect(nextCue(w, phase('Down'), MIN_WARNING_MS)?.cue.text).toBe('Down');
  });

  it('clears an expired warning', () => {
    const w = nextCue(null, warn('a'), 0)!;
    expect(w.expiresAt).toBeGreaterThanOrEqual(2000);
    expect(nextCue(w, null, w.expiresAt!)).toBeNull();
    expect(nextCue(w, null, w.expiresAt! - 1)).toBe(w);
  });

  it('a warning is never hidden before 2 s by anything but a newer warning (property)', () => {
    const cueArb = fc.oneof(
      fc.constant<Cue | null>(null),
      fc.constant(phase('p')),
      fc.constant<Cue>({ kind: 'rep', text: 'r' }),
      fc.constant<Cue>({ kind: 'hold', text: 'h' }),
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(cueArb, fc.integer({ min: 0, max: 1999 })), { maxLength: 20 }), (steps) => {
        const w: ActiveCue = nextCue(null, warn('w'), 1000)!;
        let cur: ActiveCue | null = w;
        for (const [cue, dt] of steps) cur = nextCue(cur, cue, 1000 + dt);
        expect(cur?.cue.text).toBe('w');
      }),
    );
  });
});

describe('shouldEmit', () => {
  it('allows 3 effects per second', () => {
    expect(shouldEmit([], 1000)).toBe(true);
    expect(shouldEmit([100, 200], 1000)).toBe(true);
    expect(shouldEmit([100, 200, 300], 1000)).toBe(false);
    expect(shouldEmit([100, 200, 300], 1100)).toBe(true);
  });

  it('never lets more than 3 effects start in any second (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 400 }), { maxLength: 80 }), (gaps) => {
        const started: number[] = [];
        let now = 0;
        for (const gap of gaps) {
          now += gap;
          if (shouldEmit(started, now)) started.push(now);
        }
        for (const s of started) {
          expect(started.filter((x) => x >= s && x < s + 1000).length).toBeLessThanOrEqual(3);
        }
      }),
    );
  });
});
