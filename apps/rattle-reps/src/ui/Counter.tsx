import type { Target } from '../movements/registry';
import styles from './Counter.module.css';

export interface CounterProps {
  kind: 'reps' | 'hold';
  reps: number;
  holdElapsedMs: number;
  target: Target;
}

export function counterSentence({ kind, reps, holdElapsedMs, target }: CounterProps): string {
  if (kind === 'reps') {
    return target.kind === 'reps' ? `Rep ${reps} of ${target.reps}` : `Rep ${reps}`;
  }
  const secs = Math.floor(holdElapsedMs / 1000);
  return target.kind === 'hold' ? `Hold ${secs} of ${target.seconds} seconds` : `Hold ${secs} seconds`;
}

/** The big number, readable from across the room, with a polite live sentence for screen readers (R5.7). */
export function Counter(props: CounterProps) {
  const { kind, reps, holdElapsedMs, target } = props;
  const value = kind === 'reps' ? reps : Math.floor(holdElapsedMs / 1000);
  const goal = target.kind === 'reps' ? target.reps : target.seconds;
  return (
    <div className={styles.counter}>
      <div className={styles.number} aria-hidden="true" data-testid="counter-number">
        {value}
      </div>
      <div className={styles.goal} aria-hidden="true">
        {kind === 'reps' ? `of ${goal} reps` : `of ${goal} s`}
      </div>
      <div aria-live="polite" role="status" className="visually-hidden" data-testid="counter-live">
        {counterSentence(props)}
      </div>
    </div>
  );
}
