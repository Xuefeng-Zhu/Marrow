import { useEffect, useState } from 'react';
import type { HistoryEntry } from '../storage/codec';
import type { Store } from '../storage/store';
import { dayNumber, weekStart } from '../streak/dayKey';
import { computeStreak } from '../streak/streak';
import { cleanText, movementName, resultText, seconds } from './format';
import { Layout } from './Layout';
import styles from './History.module.css';

export interface WeekTotals {
  sets: number;
  reps: number;
  holdMs: number;
}

/** Totals of the entries whose day is in the Monday to Sunday week of `today`. */
export function weekTotals(entries: readonly HistoryEntry[], today: string): WeekTotals {
  const start = dayNumber(weekStart(today));
  const totals: WeekTotals = { sets: 0, reps: 0, holdMs: 0 };
  for (const e of entries) {
    const d = dayNumber(e.day);
    if (d < start || d > start + 6) continue;
    totals.sets += 1;
    totals.reps += e.reps;
    totals.holdMs += e.holdMs;
  }
  return totals;
}

export interface HistoryProps {
  store: Pick<Store, 'loadHistory' | 'clearAll' | 'persistent'>;
  /** Local day key of today. */
  today: string;
  onStart(): void;
  onBack(): void;
}

export function History({ store, today, onStart, onBack }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    let alive = true;
    store.loadHistory().then(
      (list) => {
        if (!alive) return;
        setEntries(list);
        setPersistent(store.persistent);
      },
      () => {
        if (!alive) return;
        setEntries([]);
        setPersistent(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [store]);

  const clear = async () => {
    try {
      await store.clearAll();
    } catch {
      // The in-memory copy below is still emptied.
    }
    setEntries([]);
    setConfirming(false);
  };

  const list = entries ?? [];
  const streak = computeStreak(list, today);
  const week = weekTotals(list, today);
  // Newest first; the list is stored oldest first.
  const newest = [...list].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <Layout title="History and streak">
      {entries === null ? (
        <p role="status">Loading your history...</p>
      ) : (
        <>
          {!persistent && (
            <p className={styles.notice}>
              Storage is not available here, so history will not be saved after you close this tab.
            </p>
          )}
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt>Current streak</dt>
              <dd>
                {streak.current} {streak.current === 1 ? 'week' : 'weeks'}
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Longest streak</dt>
              <dd>
                {streak.longest} {streak.longest === 1 ? 'week' : 'weeks'}
              </dd>
            </div>
          </dl>
          <section aria-labelledby="week-h">
            <h2 id="week-h">This week</h2>
            <p>
              {week.sets} {week.sets === 1 ? 'set' : 'sets'}, {week.reps} {week.reps === 1 ? 'rep' : 'reps'},{' '}
              {Math.round(week.holdMs / 1000)} s of holds
            </p>
            <p className={styles.note}>Streak weeks need a camera set with 5 reps or a 10 s hold. Demo sets do not count.</p>
          </section>

          <section aria-labelledby="sets-h">
            <h2 id="sets-h">Your sets</h2>
            {newest.length === 0 ? (
              <div>
                <p>No sets yet. The skeleton is waiting.</p>
                <button type="button" className="btn btn-primary" onClick={onStart}>
                  Start a workout
                </button>
              </div>
            ) : (
              <ul className={styles.list}>
                {newest.map((e) => (
                  <li key={e.id} className={styles.item}>
                    <span className={styles.day}>{e.day}</span>{' '}
                    <strong>{movementName(e.movementId)}</strong>: {resultText(e)}, {cleanText(e)} clean,{' '}
                    {seconds(e.tutMs)} under tension
                    {e.mode === 'demo' && <span className={styles.demo}> Demo</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="data-h" className={styles.data}>
            <h2 id="data-h">Your data</h2>
            <p className={styles.note}>Everything stays on this device. Nothing is uploaded.</p>
            {confirming ? (
              <div role="alertdialog" aria-labelledby="confirm-h" className={styles.confirm}>
                <p id="confirm-h">Delete all history and settings? This cannot be undone.</p>
                <button type="button" className="btn btn-warn" onClick={() => void clear()}>
                  Yes, delete everything
                </button>{' '}
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-warn" onClick={() => setConfirming(true)}>
                Clear all data
              </button>
            )}
          </section>
        </>
      )}
      <p>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </p>
    </Layout>
  );
}
