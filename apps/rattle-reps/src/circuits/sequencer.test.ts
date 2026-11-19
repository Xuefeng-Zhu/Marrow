import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WORKOUTS, getWorkout } from '../movements/registry';
import type { SetSummary } from '../summary/summarize';
import { PRESET_CIRCUITS, getCircuit } from './presets';
import { init, restSecondsLeft, step, type Circuit, type SeqAction, type SeqState } from './sequencer';

const summary = (movementId: string): SetSummary => ({
  movementId,
  kind: 'reps',
  reps: 5,
  cleanReps: 5,
  cleanPct: 100,
  holdMs: 0,
  tutMs: 1000,
  warnings: [],
});

const mkCircuit = (n: number): Circuit => ({
  id: 'c',
  name: 'C',
  blurb: '',
  steps: Array.from({ length: n }, (_, i) => ({ movementId: `m${i}`, target: { kind: 'reps', reps: 5 }, restSec: 10 })),
});

const actionFor = (c: Circuit, state: SeqState, kind: number): SeqAction => {
  const id = state.phase === 'work' ? (c.steps[state.index]?.movementId ?? 'x') : 'x';
  return [
    { type: 'setEnded', summary: summary(id) },
    { type: 'restEnded' },
    { type: 'skipStep' },
    { type: 'skipRest' },
  ][kind % 4] as SeqAction;
};

const circuitArb = fc.integer({ min: 1, max: 6 }).map(mkCircuit);
const kindsArb = fc.array(fc.nat(3), { maxLength: 60 });

function drive(c: Circuit, kinds: readonly number[]) {
  let state = init(c);
  const trace: SeqState[] = [state];
  for (const k of kinds) {
    state = step(c, state, actionFor(c, state, k));
    trace.push(state);
  }
  return trace;
}

describe('sequencer examples', () => {
  const c = mkCircuit(2);

  it('starts at step 0 in work', () => {
    expect(init(c)).toEqual({ phase: 'work', index: 0, results: [] });
  });

  it('moves work, rest, work, done and records results', () => {
    let s = init(c);
    s = step(c, s, { type: 'setEnded', summary: summary('m0') });
    expect(s).toMatchObject({ phase: 'rest', index: 0 });
    s = step(c, s, { type: 'skipRest' });
    expect(s).toMatchObject({ phase: 'work', index: 1 });
    s = step(c, s, { type: 'skipStep' });
    expect(s.phase).toBe('done');
    expect(s.results).toEqual([
      { index: 0, movementId: 'm0', summary: summary('m0') },
      { index: 1, movementId: 'm1', summary: null },
    ]);
  });

  it('has no rest after the last step', () => {
    const one = mkCircuit(1);
    expect(step(one, init(one), { type: 'setEnded', summary: summary('m0') }).phase).toBe('done');
  });

  it('ignores inapplicable actions by returning the same object', () => {
    const s = init(c);
    expect(step(c, s, { type: 'restEnded' })).toBe(s);
    expect(step(c, s, { type: 'skipRest' })).toBe(s);
    const r = step(c, s, { type: 'skipStep' });
    expect(step(c, r, { type: 'setEnded', summary: summary('m0') })).toBe(r);
    expect(step(c, r, { type: 'skipStep' })).toBe(r);
  });

  it('restSecondsLeft counts down in whole seconds, clamped', () => {
    expect(restSecondsLeft(1000, 1000, 20)).toBe(20);
    expect(restSecondsLeft(1000, 1001, 20)).toBe(20);
    expect(restSecondsLeft(1000, 2000, 20)).toBe(19);
    expect(restSecondsLeft(1000, 21_000, 20)).toBe(0);
    expect(restSecondsLeft(1000, 99_000, 20)).toBe(0);
    expect(restSecondsLeft(1000, 0, 20)).toBe(20);
  });
});

