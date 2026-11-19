import { describeSourceError } from '../services/source';
import type { SourceMode } from '../session/machine';
import type { TestDef } from '../tests';
import type { SourceErrorCode } from 'marrow-core';
import { PosePreview } from './PosePreview';
import { useHeadingFocus } from './useHeadingFocus';
import { VoiceToggle } from './VoiceToggle';
import styles from './ui.module.css';

interface Props {
  test: TestDef;
  mode: SourceMode;
  safetyConfirmed: boolean;
  error: string | null;
  voice: { available: boolean; on: boolean; set: (on: boolean) => void };
  onConfirm: (confirmed: boolean) => void;
  onStart: () => void;
  onBack: () => void;
  onUseDemo: () => void;
  onSourceError: (code: string) => void;
}

export function Setup({ test, mode, safetyConfirmed, error, voice, onConfirm, onStart, onBack, onUseDemo, onSourceError }: Props) {
  const heading = useHeadingFocus();
  const problem = error ? describeSourceError(error as SourceErrorCode) : null;
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Get set: {test.title}
      </h1>

      <section className={styles.safety} aria-labelledby="safety-heading">
        <h2 id="safety-heading">Safety first</h2>
        <p>
          Have someone nearby and hold a support (a sturdy chair or counter). Stop if you feel pain, dizziness or
          unsteadiness.
        </p>
        <label className={styles.choice}>
          <input type="checkbox" checked={safetyConfirmed} onChange={(e) => onConfirm(e.target.checked)} />I have read this
          and I am ready
        </label>
      </section>

      {problem && (
        <div role="alert" className={styles.error}>
          <p>{problem.message}</p>
          <button type="button" className="btn btn-primary" onClick={onUseDemo}>
            Try a demo clip instead
          </button>
        </div>
      )}

      <div className={styles.row}>
        <button type="button" className="btn btn-primary" disabled={!safetyConfirmed} onClick={onStart}>
          Start
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <VoiceToggle available={voice.available} on={voice.on} onChange={voice.set} />
        {mode === 'camera' && !problem && (
          <button type="button" className="btn" onClick={onUseDemo}>
            Use a demo clip instead
          </button>
        )}
      </div>

      <h2>How to set up</h2>
      <ol className={styles.steps}>
        {test.setup.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      {!problem && <PosePreview test={test} mode={mode} onError={onSourceError} />}
    </>
  );
}
