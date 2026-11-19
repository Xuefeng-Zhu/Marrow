import { getWorkout } from '../movements/registry';
import type { SetSummary } from '../summary/summarize';

export function movementName(id: string): string {
  return getWorkout(id)?.name ?? id;
}

export function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

/** Reps for a rep workout, hold seconds for a hold workout. */
export function resultText(s: Pick<SetSummary, 'kind' | 'reps' | 'holdMs'>): string {
  return s.kind === 'reps' ? `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}` : `${seconds(s.holdMs)} hold`;
}

/** "n/a" instead of 0% when there is nothing to measure (R9.4). */
export function cleanText(s: Pick<SetSummary, 'kind' | 'reps' | 'holdMs' | 'cleanPct'>): string {
  const measured = s.kind === 'reps' ? s.reps > 0 : s.holdMs > 0;
  return measured ? `${s.cleanPct}%` : 'n/a';
}

export function hasWork(s: Pick<SetSummary, 'reps' | 'holdMs'>): boolean {
  return s.reps > 0 || s.holdMs > 0;
}
