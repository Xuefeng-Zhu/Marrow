/**
 * Day keys are local calendar dates `YYYY-MM-DD`. All calendar arithmetic goes through an integer
 * day number (days since 1970-01-01), which does not depend on the host timezone or DST.
 */

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Local calendar date of `epochMs` shifted by `offsetMinutes` (minutes east of UTC). */
export function toDayKey(epochMs: number, offsetMinutes: number): string {
  const d = new Date(epochMs + offsetMinutes * 60_000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

export function dayNumber(day: string): number {
  const m = DAY_KEY.exec(day);
  if (!m) throw new RangeError(`Invalid day key: ${day}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new RangeError(`Invalid day key: ${day}`);
  }
  return dt.getTime() / DAY_MS;
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

/** Inverse of `dayNumber`. */
export function fromDayNumber(n: number): string {
  return toDayKey(n * DAY_MS, 0);
}

/** Weeks start on Monday. Consecutive weeks have consecutive indexes (1970-01-05 is a Monday, index 1). */
export function weekIndex(day: string): number {
  return Math.floor((dayNumber(day) + 3) / 7);
}

/** The Monday on or before `day`. */
export function weekStart(day: string): string {
  const n = dayNumber(day);
  return fromDayNumber(n - (((n + 3) % 7) + 7) % 7);
}
