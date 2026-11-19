import { isMilestone } from '../session/cues';

export type EffectKind = 'rep' | 'milestone' | 'clean-set' | 'streak';

/** One request to show an effect. A new `key` is a new request. */
export interface EffectRequest {
  key: number;
  kind: EffectKind;
  /** Text form of the effect. Shown as a badge for the kinds that carry news (R18.4). */
  text: string;
}

export type EffectSpec = Omit<EffectRequest, 'key'>;

/** Share of clean reps that earns the clean-set effect (R17.1). */
export const CLEAN_SET_PCT = 80;

/** Every rep celebrates. Every 5th rep and the final rep of the target are milestones. */
export function repEffect(count: number, targetReps?: number): EffectSpec {
  return isMilestone(count, targetReps)
    ? { kind: 'milestone', text: `Rep ${count}!` }
    : { kind: 'rep', text: `Rep ${count}` };
}

/** A set with at least 80% clean reps celebrates, a set without reps or with fewer does not. */
export function setEffect(summary: { reps: number; cleanPct: number }): EffectSpec | null {
  return summary.reps > 0 && summary.cleanPct >= CLEAN_SET_PCT ? { kind: 'clean-set', text: 'Clean set!' } : null;
}

/** A week that newly counts toward the streak celebrates, with the new streak number as text. */
export function streakEffect(weeks: number): EffectSpec {
  return { kind: 'streak', text: `Streak: ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` };
}
