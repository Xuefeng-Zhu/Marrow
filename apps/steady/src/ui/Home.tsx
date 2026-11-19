import { useEffect, useState } from 'react';
import { listRecords, type HistoryRecord } from '../data/history';
import type { SourceMode } from '../session/machine';
import { TESTS, type Family, type TestDef, type TestId } from '../tests';
import { useHeadingFocus } from './useHeadingFocus';
import { VoiceToggle } from './VoiceToggle';
import styles from './ui.module.css';

const FAMILIES: { family: Family; title: string }[] = [
  { family: 'shoulder-flexion', title: 'Shoulder flexion' },
  { family: 'knee-flexion', title: 'Knee flexion' },
  { family: 'chair-stand', title: '30-second chair stand' },
  { family: 'single-leg-stance', title: 'Single-leg stance' },
];

interface Props {
  mode: SourceMode;
  onMode: (m: SourceMode) => void;
  onChoose: (id: TestId) => void;
  onHistory: () => void;
  voice: { available: boolean; on: boolean; set: (on: boolean) => void };
}

function lastText(test: TestDef, r: HistoryRecord | undefined): string | null {
  if (!r) return null;
  const when = new Date(r.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Last result: ${r.value} ${test.unit}, ${when}${r.source === 'demo' ? ' (demo)' : ''}`;
}

export function Home({ mode, onMode, onChoose, onHistory, voice }: Props) {
  const heading = useHeadingFocus();
  const [latest, setLatest] = useState<Partial<Record<TestId, HistoryRecord>>>({});

  useEffect(() => {
    let cancelled = false;
    listRecords()
      .then((all) => {
        if (cancelled) return;
        const out: Partial<Record<TestId, HistoryRecord>> = {};
        for (const r of all) {
          const prev = out[r.testId];
          if (!prev || Date.parse(r.takenAt) > Date.parse(prev.takenAt)) out[r.testId] = r;
        }
        setLatest(out);
      })
      .catch(() => undefined); // No saved results can be read on this device. The tests still work.
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Choose a test
      </h1>
      <p>Simple range-of-motion and balance checks, guided step by step. Steady is not a medical device.</p>

      <fieldset className={styles.fieldset}>
        <legend>How do you want to run the test?</legend>
        <label className={styles.choice}>
          <input type="radio" name="source" checked={mode === 'demo'} onChange={() => onMode('demo')} />
          Try a demo clip (no camera needed)
        </label>
        <label className={styles.choice}>
          <input type="radio" name="source" checked={mode === 'camera'} onChange={() => onMode('camera')} />
          Use camera
        </label>
      </fieldset>

      <div className={styles.row}>
        <VoiceToggle available={voice.available} on={voice.on} onChange={voice.set} />
        <button type="button" className="btn" onClick={onHistory}>
          History
        </button>
      </div>
      {!voice.available && <p>Voice prompts are not available in this browser. Every prompt is shown as text.</p>}

      {FAMILIES.map(({ family, title }) => (
        <section key={family} className={styles.group} aria-labelledby={`group-${family}`}>
          <h2 id={`group-${family}`}>{title}</h2>
          <ul className={styles.list}>
            {TESTS.filter((t) => t.family === family).map((t) => {
              const last = lastText(t, latest[t.id]);
              return (
                <li key={t.id}>
                  <button type="button" className="btn btn-primary" onClick={() => onChoose(t.id)}>
                    {t.title}
                  </button>
                  <p className={styles.summary}>{t.summary}</p>
                  {last && <p className={styles.summary}>{last}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
