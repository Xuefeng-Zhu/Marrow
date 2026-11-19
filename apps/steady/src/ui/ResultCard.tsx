import { useEffect, useState } from 'react';
import { listRecords, saveRecord, StorageUnavailableError, type HistoryRecord } from '../data/history';
import { describeAsymmetry } from '../logic/asymmetry';
import type { ResultViewModel } from '../logic/result';
import { aggregateByDay } from '../logic/trend';
import { TEST_BY_ID, type TestId } from '../tests';
import { useHeadingFocus } from './useHeadingFocus';
import styles from './ui.module.css';

interface Props {
  model: ResultViewModel;
  onTryAgain: () => void;
  onBack: () => void;
}

type SaveState = 'idle' | 'saved' | 'failed';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Same-day best value of the other side's test, from saved results with the same source (R6.1). */
function otherSideText(model: ResultViewModel, records: HistoryRecord[]): string | null {
  if (!model.side || model.value === null || model.kind === 'count') return null;
  const test = TEST_BY_ID[model.testId];
  const otherId = `${test.family}-${model.side === 'left' ? 'right' : 'left'}` as TestId;
  const day = aggregateByDay([{ takenAt: model.takenAt, value: 0 }])[0]?.day;
  const same = records.filter((r) => r.testId === otherId && r.source === model.source);
  const point = aggregateByDay(same).find((p) => p.day === day);
  if (!point) return null;
  const left = model.side === 'left' ? model.value : point.value;
  const right = model.side === 'left' ? point.value : model.value;
  return `${describeAsymmetry(left, right).text} (left ${left}, right ${right} ${model.unit}, same day)`;
}

export function ResultCard({ model, onTryAgain, onBack }: Props) {
  const heading = useHeadingFocus();
  const [save, setSave] = useState<SaveState>('idle');
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRecords()
      .then((r) => {
        if (!cancelled) setRecords(r);
      })
      .catch(() => undefined); // Saving reports the storage problem if there is one.
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (model.value === null) return;
    const record: HistoryRecord = {
      id: newId(),
      testId: model.testId,
      kind: model.kind,
      ...(model.side ? { side: model.side } : {}),
      value: model.value,
      unit: model.unit,
      takenAt: model.takenAt,
      source: model.source,
      stoppedEarly: model.stoppedEarly,
    };
    try {
      await saveRecord(record);
      setSave('saved');
    } catch (e) {
      if (!(e instanceof StorageUnavailableError)) console.warn('Saving failed', e);
      setSave('failed');
    }
  }

  const when = new Date(model.takenAt).toLocaleString();
  const asym = otherSideText(model, records);

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Your result
      </h1>
      <article className={styles.card} aria-label="Result card">
        <h2>{model.title}</h2>
        {model.value !== null ? (
          <p className={styles.value}>
            <span className={styles.valueNumber}>{model.valueText}</span> {model.unit}
          </p>
        ) : (
          <p className={styles.value}>{model.noResultText}</p>
        )}
        <p>
          {when}. Source: {model.sourceLabel}.
        </p>
        {model.stoppedEarlyText && <p className={styles.badge}>{model.stoppedEarlyText}</p>}
        {model.stopText && <p>{model.stopText}</p>}
        {model.value === null && <p>This run was not saved because there is no result to keep.</p>}
        {asym && <p>{asym}</p>}
        {model.value !== null && (
          <>
            {model.thresholdLines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            {model.references.map((r) => (
              <p key={r.source}>
                {r.text} <span className={styles.summary}>Source: {r.source}.</span>
              </p>
            ))}
          </>
        )}
        <p className={styles.notice}>{model.disclaimer}</p>
        <p className={styles.summary}>
          Steady is not a medical device. It does not diagnose or treat any condition. Everything runs on your
          device. No video or landmarks leave your browser.
        </p>
      </article>

      {save === 'saved' && (
        <p role="status" className={styles.ok}>
          Result saved.
        </p>
      )}
      {save === 'failed' && (
        <p role="alert" className={styles.error}>
          Results cannot be saved on this device. You can still print this card.
        </p>
      )}

      <div className={styles.row}>
        {model.saveable && save !== 'saved' && save !== 'failed' && (
          <button type="button" className="btn btn-primary" onClick={() => void onSave()}>
            Save result
          </button>
        )}
        {save === 'failed' && (
          <button type="button" className="btn" onClick={() => window.print()}>
            Print this card
          </button>
        )}
        <button type="button" className="btn" onClick={onTryAgain}>
          Try again
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back to tests
        </button>
      </div>
    </>
  );
}
