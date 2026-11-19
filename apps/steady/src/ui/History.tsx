import { useMemo, useState } from 'react';
import { clearAll, deleteRecord, type HistoryRecord } from '../data/history';
import { aggregateByDay, summarize } from '../logic/trend';
import { TESTS, type TestDef } from '../tests';
import { TrendChart } from './TrendChart';
import { useHeadingFocus } from './useHeadingFocus';
import { useRecords } from './useRecords';
import styles from './ui.module.css';

interface Props {
  onBack: () => void;
  onReport: () => void;
}

function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : String(r);
}

export function History({ onBack, onReport }: Props) {
  const heading = useHeadingFocus();
  const { records, unavailable, reload } = useRecords();
  const [includeDemo, setIncludeDemo] = useState(true);
  const [confirming, setConfirming] = useState<string | 'all' | null>(null);
  const [message, setMessage] = useState('');

  const shown = useMemo(
    () => (records ?? []).filter((r) => includeDemo || r.source !== 'demo'),
    [records, includeDemo],
  );

  const run = async (op: () => Promise<void>, done: string) => {
    try {
      await op();
      setMessage(done);
      reload();
    } catch {
      setMessage('Results cannot be changed on this device.');
    }
    setConfirming(null);
  };

  const groups = TESTS.map((t) => ({
    test: t,
    items: shown
      .filter((r) => r.testId === t.id)
      .sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt)),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        History
      </h1>

      {unavailable && (
        <p className={styles.error} role="alert">
          Results cannot be saved or read on this device. You can still take tests and print the result card.
        </p>
      )}

      <label className={styles.choice}>
        <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
        Include demo clips
      </label>

      <div className={styles.row}>
        <button type="button" className="btn btn-primary" onClick={onReport}>
          Progress report
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back to tests
        </button>
        {shown.length > 0 && confirming !== 'all' && (
          <button type="button" className="btn" onClick={() => setConfirming('all')}>
            Delete all history
          </button>
        )}
      </div>

      {confirming === 'all' && (
        <div className={styles.notice} role="alertdialog" aria-label="Confirm delete all history">
          <p>Delete all saved results from this device? This cannot be undone.</p>
          <div className={styles.row}>
            <button type="button" className="btn btn-primary" onClick={() => run(clearAll, 'All history deleted.')}>
              Yes, delete all
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Keep my results
            </button>
          </div>
        </div>
      )}

      <p role="status">{message}</p>

      {records !== null && groups.length === 0 && !unavailable && (
        <p>
          {records.length > 0
            ? 'No results to show. Turn on "Include demo clips" to see demo results.'
            : 'No results yet. To take your first test, go back to the tests, pick one, follow the steps and press "Save result" at the end.'}
        </p>
      )}

      {groups.map(({ test, items }) => (
        <TestGroup
          key={test.id}
          test={test}
          items={items}
          confirming={confirming}
          onAsk={setConfirming}
          onDelete={(id) => run(() => deleteRecord(id), 'Result deleted.')}
        />
      ))}
    </>
  );
}

function TestGroup({
  test,
  items,
  confirming,
  onAsk,
  onDelete,
}: {
  test: TestDef;
  items: HistoryRecord[];
  confirming: string | null;
  onAsk: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const points = useMemo(() => aggregateByDay(items), [items]);
  const s = summarize(points);
  return (
    <section className={styles.group} aria-labelledby={`h-${test.id}`}>
      <h2 id={`h-${test.id}`}>{test.title}</h2>
      {s && (
        <p>
          First {s.first}, latest {s.latest}, best {s.best}, change {signed(s.change)} ({test.unit}).
        </p>
      )}
      <TrendChart points={points} name={test.title} unit={test.unit} side={test.side} />
      <ul className={styles.list} aria-label={`${test.title} results, newest first`}>
        {items.map((r) => (
          <li key={r.id}>
            <p>
              <strong>
                {r.value} {r.unit}
              </strong>
              , {whenText(r.takenAt)}
              {r.source === 'demo' && <span className={styles.badge}> Demo</span>}
              {r.stoppedEarly ? ' (stopped early)' : ''}
            </p>
            {confirming === r.id ? (
              <div role="alertdialog" aria-label="Confirm delete result">
                <p>Delete this result? This cannot be undone.</p>
                <div className={styles.row}>
                  <button type="button" className="btn btn-primary" onClick={() => onDelete(r.id)}>
                    Yes, delete
                  </button>
                  <button type="button" className="btn" onClick={() => onAsk(null)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => onAsk(r.id)}>
                {`Delete one result: ${r.value} ${r.unit}, ${whenText(r.takenAt)}`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
