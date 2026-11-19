import type { Target } from '../movements/workouts';
import type { SetSummary } from '../summary/summarize';

export interface CircuitStep {
  movementId: string;
  target: Target;
  restSec: number;
}

export interface Circuit {
  id: string;
  name: string;
  blurb: string;
  steps: readonly CircuitStep[];
}

/** `summary` is null when the step was skipped. */
export interface StepResult {
  index: number;
  movementId: string;
  summary: SetSummary | null;
}

export type SeqState =
  | { phase: 'work'; index: number; results: StepResult[] }
  /** `index` is the step just finished. */
  | { phase: 'rest'; index: number; results: StepResult[] }
  | { phase: 'done'; results: StepResult[] };

export type SeqAction =
  | { type: 'setEnded'; summary: SetSummary }
  /** A skipped step keeps the partial set, if there is one. */
  | { type: 'skipStep'; summary?: SetSummary }
  | { type: 'restEnded' }
  | { type: 'skipRest' };

export function init(_circuit: Circuit): SeqState {
  return { phase: 'work', index: 0, results: [] };
}

/** Total: an action that does not apply returns the same state object. */
export function step(circuit: Circuit, state: SeqState, action: SeqAction): SeqState {
  if (state.phase === 'done') return state;
  if (state.phase === 'work') {
    if (action.type !== 'setEnded' && action.type !== 'skipStep') return state;
    const movementId = circuit.steps[state.index]?.movementId ?? '';
    const results = [
      ...state.results,
      { index: state.index, movementId, summary: action.summary ?? null },
    ];
    return state.index >= circuit.steps.length - 1
      ? { phase: 'done', results }
      : { phase: 'rest', index: state.index, results };
  }
  if (action.type !== 'restEnded' && action.type !== 'skipRest') return state;
  return { phase: 'work', index: state.index + 1, results: state.results };
}

/** Whole seconds left in a rest, rounded up, within `[0, restSec]`. */
export function restSecondsLeft(startedAt: number, now: number, restSec: number): number {
  const left = Math.ceil(restSec - (now - startedAt) / 1000);
  return Math.min(restSec, Math.max(0, left));
}
