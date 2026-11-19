import { useEffect, useRef, useState } from 'react';
import {
  createMediaPipeSource,
  createPipeline,
  drawSkeleton,
  type Frame,
  type Landmark,
  type PoseSource,
  type SkeletonStyle,
} from 'marrow-core';
import { getWorkout } from './movements/registry';
import styles from './App.module.css';

type Mode = 'demo' | 'camera';

const WIDTH = 640;
const HEIGHT = 480;

const spec = getWorkout('squat')!.spec;

/** Temporary stand-in for the demo clip until task 18 wires App to the session controller and fixtures: a figure that bobs up and down at 20 fps. */
function createStubSource(): PoseSource {
  const frameListeners = new Set<(f: Frame) => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let t = 0;
  const frame = (ms: number): Frame => {
    const bob = 0.05 * Math.sin(ms / 400);
    const p = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 0.99 });
    const landmarks = Array.from({ length: 33 }, () => p(0.5, 0.12 + bob));
    landmarks[11] = p(0.4, 0.2 + bob);
    landmarks[12] = p(0.6, 0.2 + bob);
    landmarks[13] = p(0.35, 0.4 + bob);
    landmarks[14] = p(0.65, 0.4 + bob);
    landmarks[15] = p(0.35, 0.58 + bob);
    landmarks[16] = p(0.65, 0.58 + bob);
    landmarks[23] = p(0.42, 0.6 + bob);
    landmarks[24] = p(0.58, 0.6 + bob);
    landmarks[25] = p(0.42, 0.78);
    landmarks[26] = p(0.58, 0.78);
    landmarks[27] = p(0.42, 0.95);
    landmarks[28] = p(0.58, 0.95);
    return { t: ms, landmarks };
  };
  return {
    async start() {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        const f = frame(t);
        t += 50;
        for (const fn of [...frameListeners]) fn(f);
      }, 50);
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      t = 0;
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    onPoseLost: () => () => false,
    onError: () => () => false,
  };
}

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
      mode === 'camera' ? createMediaPipeSource() : createStubSource();
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
    source.onPoseLost(() => ctx?.clearRect(0, 0, WIDTH, HEIGHT));
    pipeline.onFrame(({ frame }) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawSkeleton(ctx, frame, style);
    });
    setError(null);
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
      <h1 className={styles.title}>Rattle Reps</h1>
      <p className={styles.tagline}>Hello skeleton: your bones, rattling along.</p>

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
