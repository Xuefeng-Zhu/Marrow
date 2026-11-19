export interface HistoryPoint {
  /** Local day, 'YYYY-MM-DD'. */
  day: string;
  value: number;
}

export interface TrendSummary {
  first: number;
  latest: number;
  best: number;
  change: number;
}

/** Minutes east of UTC (UTC+2 is 120), either fixed or looked up from the instant in ms. */
export type TzOffset = number | ((epochMs: number) => number);

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function localDay(epochMs: number, tzOffset: TzOffset | undefined): string {
  if (tzOffset === undefined) {
    const d = new Date(epochMs);
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const minutes = typeof tzOffset === 'function' ? tzOffset(epochMs) : tzOffset;
  const d = new Date(epochMs + (Number.isFinite(minutes) ? minutes : 0) * 60000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * One point per local day with the best (largest) value of that day, sorted by day ascending (R10.4).
 * Records with an unparseable `takenAt` or a non-finite value are skipped. Without `tzOffset` the runtime's
 * local time zone is used, so a result at 23:30 belongs to the user's day.
 */
export function aggregateByDay(
  records: readonly { takenAt: string; value: number }[],
  tzOffset?: TzOffset,
): HistoryPoint[] {
  const best = new Map<string, number>();
  for (const r of records) {
    const ms = Date.parse(r.takenAt);
    if (!Number.isFinite(ms) || !Number.isFinite(r.value)) continue;
    const day = localDay(ms, tzOffset);
    const prev = best.get(day);
    if (prev === undefined || r.value > prev) best.set(day, r.value);
  }
  return [...best.entries()]
    .map(([day, value]) => ({ day, value }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** First, latest and best values and the change from first to latest (R10.5). Null for an empty trend. */
export function summarize(points: readonly HistoryPoint[]): TrendSummary | null {
  if (points.length === 0) return null;
  const first = points[0]!.value;
  const latest = points[points.length - 1]!.value;
  let best = first;
  for (const p of points) if (p.value > best) best = p.value;
  return { first, latest, best, change: latest - first };
}
