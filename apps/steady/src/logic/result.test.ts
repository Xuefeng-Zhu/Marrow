import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AGE_BANDS } from '../data/prefs';
import { NON_DIAGNOSIS_LINE, REFERENCES, type ReferenceEntry } from '../reference';
import { TESTS, TEST_BY_ID } from '../tests';
import { buildResult, type RunOutcome, type StopReason } from './result';

const STOPS: StopReason[] = ['released', 'sway', 'lost-pose', 'cap', 'user', 'reps', 'done', 'timeout', 'window'];
const VERDICT = /\b(pass(ed)?|fail(ed|ure)?|normal|abnormal|risk level)\b/i;

const TABLE: ReferenceEntry[] = REFERENCES.map((r) =>
  r.testFamily === 'chair-stand'
    ? {
        ...r,
        ageBands: AGE_BANDS.map((band, i) => ({ band, men: 14 - i, women: 12 - i })),
      }
    : r,
);

const base = (id: keyof typeof TEST_BY_ID, over: Partial<RunOutcome> = {}): RunOutcome => ({
  test: TEST_BY_ID[id],
  raw: 100,
  source: 'camera',
  takenAt: '2024-03-05T10:00:00.000Z',
  ...over,
});

/** Every string field of a view model, flattened. */
function allText(m: object): string {
  return JSON.stringify(m);
}

describe('buildResult values', () => {
  it('rounds ROM peaks to whole degrees', () => {
    const m = buildResult(base('shoulder-flexion-left', { raw: 150.6 }));
    expect(m.value).toBe(151);
    expect(m.valueText).toBe('151');
    expect(m.unit).toBe('degrees');
    expect(m.side).toBe('left');
  });

  it('converts the knee joint angle to flexion and rounds', () => {
    const m = buildResult(base('knee-flexion-right', { raw: 59.6 }));
    expect(m.value).toBe(120);
    expect(m.valueText).toBe('120');
  });

  it('treats an out of range ROM value as no movement', () => {
    for (const raw of [null, Number.NaN, Infinity, -5, 200]) {
      const m = buildResult(base('shoulder-flexion-left', { raw }));
      expect(m.value).toBeNull();
      expect(m.saveable).toBe(false);
      expect(m.noResultText).toBe('No movement detected.');
    }
    // A knee angle above 180 gives negative flexion, which is invalid.
    expect(buildResult(base('knee-flexion-left', { raw: 190 })).value).toBeNull();
  });

  it('floors stance seconds to one decimal', () => {
    const m = buildResult(base('single-leg-stance-left', { raw: 13.49, stop: 'released' }));
    expect(m.valueText).toBe('13.4');
    expect(m.stopText).toBe('Your foot touched down.');
  });

  it('says the foot was not lifted when stance has no value', () => {
    const m = buildResult(base('single-leg-stance-right', { raw: null }));
    expect(m.noResultText).toBe('Foot was not lifted.');
    expect(m.saveable).toBe(false);
  });

  it('shows chair stand counts with the stands unit', () => {
    const m = buildResult(base('chair-stand', { raw: 11 }));
    expect(m.valueText).toBe('11');
    expect(m.unit).toBe('stands in 30 seconds');
    expect(m.side).toBeUndefined();
  });

  it('labels demo clips and stopped early runs', () => {
    expect(buildResult(base('chair-stand', { source: 'demo' })).sourceLabel).toBe('Demo clip');
    expect(buildResult(base('chair-stand')).sourceLabel).toBe('Camera');
    const early = buildResult(base('chair-stand', { stoppedEarly: true }));
    expect(early.stoppedEarlyText).toBe('Stopped early');
    expect(buildResult(base('single-leg-stance-left', { stop: 'user' })).stoppedEarly).toBe(true);
    expect(buildResult(base('chair-stand')).stoppedEarlyText).toBeUndefined();
  });
});

describe('chair stand age band threshold (R9.5)', () => {
  it('shows the threshold for the chosen band', () => {
    const a = buildResult(base('chair-stand', { ageBand: '60-64', references: TABLE }));
    const b = buildResult(base('chair-stand', { ageBand: '70-74', references: TABLE }));
    expect(a.thresholdLines).toHaveLength(1);
    expect(a.thresholdLines[0]).toContain('60-64');
    expect(a.thresholdLines[0]).toContain('below 14');
    expect(b.thresholdLines[0]).toContain('below 12 (men)');
    expect(a.thresholdLines).not.toEqual(b.thresholdLines);
  });

  it('shows the general range without a band', () => {
    const m = buildResult(base('chair-stand', { ageBand: null, references: TABLE }));
    expect(m.thresholdLines).toHaveLength(1);
    expect(m.thresholdLines[0]).toContain('Across the age bands');
    expect(m.thresholdLines[0]).not.toContain('Ages ');
  });

  it('shows no threshold lines on other tests or an empty table', () => {
    expect(buildResult(base('shoulder-flexion-left', { references: TABLE })).thresholdLines).toEqual([]);
    expect(buildResult(base('chair-stand', { ageBand: '60-64' })).thresholdLines).toEqual([]);
  });
});

describe('wording (R9.3, R9.4)', () => {
  it('the reference data has a source and note and no verdict words', () => {
    for (const r of REFERENCES) {
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.note.length).toBeGreaterThan(0);
      expect(`${r.text} ${r.source} ${r.note}`).not.toMatch(VERDICT);
      expect(r.text).toMatch(/typical|usually|for comparison/i);
    }
    expect(new Set(REFERENCES.map((r) => r.testFamily)).size).toBe(4);
  });

  it('every test has a reference and the fixed line follows it', () => {
    for (const t of TESTS) {
      const m = buildResult({ test: t, raw: t.kind === 'rom-peak' ? 90 : 10, source: 'demo', takenAt: '2024-01-01T00:00:00Z' });
      expect(m.references).toHaveLength(1);
      expect(m.disclaimer).toBe(NON_DIAGNOSIS_LINE);
    }
  });

  it('no view model contains a verdict word and the non-diagnosis line is always present', () => {
    const ids = TESTS.map((t) => t.id);
    fc.assert(
      fc.property(
        fc.constantFrom(...ids),
        fc.oneof(fc.constant(null), fc.double({ min: -50, max: 300, noNaN: true }), fc.constant(Number.NaN)),
        fc.option(fc.constantFrom(...STOPS), { nil: undefined }),
        fc.boolean(),
        fc.constantFrom<'camera' | 'demo'>('camera', 'demo'),
        fc.option(fc.constantFrom(...AGE_BANDS), { nil: null }),
        (id, raw, stop, early, source, ageBand) => {
          const m = buildResult(
            base(id, { raw, source, ageBand, stoppedEarly: early, references: TABLE, ...(stop ? { stop } : {}) }),
          );
          expect(allText(m)).not.toMatch(VERDICT);
          expect(m.disclaimer).toBe(NON_DIAGNOSIS_LINE);
        },
      ),
      { numRuns: 100 },
    );
  });
});
