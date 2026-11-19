import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PRESET_CIRCUITS } from '../circuits/presets';
import { WORKOUTS } from '../movements/registry';
import type { SetSummary } from '../summary/summarize';
import { INITIAL_SCREEN, screenReducer, type Screen, type ScreenAction } from './screenReducer';

const summary = (movementId: string): SetSummary => ({
  movementId,
  kind: 'reps',
  reps: 5,
  cleanReps: 5,
  cleanPct: 100,
  holdMs: 0,
  tutMs: 4000,
  warnings: [],
});

function run(actions: ScreenAction[], from: Screen = INITIAL_SCREEN): Screen {
  return actions.reduce(screenReducer, from);
}

const startWorkout: ScreenAction[] = [
  { type: 'pickWorkout', id: 'squat' },
  { type: 'chooseMode', mode: 'demo' },
];

describe('skipStep', () => {
  const start: ScreenAction[] = [{ type: 'pickCircuit', id: 'spooky-starter' }, { type: 'chooseMode', mode: 'demo' }];

  it('moves to the next step of a circuit without a summary', () => {
    const s = run([...start, { type: 'skipStep' }]);
    expect(s).toMatchObject({ name: 'session', run: { seq: { phase: 'work', index: 1 } } });
  });

  it('ends at the circuit summary after the last step and is ignored outside a circuit', () => {
    const s = run([...start, { type: 'skipStep' }, { type: 'skipStep' }, { type: 'skipStep' }]);
    expect(s).toMatchObject({ name: 'circuitSummary', run: { seq: { phase: 'done' } } });
    const w = run(startWorkout);
    expect(screenReducer(w, { type: 'skipStep' })).toBe(w);
  });
});

describe('screenReducer examples', () => {
  it('goes picker, mode, session, summary', () => {
    const s = run([...startWorkout, { type: 'setEnded', summary: summary('squat'), saved: true }]);
    expect(s).toMatchObject({ name: 'summary', saved: true, streakGain: false });
  });

  it('again enters a session from a summary with the same run', () => {
    const summaryScreen = run([...startWorkout, { type: 'setEnded', summary: summary('squat') }]);
    const again = screenReducer(summaryScreen, { type: 'again' });
    expect(again.name).toBe('session');
    if (again.name === 'session' && summaryScreen.name === 'summary') expect(again.run).toBe(summaryScreen.run);
  });

  it('circuit next enters a session for the next step and ends in the circuit summary', () => {
    const circuit = PRESET_CIRCUITS[0]!;
    let s = run([{ type: 'pickCircuit', id: circuit.id }, { type: 'chooseMode', mode: 'demo' }]);
    for (let i = 0; i < circuit.steps.length; i++) {
      expect(s.name).toBe('session');
      if (s.name === 'session') expect(s.run.target).toEqual(circuit.steps[i]!.target);
      s = run([{ type: 'setEnded', summary: summary(circuit.steps[i]!.movementId) }], s);
      expect(s.name).toBe('summary');
      s = screenReducer(s, { type: 'next' });
    }
    expect(s.name).toBe('circuitSummary');
    expect(screenReducer(s, { type: 'home' })).toEqual({ name: 'picker' });
  });

  it('history opens from the picker and returns to it', () => {
    const h = screenReducer(INITIAL_SCREEN, { type: 'openHistory' });
    expect(h.name).toBe('history');
    expect(screenReducer(h, { type: 'back' })).toEqual({ name: 'picker' });
  });

  it('returns the same object for invalid actions', () => {
    expect(screenReducer(INITIAL_SCREEN, { type: 'again' })).toBe(INITIAL_SCREEN);
    expect(screenReducer(INITIAL_SCREEN, { type: 'chooseMode', mode: 'demo' })).toBe(INITIAL_SCREEN);
    expect(screenReducer(INITIAL_SCREEN, { type: 'pickWorkout', id: 'nope' })).toBe(INITIAL_SCREEN);
    expect(screenReducer(INITIAL_SCREEN, { type: 'pickCircuit', id: 'nope' })).toBe(INITIAL_SCREEN);
  });

  it('again does nothing for a circuit run', () => {
    const circuit = PRESET_CIRCUITS[0]!;
    const s = run([
      { type: 'pickCircuit', id: circuit.id },
      { type: 'chooseMode', mode: 'demo' },
      { type: 'setEnded', summary: summary('squat') },
    ]);
    expect(screenReducer(s, { type: 'again' })).toBe(s);
  });
});

const ids = [...WORKOUTS.map((w) => w.id), ...PRESET_CIRCUITS.map((c) => c.id), 'nope'];
const actionArb: fc.Arbitrary<ScreenAction> = fc.oneof(
  fc.constantFrom(...ids).map((id): ScreenAction => ({ type: 'pickWorkout', id })),
  fc.constantFrom(...ids).map((id): ScreenAction => ({ type: 'pickCircuit', id })),
  fc.constantFrom<'camera' | 'demo'>('camera', 'demo').map((mode): ScreenAction => ({ type: 'chooseMode', mode })),
  fc.boolean().map((saved): ScreenAction => ({ type: 'setEnded', summary: summary('squat'), saved })),
  fc.constantFrom<ScreenAction>(
    { type: 'again' },
    { type: 'next' },
    { type: 'home' },
    { type: 'openHistory' },
    { type: 'back' },
  ),
);

describe('P31 screen reducer', () => {
  it('always yields a defined screen, starts runs only via chooseMode and enters session only from mode or summary', () => {
    const names = ['picker', 'mode', 'session', 'summary', 'circuitSummary', 'history'];
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 60 }), (actions) => {
        let state: Screen = INITIAL_SCREEN;
        for (const action of actions) {
          const next = screenReducer(state, action);
          expect(names).toContain(next.name);
          if (next.name === 'session' && !(state.name === 'session' && next === state)) {
            const viaChoose = state.name === 'mode' && action.type === 'chooseMode';
            const viaAgain = state.name === 'summary' && action.type === 'again';
            const viaNext = state.name === 'summary' && action.type === 'next';
            expect(viaChoose || viaAgain || viaNext).toBe(true);
            if (viaAgain && state.name === 'summary') expect(next).toMatchObject({ run: state.run });
          }
          state = next;
        }
      }),
    );
  });
});

describe('stale and skipped results', () => {
  const start: ScreenAction[] = [{ type: 'pickCircuit', id: 'spooky-starter' }, { type: 'chooseMode', mode: 'demo' }];

  it('ignores a result that belongs to a previous step', () => {
    const first = run(start);
    if (first.name !== 'session') throw new Error('expected a session');
    const second = screenReducer(first, { type: 'skipStep', run: first.run });
    expect(second).toMatchObject({ name: 'session', run: { seq: { index: 1 } } });
    // The slow save of step one finishes after the skip.
    expect(screenReducer(second, { type: 'setEnded', run: first.run, summary: summary('squat') })).toBe(second);
    expect(screenReducer(second, { type: 'skipStep', run: first.run })).toBe(second);
  });

  it('accepts a result of the current run', () => {
    const first = run(start);
    if (first.name !== 'session') throw new Error('expected a session');
    expect(screenReducer(first, { type: 'setEnded', run: first.run, summary: summary('squat') }).name).toBe('summary');
  });

  it('keeps the partial set of a skipped step', () => {
    const s = run([...start, { type: 'skipStep', summary: summary('squat') }]);
    if (s.name !== 'session') throw new Error('expected a session');
    expect(s.run.seq?.results[0]?.summary).toMatchObject({ movementId: 'squat', reps: 5 });
  });
});
