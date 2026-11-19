import { isDayKey, weekIndex } from './dayKey';

export const MIN_STREAK_REPS = 5;
export const MIN_STREAK_HOLD_MS = 10_000;

/** The fields of a history entry that the streak reads. */
export interface StreakEntry {
  mode: 'camera' | 'demo';
  kind: 'reps' | 'hold';
  reps: number;
  holdMs: number;
  day: string;
}

export interface StreakResult {
  current: number;
  longest: number;
  thisWeekQualified: boolean;
  weeksActive: number;
}

export function qualifies(entry: Pick<StreakEntry, 'mode' | 'kind' | 'reps' | 'holdMs'>): boolean {
  if (entry.mode !== 'camera') return false;
  return entry.kind === 'reps' ? entry.reps >= MIN_STREAK_REPS : entry.holdMs >= MIN_STREAK_HOLD_MS;
}

export function computeStreak(entries: readonly StreakEntry[], today: string): StreakResult {
  const weeks = new Set<number>();
  for (const e of entries) {
    // Day keys compare correctly as strings because they are zero-padded.
    if (isDayKey(e.day) && e.day <= today && qualifies(e)) weeks.add(weekIndex(e.day));
  }
  const cur = weekIndex(today);
  const anchor = weeks.has(cur) ? cur : weeks.has(cur - 1) ? cur - 1 : null;
  let current = 0;
  if (anchor !== null) {
    for (let w = anchor; weeks.has(w); w--) current += 1;
  }
  let longest = 0;
  for (const w of weeks) {
    if (weeks.has(w - 1)) continue; // not the start of a run
    let len = 0;
    for (let x = w; weeks.has(x); x++) len += 1;
    longest = Math.max(longest, len);
  }
  return { current, longest, thisWeekQualified: weeks.has(cur), weeksActive: weeks.size };
}
