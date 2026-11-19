import type { HistoryEntry } from '../storage/codec';
import type { Store } from '../storage/store';
import { computeStreak, qualifies } from '../streak/streak';
import { toDayKey } from '../streak/dayKey';
import type { SetSummary } from '../summary/summarize';

export interface RecordInput {
  summary: SetSummary;
  mode: 'camera' | 'demo';
  circuitId?: string;
  /** Epoch ms when the set started. */
  startedAt: number;
  /** Minutes east of UTC, for the local day key. */
  offsetMinutes: number;
}

export interface Recorded {
  saved: boolean;
  /** This set made the current week a streak week for the first time (R12.8). */
  streakGain: boolean;
  /** Streak after the set. */
  streakWeeks: number;
}

export function localDayKey(epochMs: number): string {
  return toDayKey(epochMs, -new Date(epochMs).getTimezoneOffset());
}

/**
 * Save a finished set unless it is empty (R9.9), and compare the streak before and after (R11.8, R12.8).
 * Demo sets are saved with `mode: "demo"` and never qualify for the streak. Never throws.
 */
export async function recordSet(store: Store, input: RecordInput, id: string, now = Date.now()): Promise<Recorded> {
  const { summary } = input;
  if (summary.reps <= 0 && summary.holdMs <= 0) return { saved: false, streakGain: false, streakWeeks: 0 };
  const today = localDayKey(now);
  const entry: HistoryEntry = {
    ...summary,
    id,
    mode: input.mode,
    startedAt: input.startedAt,
    day: toDayKey(input.startedAt, input.offsetMinutes),
    ...(input.circuitId ? { circuitId: input.circuitId } : {}),
  };
  try {
    const before = computeStreak(await store.loadHistory(), today);
    const after = computeStreak(await store.addEntry(entry), today);
    return {
      saved: true,
      streakGain: qualifies(entry) && !before.thisWeekQualified && after.thisWeekQualified,
      streakWeeks: after.current,
    };
  } catch {
    return { saved: false, streakGain: false, streakWeeks: 0 };
  }
}
