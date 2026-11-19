import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { dayNumber, fromDayNumber, isDayKey, toDayKey, weekIndex, weekStart } from './dayKey';
import { MIN_STREAK_HOLD_MS, MIN_STREAK_REPS, computeStreak, qualifies, type StreakEntry } from './streak';

const DAY_MS = 86_400_000;
/** Independent key builder, not using the module under test. */
const keyOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

const camera = (day: string, over: Partial<StreakEntry> = {}): StreakEntry => ({
  mode: 'camera',
  kind: 'reps',
  reps: 10,
  holdMs: 0,
  day,
  ...over,
});

const dayArb = fc.integer({ min: 0, max: 30_000 });

describe('day keys', () => {
  it('formats across month, year and leap-day ends', () => {
    expect(toDayKey(Date.UTC(2024, 1, 29, 12), 0)).toBe('2024-02-29');
    expect(toDayKey(Date.UTC(2023, 11, 31, 23, 59), 0)).toBe('2023-12-31');
    expect(toDayKey(Date.UTC(2024, 0, 1, 0, 0), 0)).toBe('2024-01-01');
    expect(toDayKey(Date.UTC(2024, 0, 31, 23, 0), 0)).toBe('2024-01-31');
  });

  it('applies the offset to get the local date', () => {
    const t = Date.UTC(2024, 2, 1, 1, 30);
    expect(toDayKey(t, -120)).toBe('2024-02-29');
    expect(toDayKey(t, 0)).toBe('2024-03-01');
    expect(toDayKey(t, 14 * 60)).toBe('2024-03-01');
    expect(toDayKey(Date.UTC(2024, 2, 1, 23, 30), 60)).toBe('2024-03-02');
  });

  it('computes week starts on Monday', () => {
    expect(weekStart('2024-03-03')).toBe('2024-02-26'); // Sunday
    expect(weekStart('2024-03-04')).toBe('2024-03-04'); // Monday
    expect(weekStart('2024-01-01')).toBe('2024-01-01'); // Monday, year start
    expect(weekStart('2023-12-31')).toBe('2023-12-25'); // Sunday, year end
    expect(weekStart('2020-03-01')).toBe('2020-02-24'); // after a leap day
  });

  it('puts Sunday and the next Monday in consecutive weeks at month, year and leap ends', () => {
    for (const [sun, mon] of [
      ['2024-03-31', '2024-04-01'],
      ['2023-12-31', '2024-01-01'],
      ['2024-03-03', '2024-03-04'],
      ['2020-03-01', '2020-03-02'],
    ] as const) {
      expect(weekIndex(mon) - weekIndex(sun)).toBe(1);
    }
    expect(weekIndex('1970-01-04')).toBe(0);
    expect(weekIndex('1970-01-05')).toBe(1);
  });

  it('rejects invalid day keys', () => {
    expect(isDayKey('2024-02-30')).toBe(false);
    expect(isDayKey('2024-2-3')).toBe(false);
    expect(isDayKey(5)).toBe(false);
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2023-02-29')).toBe(false);
  });

  it('P34 round trip: day key parts are the local calendar date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.integer({ min: -12 * 60, max: 14 * 60 }), (t, off) => {
        const key = toDayKey(t, off);
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const local = new Date(t + off * 60_000);
        const [y, m, d] = key.split('-').map(Number);
        expect([y, m, d]).toEqual([local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()]);
        expect(isDayKey(key)).toBe(true);
        expect(fromDayNumber(dayNumber(key))).toBe(key);
      }),
    );
  });

  it('P12 weekStart is a Monday within 6 days before, and constant over Monday to Sunday', () => {
    fc.assert(
      fc.property(dayArb, (n) => {
        const day = keyOf(n);
        const ws = weekStart(day);
        const wsN = dayNumber(ws);
        expect(new Date(wsN * DAY_MS).getUTCDay()).toBe(1);
        expect(wsN).toBeLessThanOrEqual(n);
        expect(n - wsN).toBeLessThan(7);
        for (let i = 0; i < 7; i++) {
          expect(weekStart(keyOf(wsN + i))).toBe(ws);
          expect(weekIndex(keyOf(wsN + i))).toBe(weekIndex(ws));
        }
        expect(weekIndex(keyOf(wsN + 7))).toBe(weekIndex(ws) + 1);
      }),
    );
  });
});

