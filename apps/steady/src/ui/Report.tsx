import { useMemo, useState } from 'react';
import { NON_DIAGNOSIS_LINE, REFERENCES } from '../reference';
import { describeAsymmetry } from '../logic/asymmetry';
import { aggregateByDay, summarize, type HistoryPoint } from '../logic/trend';
import { TESTS, type Family, type TestDef } from '../tests';
import { TrendChart } from './TrendChart';
import { useHeadingFocus } from './useHeadingFocus';
import { useRecords } from './useRecords';
import styles from './ui.module.css';

type Range = '30' | '90' | 'all';

const RANGES: { id: Range; label: string }[] = [
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

const DAY_MS = 86_400_000;

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : String(r);
}

function find(points: readonly HistoryPoint[], day: string): HistoryPoint | undefined {
  return points.find((p) => p.day === day);
}

/** The latest day on which both sides have a result, as left and right values (R11.1). */
export function latestPair(
  left: readonly HistoryPoint[],
  right: readonly HistoryPoint[],
): { day: string; left: number; right: number } | null {
  for (let i = left.length - 1; i >= 0; i--) {
    const l = left[i]!;
    const r = find(right, l.day);
    if (r) return { day: l.day, left: l.value, right: r.value };
  }
  return null;
}

export function Report({ onBack }: { onBack: () => void }) {
  const heading = useHeadingFocus();
  const { records, unavailable } = useRecords();
  const [range, setRange] = useState<Range>('all');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [now] = useState(() => new Date());

  const inRange = useMemo(() => {
    const from = range === 'all' ? -Infinity : now.getTime() - Number(range) * DAY_MS;
    return (records ?? []).filter((r) => (includeDemo || r.source !== 'demo') && Date.parse(r.takenAt) >= from);
  }, [records, range, includeDemo, now]);

  const sections = TESTS.map((t) => {
    const items = inRange.filter((r) => r.testId === t.id);
    return { test: t, items, points: aggregateByDay(items) };
  }).filter((s) => s.items.length > 0);

  const pairs = (['shoulder-flexion', 'knee-flexion', 'single-leg-stance'] as Family[]).flatMap((family) => {
    const sideTests = TESTS.filter((t) => t.family === family);
    const l = sections.find((s) => s.test.id === sideTests.find((t) => t.side === 'left')?.id);
    const r = sections.find((s) => s.test.id === sideTests.find((t) => t.side === 'right')?.id);
    if (!l || !r) return [];
    const pair = latestPair(l.points, r.points);
    return pair ? [{ family, test: l.test, pair }] : [];
  });

  const usedFamilies = new Set(sections.map((s) => s.test.family));
  const refs = REFERENCES.filter((r) => usedFamilies.has(r.testFamily));
  const rangeLabel = RANGES.find((r) => r.id === range)!.label;

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Progress report
      </h1>
      <p className="print-only">Steady, report date {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. Range: {rangeLabel}.</p>

      <div className="no-print">
        <fieldset className={styles.fieldset}>
          <legend>Date range</legend>
          {RANGES.map((r) => (
            <label key={r.id} className={styles.choice}>
              <input type="radio" name="range" checked={range === r.id} onChange={() => setRange(r.id)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className={styles.choice}>
          <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
          Include demo clips
        </label>
        <div className={styles.row}>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Back to tests
          </button>
        </div>
      </div>

      <p className="no-print">
        Report date {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. Steady progress report for{' '}
        {rangeLabel.toLowerCase()}.
      </p>

      {unavailable && (
        <p className={styles.error} role="alert">
          Results cannot be read on this device, so this report is empty.
        </p>
      )}

      {records !== null && sections.length === 0 && (
        <p>No results in this date range. Take a test and save the result to add it to the report.</p>
      )}

      {sections.map(({ test, items, points }) => (
        <ReportSection key={test.id} test={test} count={items.length} points={points} demo={items.some((r) => r.source === 'demo')} />
      ))}

      {pairs.length > 0 && (
        <section className="report-section" aria-labelledby="report-asym">
          <h2 id="report-asym">Left and right compared</h2>
          <ul>
            {pairs.map(({ family, test, pair }) => {
              const d = describeAsymmetry(pair.left, pair.right);
              return (
                <li key={family}>
                  {test.title.replace(/, left (arm|leg)$/, '')} on {pair.day}: left {pair.left}, right {pair.right} {test.unit}.{' '}
                  {d.text}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {refs.length > 0 && (
        <section className="report-section references" aria-labelledby="report-sources">
          <h2 id="report-sources">Sources for reference context</h2>
          <ul>
            {refs.map((r) => (
              <li key={r.testFamily}>
                {r.source}
                {r.url && (
                  <>
                    {' '}
                    <a href={r.url}>{r.url}</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-section" aria-labelledby="report-notes">
        <h2 id="report-notes">About this report</h2>
        <p>Steady is not a medical device. It does not diagnose or treat any condition. {NON_DIAGNOSIS_LINE}</p>
        <p>Everything runs on your device. No video or landmarks leave your browser. This report contains no video or images.</p>
      </section>
    </>
  );
}

function ReportSection({ test, count, points, demo }: { test: TestDef; count: number; points: HistoryPoint[]; demo: boolean }) {
  const s = summarize(points)!;
  return (
    <section className="report-section" aria-labelledby={`r-${test.id}`}>
      <h2 id={`r-${test.id}`}>{test.title}</h2>
      <dl className={styles.summaryList}>
        <dt>Latest</dt>
        <dd>
          {s.latest} {test.unit}
        </dd>
        <dt>Best</dt>
        <dd>
          {s.best} {test.unit}
        </dd>
        <dt>Change since first</dt>
        <dd>
          {signed(s.change)} {test.unit}
        </dd>
        <dt>Number of results</dt>
        <dd>{count}</dd>
      </dl>
      {demo && <p>Includes demo clip results, labelled Demo in History.</p>}
      <TrendChart points={points} name={test.title} unit={test.unit} side={test.side} />
    </section>
  );
}
