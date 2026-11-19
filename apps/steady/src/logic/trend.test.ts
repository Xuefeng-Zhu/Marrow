import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aggregateByDay, summarize } from './trend';

const RUNS = { numRuns: 100 };
const rec = (takenAt: string, value: number) => ({ takenAt, value });

describe('aggregateByDay unit cases', () => {
  it('returns [] for no records', () => expect(aggregateByDay([], 0)).toEqual([]));
  it('one record gives one point', () => {
    expect(aggregateByDay([rec('2024-03-05T10:00:00Z', 120)], 0)).toEqual([{ day: '2024-03-05', value: 120 }]);
  });
  it('keeps the best value of the day', () => {
    const pts = aggregateByDay([rec('2024-03-05T08:00:00Z', 100), rec('2024-03-05T18:00:00Z', 130), rec('2024-03-05T12:00:00Z', 90)], 0);
    expect(pts).toEqual([{ day: '2024-03-05', value: 130 }]);
  });
  it('sorts days ascending', () => {
    const pts = aggregateByDay([rec('2024-03-07T08:00:00Z', 1), rec('2024-03-05T08:00:00Z', 2)], 0);
    expect(pts.map((p) => p.day)).toEqual(['2024-03-05', '2024-03-07']);
  });
  it('splits at local midnight, not UTC midnight', () => {
    const records = [rec('2024-03-05T23:30:00Z', 1), rec('2024-03-06T00:30:00Z', 2)];
    expect(aggregateByDay(records, 0).map((p) => p.day)).toEqual(['2024-03-05', '2024-03-06']);
    // UTC+2: both are on 2024-03-06 local time.
    expect(aggregateByDay(records, 120)).toEqual([{ day: '2024-03-06', value: 2 }]);
    // UTC-5: 23:30Z is 18:30 on the 5th and 00:30Z is 19:30 on the 5th.
    expect(aggregateByDay(records, -300)).toEqual([{ day: '2024-03-05', value: 2 }]);
  });
  it('accepts an offset function', () => {
    expect(aggregateByDay([rec('2024-03-05T23:30:00Z', 1)], () => 60)).toEqual([{ day: '2024-03-06', value: 1 }]);
  });
  it('skips bad timestamps and non-finite values', () => {
    expect(aggregateByDay([rec('nope', 1), rec('2024-03-05T10:00:00Z', NaN)], 0)).toEqual([]);
  });
  it('uses the runtime local time zone when no offset is given', () => {
    const iso = new Date(2024, 2, 5, 23, 30).toISOString();
    expect(aggregateByDay([rec(iso, 7)])).toEqual([{ day: '2024-03-05', value: 7 }]);
  });
});

describe('summarize unit cases', () => {
  it('is null for an empty trend', () => expect(summarize([])).toBeNull());
  it('summarizes one point', () => {
    expect(summarize([{ day: '2024-03-05', value: 9 }])).toEqual({ first: 9, latest: 9, best: 9, change: 0 });
  });
  it('summarizes several points', () => {
    const s = summarize([
      { day: '2024-03-01', value: 100 },
      { day: '2024-03-02', value: 140 },
      { day: '2024-03-03', value: 120 },
    ]);
    expect(s).toEqual({ first: 100, latest: 120, best: 140, change: 20 });
  });
});

const TZ = 120;
const recordArb = fc.record({
  takenAt: fc.date({ min: new Date('2023-01-01T00:00:00Z'), max: new Date('2024-12-31T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString()),
  value: fc.integer({ min: 0, max: 200 }),
});
const dayOf = (iso: string) => new Date(Date.parse(iso) + TZ * 60000).toISOString().slice(0, 10);

describe('trend properties', () => {
  it('P17 one point per distinct local day, sorted ascending', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 40 }), (records) => {
        const pts = aggregateByDay(records, TZ);
        const days = new Set(records.map((r) => dayOf(r.takenAt)));
        const sorted = pts.every((p, i) => i === 0 || pts[i - 1]!.day < p.day);
        return pts.length === days.size && sorted;
      }),
      RUNS,
    );
  });

  it('P18 each point is the max of that day', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 40 }), (records) => {
        return aggregateByDay(records, TZ).every((p) => {
          const values = records.filter((r) => dayOf(r.takenAt) === p.day).map((r) => r.value);
          return p.value === Math.max(...values) && values.every((v) => p.value >= v);
        });
      }),
      RUNS,
    );
  });

  it('P19 does not depend on record order', () => {
    fc.assert(
      fc.property(
        fc.array(recordArb, { maxLength: 40 }).chain((rs) => fc.tuple(fc.constant(rs), fc.shuffledSubarray(rs, { minLength: rs.length }))),
        ([records, shuffled]) => {
          expect(aggregateByDay(shuffled, TZ)).toEqual(aggregateByDay(records, TZ));
        },
      ),
      RUNS,
    );
  });

  it('P20 summary best, change and latest', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { minLength: 1, maxLength: 40 }), (records) => {
        const pts = aggregateByDay(records, TZ);
        const s = summarize(pts)!;
        return (
          s.best === Math.max(...pts.map((p) => p.value)) &&
          s.change === s.latest - s.first &&
          s.latest === pts[pts.length - 1]!.value &&
          s.first === pts[0]!.value
        );
      }),
      RUNS,
    );
  });
});
