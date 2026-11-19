import { useEffect, useRef, useState } from 'react';
import {
  createFixturePlayer,
  createMediaPipeSource,
  createPipeline,
  drawSkeleton,
  parseFixture,
  parseMovementSpec,
  type PoseSource,
  type SkeletonStyle,
} from 'marrow-core';
import clipJson from 'marrow-core/fixtures/elbow-cycle-3reps.json';
import specJson from 'marrow-core/specs/elbow-cycle.json';
import styles from './App.module.css';

type Mode = 'demo' | 'camera';

const WIDTH = 640;
const HEIGHT = 480;

const parsedSpec = parseMovementSpec(specJson);
if (!parsedSpec.ok) throw new Error(parsedSpec.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
const spec = parsedSpec.spec;
const clip = parseFixture(clipJson);

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('demo');
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    ctx?.clearRect(0, 0, WIDTH, HEIGHT);
    if (!playing) return;

    const source: PoseSource =
      mode === 'camera' ? createMediaPipeSource() : createFixturePlayer(clip, { loop: true });
    const pipeline = createPipeline({ source, spec });
    const style: SkeletonStyle = {
      boneColor: cssVar('--bone', '#ffffff'),
      jointColor: cssVar('--joint', '#ffffff'),
      lineWidth: 4,
      jointRadius: 5,
    };
    source.onError((e) => {
      setError(e.message);
      setPlaying(false);
    });
    pipeline.onFrame(({ frame }) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawSkeleton(ctx, frame, style);
    });
    void pipeline.start();
    return () => pipeline.stop();
  }, [mode, playing]);

  function choose(next: Mode): void {
    if (next === mode) return;
    setError(null);
    setMode(next);
    setPlaying(next === 'camera' || !prefersReducedMotion());
  }

  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Steady</h1>
      <p className={styles.tagline}>Hello skeleton: calm, clear movement checks.</p>

      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className={`${styles.canvas} ${mode === 'camera' ? styles.mirror : ''}`}
          role="img"
          aria-label="Skeleton overlay drawn from pose landmarks"
        />
      </div>

      <div className={styles.controls}>
        <fieldset className={styles.group}>
          <legend className={styles.hidden}>Pose source</legend>
          <button type="button" className={styles.button} aria-pressed={mode === 'demo'} onClick={() => choose('demo')}>
            Demo clip
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={mode === 'camera'}
            onClick={() => choose('camera')}
          >
            Camera
          </button>
        </fieldset>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <p className={styles.privacy}>
        Everything runs on your device. No video is uploaded and no landmarks leave your browser.
      </p>
    </main>
  );
}
