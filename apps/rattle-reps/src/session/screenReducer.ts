import { getCircuit } from '../circuits/presets';
import { init, step, type SeqState } from '../circuits/sequencer';
import { getWorkout, type Target } from '../movements/registry';
import type { SetSummary } from '../summary/summarize';

export type Mode = 'camera' | 'demo';

export type Choice = { kind: 'workout'; id: string } | { kind: 'circuit'; id: string };

/** One run of a workout or circuit. Circuit state is held here and advanced with the sequencer. */
export interface Run {
  choice: Choice;
  mode: Mode;
  /** Target of the set being run (the current step's target for a circuit). */
  target: Target;
  seq?: SeqState;
}

export type Screen =
  | { name: 'picker' }
  | { name: 'mode'; choice: Choice }
  | { name: 'session'; run: Run }
  | { name: 'summary'; run: Run; summary: SetSummary; saved: boolean; streakGain: boolean }
  | { name: 'circuitSummary'; run: Run }
  | { name: 'history' };

export type ScreenAction =
  | { type: 'pickWorkout'; id: string }
  | { type: 'pickCircuit'; id: string }
  | { type: 'chooseMode'; mode: Mode }
  /** `run` is the run the result belongs to. A result of another run or step is stale and ignored. */
  | { type: 'setEnded'; summary: SetSummary; saved?: boolean; streakGain?: boolean; run?: Run }
  | { type: 'skipStep'; summary?: SetSummary; run?: Run }
  | { type: 'again' }
  | { type: 'next' }
  | { type: 'home' }
  | { type: 'openHistory' }
  | { type: 'back' };

export const INITIAL_SCREEN: Screen = { name: 'picker' };

/** The id of the movement that the run is on now. */
export function currentMovementId(run: Run): string | undefined {
  if (run.choice.kind === 'workout') return run.choice.id;
  const circuit = getCircuit(run.choice.id);
  const index = run.seq && run.seq.phase !== 'done' ? run.seq.index : undefined;
  return index === undefined ? undefined : circuit?.steps[index]?.movementId;
}

/**
 * Pure screen state machine. An action that does not apply returns the same state object (P31).
 * A new run starts only from `mode` through `chooseMode`. `session` is otherwise entered only from
 * `summary`: `again` repeats the same workout run, and `next` starts the next circuit step.
 */
export function screenReducer(state: Screen, action: ScreenAction): Screen {
  switch (action.type) {
    case 'pickWorkout':
      return state.name === 'picker' && getWorkout(action.id)
        ? { name: 'mode', choice: { kind: 'workout', id: action.id } }
        : state;
    case 'pickCircuit':
      return state.name === 'picker' && getCircuit(action.id)
        ? { name: 'mode', choice: { kind: 'circuit', id: action.id } }
        : state;
    case 'chooseMode': {
      if (state.name !== 'mode') return state;
      const { choice } = state;
      if (choice.kind === 'workout') {
        const workout = getWorkout(choice.id);
        if (!workout) return state;
        return { name: 'session', run: { choice, mode: action.mode, target: workout.defaultTarget } };
      }
      const circuit = getCircuit(choice.id);
      const first = circuit?.steps[0];
      if (!circuit || !first) return state;
      return {
        name: 'session',
        run: { choice, mode: action.mode, target: first.target, seq: init(circuit) },
      };
    }
    case 'setEnded': {
      if (state.name !== 'session') return state;
      if (action.run && action.run !== state.run) return state;
      let run = state.run;
      if (run.choice.kind === 'circuit') {
        const circuit = getCircuit(run.choice.id);
        if (!circuit || !run.seq) return state;
        run = { ...run, seq: step(circuit, run.seq, { type: 'setEnded', summary: action.summary }) };
      }
      return {
        name: 'summary',
        run,
        summary: action.summary,
        saved: action.saved ?? false,
        streakGain: action.streakGain ?? false,
      };
    }
    case 'skipStep': {
      if (state.name !== 'session' || state.run.choice.kind !== 'circuit' || !state.run.seq) return state;
      if (action.run && action.run !== state.run) return state;
      const { run } = state;
      const circuit = getCircuit(run.choice.id);
      if (!circuit || !run.seq || run.seq.phase !== 'work') return state;
      const skipped = step(circuit, run.seq, { type: 'skipStep', summary: action.summary });
      if (skipped.phase === 'done') return { name: 'circuitSummary', run: { ...run, seq: skipped } };
      // A skipped step has no result to show, so the rest is skipped with it.
      const seq = step(circuit, skipped, { type: 'skipRest' });
      const target = seq.phase === 'work' ? circuit.steps[seq.index]?.target : undefined;
      // No target for the next step: end the circuit instead of ignoring the click.
      if (!target) return { name: 'circuitSummary', run: { ...run, seq: { phase: 'done', results: skipped.results } } };
      return { name: 'session', run: { ...run, seq, target } };
    }
    case 'again':
      return state.name === 'summary' && state.run.choice.kind === 'workout'
        ? { name: 'session', run: state.run }
        : state;
    case 'next': {
      if (state.name !== 'summary') return state;
      const { run } = state;
      if (run.choice.kind !== 'circuit' || !run.seq) return state;
      const circuit = getCircuit(run.choice.id);
      if (!circuit) return state;
      if (run.seq.phase === 'done') return { name: 'circuitSummary', run };
      if (run.seq.phase !== 'rest') return state;
      const seq = step(circuit, run.seq, { type: 'restEnded' });
      if (seq.phase !== 'work') return state;
      const target = circuit.steps[seq.index]?.target;
      return target ? { name: 'session', run: { ...run, seq, target } } : state;
    }
    case 'home':
      return state.name === 'picker' ? state : { name: 'picker' };
    case 'openHistory':
      return state.name === 'picker' ? { name: 'history' } : state;
    case 'back':
      return state.name === 'mode' || state.name === 'history' ? { name: 'picker' } : state;
  }
}
