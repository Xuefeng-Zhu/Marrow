import type { Frame } from 'marrow-core';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { RunSnapshot } from '../session/controller';
import type { TestDef } from '../tests';
import { paintFrame } from './PosePreview';
import { useHeadingFocus } from './useHeadingFocus';
import { VoiceToggle } from './VoiceToggle';
import styles from './ui.module.css';

interface Props {
  test: TestDef;
  snapshot: RunSnapshot | null;
  prompt: string;
  frameRef: MutableRefObject<Frame | null>;
  voice: { available: boolean; on: boolean; set: (on: boolean) => void };
  onStop: () => void;
  onDone: () => void;
}

function liveText(test: TestDef, s: RunSnapshot | null): string {
  const v = s?.value ?? null;
  if (test.kind === 'rom-peak') return v === null ? 'Peak so far: none yet' : `Peak so far: ${Math.round(v)} degrees`;
  if (test.kind === 'count') return `Stands so far: ${v ?? 0}`;
  return `Time held: ${Math.floor(v ?? 0)} seconds`;
}

function timeText(test: TestDef, s: RunSnapshot | null): string {
  if (!s) return '';
  if (test.kind === 'count') return `${Math.ceil(s.remainingMs / 1000)} seconds left`;
  return `${Math.floor(s.elapsedMs / 1000)} seconds`;
}

export function Run({ test, snapshot, prompt, frameRef, voice, onStop, onDone }: Props) {
  const heading = useHeadingFocus();
  const canvas = useRef<HTMLCanvasElement>(null);

  // Each snapshot arrives with a processed frame, so redraw the overlay then.
  useEffect(() => {
    paintFrame(canvas.current, frameRef.current, test.spec.minVisibility);
  }, [snapshot, frameRef, test]);

  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {test.title}
      </h1>
      <canvas
        ref={canvas}
        className={styles.canvas}
        width={640}
        height={480}
        role="img"
        aria-label="Skeleton drawn over your pose"
      >
        A line drawing of a skeleton that follows your pose.
      </canvas>
      <p role="status" aria-live="polite" className={styles.prompt}>
        {prompt}
      </p>
      <p aria-live="polite" className={styles.live}>
        {liveText(test, snapshot)}
      </p>
      <p className={styles.live}>{timeText(test, snapshot)}</p>
      <div className={styles.row}>
        <button type="button" className={`btn btn-primary ${styles.big}`} onClick={onStop}>
          Stop
        </button>
        {test.kind === 'rom-peak' && (
          <button type="button" className={`btn ${styles.big}`} onClick={onDone}>
            Done
          </button>
        )}
        <VoiceToggle available={voice.available} on={voice.on} onChange={voice.set} />
      </div>
    </>
  );
}
