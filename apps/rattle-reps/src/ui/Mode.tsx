import { getCircuit } from '../circuits/presets';
import { getWorkout } from '../movements/registry';
import { cameraSupport, type CameraSupport } from '../session/cameraSupport';
import type { Choice, Mode as ModeId } from '../session/screenReducer';
import { Layout } from './Layout';
import styles from './Mode.module.css';
import { PRIVACY_LINE } from './Picker';

export interface ModeProps {
  choice: Choice;
  onChoose(mode: ModeId): void;
  onBack(): void;
  /** Replaces the browser check (tests). */
  support?: CameraSupport;
}

/** Where the model comes from, said before the user picks the camera (R15.4). */
export const MODEL_NOTICE =
  'Camera mode downloads a small pose model (about 6 MB) once from Google storage (storage.googleapis.com) and the MediaPipe code from the jsDelivr CDN. Demo clip mode downloads nothing.';

function describe(choice: Choice): { title: string; tips: { name: string; tip: string }[] } {
  if (choice.kind === 'workout') {
    const w = getWorkout(choice.id);
    return { title: w?.name ?? 'Workout', tips: w ? [{ name: w.name, tip: w.cameraTip }] : [] };
  }
  const c = getCircuit(choice.id);
  const seen = new Set<string>();
  const tips: { name: string; tip: string }[] = [];
  for (const s of c?.steps ?? []) {
    const w = getWorkout(s.movementId);
    if (w && !seen.has(w.id)) {
      seen.add(w.id);
      tips.push({ name: w.name, tip: w.cameraTip });
    }
  }
  return { title: c?.name ?? 'Circuit', tips };
}

export function Mode({ choice, onChoose, onBack, support }: ModeProps) {
  const camera = support ?? cameraSupport();
  const { title, tips } = describe(choice);
  return (
    <Layout title={`${title}: how do you want to play?`}>
      <p className={styles.privacy}>{PRIVACY_LINE}</p>

      <div className={styles.choices}>
        <div className={styles.choice}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!camera.ok}
            aria-describedby={camera.ok ? undefined : 'camera-reason'}
            onClick={() => onChoose('camera')}
          >
            Camera
          </button>
          {!camera.ok && (
            <p id="camera-reason" className={styles.reason}>
              Camera unavailable: {camera.reason} The demo clip works everywhere.
            </p>
          )}
          <p className={styles.note}>{MODEL_NOTICE}</p>
        </div>
        <div className={styles.choice}>
          <button type="button" className="btn" onClick={() => onChoose('demo')}>
            Demo clip
          </button>
          <p className={styles.note}>
            Replays a recorded skeleton through the same coach. No camera needed.
          </p>
        </div>
      </div>

      <section aria-labelledby="tips-h" className={styles.tips}>
        <h2 id="tips-h">Camera placement</h2>
        <ul>
          {tips.map((t) => (
            <li key={t.name}>
              <strong>{t.name}:</strong> {t.tip}
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.note}>Form hints, not medical advice. Stop if anything hurts.</p>
      <p>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </p>
    </Layout>
  );
}
