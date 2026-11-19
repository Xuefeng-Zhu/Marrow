import { useEffect, useState } from 'react';
import { restSecondsLeft } from '../circuits/sequencer';
import type { SetSummary } from '../summary/summarize';
import { Effects } from './Effects';
import { setEffect, streakEffect, type EffectRequest } from './effectTriggers';
import { cleanText, hasWork, movementName, seconds } from './format';
import { Layout } from './Layout';
import styles from './Summary.module.css';

export interface RestInfo {
  restSec: number;
  nextName: string;
  onSkip(): void;
  /** The countdown reached zero. */
  onDone(): void;
}

export interface SummaryProps {
  summary: SetSummary;
  mode: 'camera' | 'demo';
  saved: boolean;
  streakGain: boolean;
  /** The streak after this set, shown when it grew. */
  streakWeeks: number;
  /** False when the browser storage did not work. */
  persistent: boolean;
  inCircuit: boolean;
  /** Set while a circuit rests between steps. */
  rest?: RestInfo;
  /** After the last step of a circuit, "Next" leads to the circuit summary. */
  circuitDone: boolean;
  onAgain(): void;
  onNext(): void;
  onHome(): void;
}

function RestCountdown({ rest }: { rest: RestInfo }) {
  const [startedAt] = useState(() => Date.now());
  const [left, setLeft] = useState(rest.restSec);
  const [announce, setAnnounce] = useState(`Rest, ${rest.restSec} seconds`);
  const { onDone, restSec, nextName } = rest;
  useEffect(() => {
    const id = setInterval(() => {
      const n = restSecondsLeft(startedAt, Date.now(), restSec);
      setLeft(n);
      if (n <= 0) {
        clearInterval(id);
        setAnnounce(`Next: ${nextName}`);
        onDone();
      }
    }, 250);
    return () => clearInterval(id);
  }, [startedAt, restSec, nextName, onDone]);
  return (
    <section className={styles.rest} aria-labelledby="rest-h">
      <h2 id="rest-h">Rest</h2>
      {/* Announced at the start and at the end only, not every second (R10.8). */}
      <p role="status" className="visually-hidden">
        {announce}
      </p>
      <p className={styles.countdown} aria-hidden="true">
        {left} s
      </p>
      <p>Next up: {nextName}</p>
      <button type="button" className="btn btn-primary" onClick={rest.onSkip}>
        Skip rest
      </button>
    </section>
  );
}

export function Summary(p: SummaryProps) {
  const { summary } = p;
  const worked = hasWork(summary);
  const [effect, setEffectReq] = useState<EffectRequest | null>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clean = setEffect(summary);
    if (clean) setEffectReq({ key: 1, ...clean });
    if (p.streakGain) {
      timers.push(setTimeout(() => setEffectReq({ key: 2, ...streakEffect(p.streakWeeks) }), clean ? 700 : 0));
    }
    return () => timers.forEach(clearTimeout);
    // The effects belong to the set that was just finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = movementName(summary.movementId);

  const actions = p.rest ? (
    <>
      <RestCountdown rest={p.rest} />
      <div className={styles.actions}>
        <button type="button" className="btn" onClick={p.onHome}>
          Home
        </button>
      </div>
    </>
  ) : (
    <div className={styles.actions}>
      {!p.inCircuit && (
        <button type="button" className="btn btn-primary" onClick={p.onAgain}>
          {worked ? 'Again' : 'Try again'}
        </button>
      )}
      {p.inCircuit && p.circuitDone && (
        <button type="button" className="btn btn-primary" onClick={p.onNext}>
          Next
        </button>
      )}
      <button type="button" className="btn" onClick={p.onHome}>
        Home
      </button>
    </div>
  );

  if (!worked) {
    return (
      <Layout title="No reps yet">
        <p>
          The skeleton saw no {summary.kind === 'hold' ? 'hold' : 'reps'} for {name}, so nothing was saved.
        </p>
        {actions}
      </Layout>
    );
  }

  return (
    <Layout title={`${name}: set summary`}>
      <Effects request={effect} />
      {p.mode === 'demo' && (
        <p className={styles.note}>Demo clip set. It is saved as a demo and does not count toward your streak.</p>
      )}
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>{summary.kind === 'reps' ? 'Reps' : 'Hold'}</dt>
          <dd>{summary.kind === 'reps' ? summary.reps : seconds(summary.holdMs)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Clean</dt>
          <dd>{cleanText(summary)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Time under tension</dt>
          <dd>{seconds(summary.tutMs)}</dd>
        </div>
      </dl>

      <section aria-labelledby="warn-h">
        <h2 id="warn-h">Form warnings</h2>
        {summary.warnings.length === 0 ? (
          <p>None. The skeleton is impressed.</p>
        ) : (
          <ul>
            {summary.warnings.map((w) => (
              <li key={w.ruleId}>
                {w.message}: {w.count} {w.count === 1 ? 'time' : 'times'}
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.saved && p.streakGain && (
        <p className={styles.gain} role="status">
          Weekly streak extended: {p.streakWeeks} {p.streakWeeks === 1 ? 'week' : 'weeks'}!
        </p>
      )}
      {p.saved && !p.streakGain && p.mode === 'camera' && (
        <p className={styles.note}>Saved. This set did not extend your weekly streak.</p>
      )}
      {!p.persistent && (
        <p className={styles.note}>History will not be saved on this device, only kept until you close the tab.</p>
      )}
      {actions}
    </Layout>
  );
}
