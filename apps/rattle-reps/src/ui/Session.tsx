import { useCallback, useEffect, useRef, useState } from 'react';
import type { Target, WorkoutDef } from '../movements/registry';
import type { Mode } from '../session/screenReducer';
import type { SessionResult } from '../session/sessionController';
import type { CreateSourceOptions, SessionSource } from '../session/sourceFactory';
import { useSession } from '../session/useSession';
import { Counter, counterSentence } from './Counter';
import { CueBar } from './CueBar';
import { Layout } from './Layout';
import styles from './Session.module.css';
import { SkeletonCanvas } from './SkeletonCanvas';

export interface SessionProps {
  workout: WorkoutDef;
  mode: Mode;
  target: Target;
  onEnd(result: SessionResult): void;
  /** Leave without a result (after an error). */
  onHome(): void;
  /** After a camera failure: run the same workout with the demo clip. */
  onUseDemo?(): void;
  /** Replaces the real source factory (tests). */
  createSource?: (o: CreateSourceOptions) => Promise<SessionSource>;
}

/** Keys that must not trigger a shortcut: text fields always, and buttons for Space (it activates them). */
function ignoreShortcut(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  return key === ' ' && tag === 'BUTTON';
}

export default function Session({ workout, mode, target, onEnd, onHome, onUseDemo, createSource }: SessionProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const session = useSession({ workout, mode, target, video, onEnd, createSource });
  const { view, pause, resume, stop } = session;
  const paused = view.status === 'paused';

  const togglePause = useCallback(() => (paused ? resume() : pause()), [paused, pause, resume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== ' ') return;
      if (ignoreShortcut(e.target, e.key)) return;
      e.preventDefault();
      if (e.key === 'Escape') stop();
      else togglePause();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stop, togglePause]);

  const sentence = counterSentence({
    kind: workout.kind,
    reps: view.reps,
    holdElapsedMs: view.holdElapsedMs,
    target,
  });
  const lastCue = view.cue && view.cue.cue.kind !== 'rep' ? view.cue.cue.text : 'no cue yet';
  const active = view.status === 'running' || view.status === 'paused' || view.status === 'starting';

  return (
    <Layout title={workout.name} wide>
      {mode === 'demo' && (
        <p className={styles.demoLabel} data-testid="demo-label">
          Demo clip
        </p>
      )}

      {view.error && (
        <div role="alert" className={styles.error}>
          <p>{view.error.message}</p>
          {view.error.demoFallback && onUseDemo && (
            <button type="button" className="btn btn-primary" onClick={onUseDemo}>
              Use demo clip
            </button>
          )}{' '}
          <button type="button" className="btn" onClick={onHome}>
            Home
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.stage} data-testid="stage">
          {mode === 'camera' && (
            <video
              ref={video}
              muted
              playsInline
              aria-hidden="true"
              className={`${styles.video} ${showVideo ? styles.videoShown : styles.videoHidden}`}
            />
          )}
          <SkeletonCanvas subscribe={session.onFrame} reps={view.reps} cue={view.cue} mirror={mode === 'camera'} />
        </div>

        <div className={styles.panel}>
          <Counter kind={workout.kind} reps={view.reps} holdElapsedMs={view.holdElapsedMs} target={target} />
          <CueBar cue={view.cue} poseLost={view.poseLost} status={view.status} />
          <p className="visually-hidden" data-testid="canvas-alt">
            Skeleton overlay. {sentence}. Last cue: {lastCue}.
          </p>

          <div className={styles.controls}>
            <button type="button" className="btn" onClick={togglePause} disabled={!active || view.status === 'starting'}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn btn-warn" onClick={stop} disabled={!active}>
              Stop
            </button>
            {mode === 'camera' && (
              <button
                type="button"
                className="btn"
                aria-pressed={showVideo}
                onClick={() => setShowVideo((v) => !v)}
              >
                Show my video
              </button>
            )}
          </div>
          <p className={styles.hint}>
            Keyboard: <kbd>Esc</kbd> stops, <kbd>Space</kbd> pauses.
            {mode === 'camera' && workout.kind === 'hold' ? ' Pause ends the current hold.' : ''}
          </p>
        </div>
      </div>
    </Layout>
  );
}
