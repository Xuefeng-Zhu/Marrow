import type { MarrowEvent } from 'marrow-core';

/** Time after a warning during which hold time counts as dirty. */
export const HOLD_WARNING_PENALTY_MS = 2000;

export interface SummaryInput {
  workout: { id: string; kind: 'reps' | 'hold' };
  /** In arrival order, already merged with synthesized depth warnings. */
  events: readonly MarrowEvent[];
  /** Timestamp of the first frame of the set. */
  startT: number;
  /** Timestamp at which the set ended. */
  stopT: number;
}

export interface WarningTally {
  ruleId: string;
  message: string;
  count: number;
}

export interface SetSummary {
  movementId: string;
  kind: 'reps' | 'hold';
  /** 0 for hold workouts. */
  reps: number;
  cleanReps: number;
  /** Integer 0..100, 0 when there is nothing to measure. */
  cleanPct: number;
  /** 0 for rep workouts. */
  holdMs: number;
  tutMs: number;
  warnings: WarningTally[];
}

interface Interval {
  start: number;
  end: number;
}

function holdIntervals(events: readonly MarrowEvent[], stopT: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const e of events) {
    if (e.type === 'hold:start') {
      open = e.t;
    } else if (e.type === 'hold:end' && open !== null) {
      // The measured hold ends at start + durationMs, not at the t of the end event.
      out.push({ start: open, end: open + Math.max(0, e.durationMs) });
      open = null;
    }
  }
  if (open !== null) out.push({ start: open, end: Math.max(open, stopT) });
  return out;
}

/** Length of the union of [w, w + penalty) for warnings w inside the interval, clipped to it. */
function dirtyMs(iv: Interval, warningTimes: readonly number[]): number {
  const spans = warningTimes
    .filter((w) => w >= iv.start && w <= iv.end)
    .map((w): Interval => ({ start: w, end: Math.min(w + HOLD_WARNING_PENALTY_MS, iv.end) }))
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curEnd = -Infinity;
  for (const s of spans) {
    const from = Math.max(s.start, curEnd);
    if (s.end > from) total += s.end - from;
    curEnd = Math.max(curEnd, s.end);
  }
  return total;
}

function tallyWarnings(events: readonly MarrowEvent[]): WarningTally[] {
  const byRule = new Map<string, WarningTally>();
  for (const e of events) {
    if (e.type !== 'form:warning') continue;
    const cur = byRule.get(e.ruleId);
    if (cur) cur.count += 1;
    else byRule.set(e.ruleId, { ruleId: e.ruleId, message: e.message, count: 1 });
  }
  return [...byRule.values()].sort((a, b) => b.count - a.count || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
}

export function summarize(input: SummaryInput): SetSummary {
  const { workout, events, startT, stopT } = input;
  const warnings = tallyWarnings(events);
  const warningTimes = events.filter((e) => e.type === 'form:warning').map((e) => e.t);

  if (workout.kind === 'hold') {
    const intervals = holdIntervals(events, stopT);
    const holdMs = intervals.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    const dirty = intervals.reduce((sum, iv) => sum + dirtyMs(iv, warningTimes), 0);
    return {
      movementId: workout.id,
      kind: 'hold',
      reps: 0,
      cleanReps: 0,
      cleanPct: holdMs > 0 ? Math.round((100 * (holdMs - dirty)) / holdMs) : 0,
      holdMs,
      tutMs: holdMs,
      warnings,
    };
  }

  const repEvents = events.filter((e): e is Extract<MarrowEvent, { type: 'rep' }> => e.type === 'rep');
  const reps = repEvents.length > 0 ? repEvents[repEvents.length - 1]!.count : 0;
  // Window k is (t_{k-1}, t_k], and the first window is [startT, t_1].
  const dirtyWindows = new Set<number>();
  for (const w of warningTimes) {
    if (w < startT) continue;
    const k = repEvents.findIndex((r) => w <= r.t);
    if (k >= 0) dirtyWindows.add(k);
  }
  const cleanReps = Math.min(reps, repEvents.length - dirtyWindows.size);
  return {
    movementId: workout.id,
    kind: 'reps',
    reps,
    cleanReps,
    cleanPct: reps > 0 ? Math.round((100 * cleanReps) / reps) : 0,
    holdMs: 0,
    tutMs: repEvents.reduce((sum, r) => sum + Math.max(0, r.durationMs), 0),
    warnings,
  };
}