describe('qualifies', () => {
  it('requires camera mode and the minimums', () => {
    expect(MIN_STREAK_REPS).toBe(5);
    expect(MIN_STREAK_HOLD_MS).toBe(10_000);
    expect(qualifies(camera('2024-01-01', { reps: 5 }))).toBe(true);
    expect(qualifies(camera('2024-01-01', { reps: 4 }))).toBe(false);
    expect(qualifies(camera('2024-01-01', { kind: 'hold', reps: 0, holdMs: 10_000 }))).toBe(true);
    expect(qualifies(camera('2024-01-01', { kind: 'hold', reps: 0, holdMs: 9_999 }))).toBe(false);
    expect(qualifies(camera('2024-01-01', { mode: 'demo' }))).toBe(false);
  });
});

// Oracle: walks backwards day by day to find each date's Monday, using only Date.getUTCDay.
function oracleMonday(n: number): number {
  let d = n;
  while (new Date(d * DAY_MS).getUTCDay() !== 1) d -= 1;
  return d;
}

function oracleStreak(entries: readonly StreakEntry[], todayN: number) {
  const mondays = new Set<number>();
  for (const e of entries) {
    const n = Date.parse(`${e.day}T00:00:00Z`) / DAY_MS;
    if (n <= todayN && qualifies(e)) mondays.add(oracleMonday(n));
  }
  const thisMonday = oracleMonday(todayN);
  let m = mondays.has(thisMonday) ? thisMonday : mondays.has(thisMonday - 7) ? thisMonday - 7 : null;
  let current = 0;
  while (m !== null && mondays.has(m)) {
    current += 1;
    m -= 7;
  }
  const sorted = [...mondays].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  sorted.forEach((x, i) => {
    run = i > 0 && sorted[i - 1] === x - 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return { current, longest, weeksActive: mondays.size, thisWeekQualified: mondays.has(thisMonday) };
}

const entryArb = (todayN: number) =>
  fc.record({
    mode: fc.constantFrom<'camera' | 'demo'>('camera', 'camera', 'demo'),
    kind: fc.constantFrom<'reps' | 'hold'>('reps', 'hold'),
    reps: fc.integer({ min: 0, max: 12 }),
    holdMs: fc.integer({ min: 0, max: 20_000 }),
    day: fc.integer({ min: Math.max(0, todayN - 120), max: todayN + 30 }).map(keyOf),
  });

const scenario = dayArb.chain((todayN) =>
  fc.record({ todayN: fc.constant(todayN), entries: fc.array(entryArb(todayN), { maxLength: 25 }) }),
);

describe('computeStreak properties', () => {
  it('matches the day-by-day oracle (P12 to P22 combined)', () => {
    fc.assert(
      fc.property(scenario, ({ todayN, entries }) => {
        expect(computeStreak(entries, keyOf(todayN))).toEqual(oracleStreak(entries, todayN));
      }),
      { numRuns: 300 },
    );
  });

  it('P14 N consecutive weeks ending now give N, P15 a gap breaks it, P16 grace, P17 stale', () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 30_000 }), fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 6 }), (todayN, n, dow) => {
        const thisMonday = oracleMonday(todayN);
        const weekDay = (back: number) => keyOf(thisMonday - 7 * back + dow);
        const today = keyOf(todayN);
        const run = (from: number) => Array.from({ length: n }, (_, i) => camera(weekDay(from + i)));
        // Weeks 0..n-1 back, but the day within the week must not be in the future.
        const entries = run(0).map((e, i) => (i === 0 ? camera(keyOf(thisMonday)) : e));
        expect(computeStreak(entries, today).current).toBe(n);
        // P16: shift to end at the previous week
        const prev = run(1);
        const base = computeStreak(prev, today).current;
        expect(base).toBe(n);
        expect(computeStreak([...prev, camera(keyOf(thisMonday))], today).current).toBe(n + 1);
        // P17: ends two weeks back
        expect(computeStreak(run(2), today).current).toBe(0);
        // P15: remove week k (k >= 1) from the run
        if (n >= 3) {
          const k = 1 + (dow % (n - 1));
          const gap = entries.filter((_, i) => i !== k);
          expect(computeStreak(gap, today).current).toBe(k);
        }
      }),
    );
  });

  it('P18 order and duplicates do not matter', () => {
    fc.assert(
      fc.property(scenario, fc.nat(), ({ todayN, entries }, seed) => {
        const base = computeStreak(entries, keyOf(todayN));
        const shuffled = [...entries].sort((a, b) => ((a.reps * 31 + seed) % 7) - ((b.reps * 31 + seed) % 7)).reverse();
        expect(computeStreak(shuffled, keyOf(todayN))).toEqual(base);
        expect(computeStreak([...entries, ...entries], keyOf(todayN))).toEqual(base);
      }),
    );
  });

  it('P19 non-qualifying sets never change the streak, P21 future entries are ignored', () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 60 }), ({ todayN, entries }, back) => {
        const today = keyOf(todayN);
        const base = computeStreak(entries, today);
        const noise = [
          camera(keyOf(Math.max(0, todayN - back)), { mode: 'demo', reps: 50 }),
          camera(keyOf(Math.max(0, todayN - back)), { reps: MIN_STREAK_REPS - 1 }),
          camera(keyOf(Math.max(0, todayN - back)), { kind: 'hold', reps: 0, holdMs: MIN_STREAK_HOLD_MS - 1 }),
        ];
        expect(computeStreak([...entries, ...noise], today)).toEqual(base);
        const future = [camera(keyOf(todayN + 1 + back)), camera(keyOf(todayN + 8 + back))];
        expect(computeStreak([...entries, ...future], today)).toEqual(base);
      }),
    );
  });

  it('P20 bounds', () => {
    fc.assert(
      fc.property(scenario, ({ todayN, entries }) => {
        const s = computeStreak(entries, keyOf(todayN));
        expect(s.current).toBeGreaterThanOrEqual(0);
        expect(s.current).toBeLessThanOrEqual(s.longest);
        expect(s.longest).toBeLessThanOrEqual(s.weeksActive);
      }),
    );
  });

  it('P22 Sunday and the next Monday are two consecutive weeks, across boundaries', () => {
    for (const sun of ['2024-03-31', '2023-12-31', '2024-03-03', '2020-03-01', '2024-02-25']) {
      const mon = keyOf(dayNumber(sun) + 1);
      expect(computeStreak([camera(sun), camera(mon)], mon)).toMatchObject({ current: 2, longest: 2 });
    }
    fc.assert(
      fc.property(dayArb, (n) => {
        const sun = oracleMonday(n) + 6;
        const mon = sun + 1;
        const s = computeStreak([camera(keyOf(sun)), camera(keyOf(mon))], keyOf(mon));
        expect(s.current).toBe(2);
      }),
    );
  });
});

describe('time zone independence (P13)', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('gives the same week starts and streak under different TZ values', () => {
    const entries = [camera('2024-02-26'), camera('2024-03-03'), camera('2024-03-04'), camera('2023-12-31')];
    const results: unknown[] = [];
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata']) {
      process.env.TZ = tz;
      results.push([
        computeStreak(entries, '2024-03-10'),
        weekStart('2024-03-10'),
        weekStart('2024-03-31'),
        weekIndex('2024-11-03'),
        toDayKey(Date.UTC(2024, 2, 31, 23), 0),
      ]);
    }
    for (const r of results) expect(r).toEqual(results[0]);
  });
});
