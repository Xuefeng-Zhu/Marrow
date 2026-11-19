import { PRESET_CIRCUITS } from '../circuits/presets';
import { WORKOUTS } from '../movements/registry';
import type { Target } from '../movements/registry';
import { Layout } from './Layout';
import styles from './Picker.module.css';

export interface PickerProps {
  onPickWorkout(id: string): void;
  onPickCircuit(id: string): void;
  onOpenHistory(): void;
  /** Streak badge; the history task fills it with the live streak. */
  streakBadge?: string;
}

export const PRIVACY_LINE =
  'Pose detection runs on this device. Your video and body landmarks are never uploaded.';

export function targetText(t: Target): string {
  return t.kind === 'reps' ? `${t.reps} reps` : `${t.seconds} s hold`;
}

export function Picker({ onPickWorkout, onPickCircuit, onOpenHistory, streakBadge }: PickerProps) {
  return (
    <Layout title="Pick your torment">
      <p className={styles.lead}>
        A friendly skeleton counts your reps, rattles its bones and nags you about your form.
      </p>
      <p className={styles.badge} data-testid="streak-badge">
        {streakBadge ?? 'Weekly streak: none yet'}
      </p>

      <section aria-labelledby="workouts-h" className={styles.section}>
        <h2 id="workouts-h">Workouts</h2>
        <ul className={styles.list}>
          {WORKOUTS.map((w) => (
            <li key={w.id}>
              <button type="button" className={`btn ${styles.card}`} onClick={() => onPickWorkout(w.id)}>
                <span className={styles.cardName}>{w.name}</span>
                <span className={styles.cardMeta}>{targetText(w.defaultTarget)}</span>
                <span className={styles.cardBlurb}>{w.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="circuits-h" className={styles.section}>
        <h2 id="circuits-h">Circuits</h2>
        <ul className={styles.list}>
          {PRESET_CIRCUITS.map((c) => (
            <li key={c.id}>
              <button type="button" className={`btn ${styles.card}`} onClick={() => onPickCircuit(c.id)}>
                <span className={styles.cardName}>{c.name}</span>
                <span className={styles.cardMeta}>{c.steps.length} moves</span>
                <span className={styles.cardBlurb}>{c.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.actions}>
        <button type="button" className="btn" onClick={onOpenHistory}>
          History and streak
        </button>
      </p>
      <p className={styles.privacy}>{PRIVACY_LINE}</p>
    </Layout>
  );
}