describe('sequencer properties', () => {
  it('P23 visits every step once, in order, in the work state', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, (c, kinds) => {
        // Pad with always-applicable actions so every run finishes.
        const padded = [...kinds, ...Array.from({ length: 2 * c.steps.length }, (_, i) => (i % 2 === 0 ? 0 : 1))];
        let state = init(c);
        const visited: number[] = [0];
        for (const k of padded) {
          const next = step(c, state, actionFor(c, state, k));
          if (next.phase === 'work' && (state.phase !== 'work' || next.index !== state.index)) visited.push(next.index);
          state = next;
        }
        expect(state.phase).toBe('done');
        expect(visited).toEqual(c.steps.map((_, i) => i));
      }),
    );
  });

  it('P24 index in bounds and never decreases', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, (c, kinds) => {
        let last = 0;
        for (const s of drive(c, kinds)) {
          if (s.phase === 'done') continue;
          expect(s.index).toBeGreaterThanOrEqual(last);
          expect(s.index).toBeLessThanOrEqual(c.steps.length - 1);
          last = s.index;
        }
      }),
    );
  });

  it('P25 a rest occurs only after a non-last step and never first', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, (c, kinds) => {
        const trace = drive(c, kinds);
        expect(trace[0]!.phase).toBe('work');
        for (const s of trace) if (s.phase === 'rest') expect(s.index).toBeLessThan(c.steps.length - 1);
      }),
    );
  });

  it('P26 done is terminal', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, fc.nat(3), (c, kinds, k) => {
        const trace = drive(c, kinds);
        const doneAt = trace.findIndex((s) => s.phase === 'done');
        if (doneAt < 0) return;
        const done = trace[doneAt]!;
        for (const s of trace.slice(doneAt)) expect(s).toBe(done);
        expect(step(c, done, actionFor(c, done, k))).toBe(done);
      }),
    );
  });

  it('P27 inapplicable actions leave the state unchanged', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, fc.nat(3), (c, kinds, k) => {
        for (const s of drive(c, kinds)) {
          const a = actionFor(c, s, k);
          const applies =
            s.phase === 'work' ? a.type === 'setEnded' || a.type === 'skipStep' : s.phase === 'rest' && (a.type === 'restEnded' || a.type === 'skipRest');
          if (!applies) expect(step(c, s, a)).toBe(s);
        }
      }),
    );
  });

  it('P28 finishing every state takes at most 2N - 1 transitions', () => {
    fc.assert(
      fc.property(circuitArb, fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }), (c, skips) => {
        let state = init(c);
        let transitions = 0;
        while (state.phase !== 'done') {
          const skip = skips[transitions % skips.length]!;
          const a: SeqAction =
            state.phase === 'work'
              ? skip
                ? { type: 'skipStep' }
                : { type: 'setEnded', summary: summary('x') }
              : skip
                ? { type: 'skipRest' }
                : { type: 'restEnded' };
          state = step(c, state, a);
          transitions += 1;
          expect(transitions).toBeLessThanOrEqual(2 * c.steps.length - 1);
        }
        expect(transitions).toBe(2 * c.steps.length - 1);
      }),
    );
  });

  it('P29 results align with steps, and skipped steps hold no summary', () => {
    fc.assert(
      fc.property(circuitArb, kindsArb, (c, kinds) => {
        for (const s of drive(c, kinds)) {
          const finished = s.phase === 'work' ? s.index : s.phase === 'rest' ? s.index + 1 : c.steps.length;
          expect(s.results.map((r) => r.index)).toEqual(Array.from({ length: finished }, (_, i) => i));
          s.results.forEach((r) => expect(r.movementId).toBe(c.steps[r.index]!.movementId));
        }
        const c2 = c;
        const skipped = step(c2, init(c2), { type: 'skipStep' });
        expect(skipped.results[0]?.summary).toBeNull();
      }),
    );
  });

  it('restSecondsLeft is within [0, restSec] and non-increasing in now', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 120 }), fc.integer({ min: 0, max: 200_000 }), fc.integer({ min: 0, max: 5000 }), (rest, dt, extra) => {
        const a = restSecondsLeft(0, dt, rest);
        const b = restSecondsLeft(0, dt + extra, rest);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(rest);
        expect(b).toBeLessThanOrEqual(a);
      }),
    );
  });
});

describe('presets (P30)', () => {
  it('ships at least three presets, one using all five movements', () => {
    expect(PRESET_CIRCUITS.length).toBeGreaterThanOrEqual(3);
    const all = WORKOUTS.map((w) => w.id);
    expect(all).toHaveLength(5);
    expect(PRESET_CIRCUITS.some((c) => all.every((id) => c.steps.some((s) => s.movementId === id)))).toBe(true);
  });

  it('every preset is valid against the registry', () => {
    const ids = new Set<string>();
    for (const c of PRESET_CIRCUITS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(getCircuit(c.id)).toBe(c);
      expect(c.steps.length).toBeGreaterThanOrEqual(1);
      for (const s of c.steps) {
        const w = getWorkout(s.movementId);
        expect(w, `${c.id}: ${s.movementId}`).toBeDefined();
        expect(s.target.kind).toBe(w!.kind);
        expect(s.target.kind === 'reps' ? s.target.reps : s.target.seconds).toBeGreaterThan(0);
        expect(s.restSec).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
