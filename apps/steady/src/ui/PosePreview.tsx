import { drawSkeleton, type Frame, type PoseSource, type SkeletonStyle } from 'marrow-core';
import { useEffect, useRef, useState } from 'react';
import { isReady, landmarksVisible, type ReadinessSample } from '../logic/readiness';
import { createSource } from '../services/source';
import type { SourceMode } from '../session/machine';
import type { TestDef } from '../tests';
import styles from './ui.module.css';

/** Calm teal bones with a warm brown joint, matching the tokens in global.css. */
export const SKELETON_STYLE: SkeletonStyle = {
  boneColor: '#0a5560',
  jointColor: '#7a3e00',
  lineWidth: 4,
  jointRadius: 5,
};

/** Clears the canvas and draws one frame. Does nothing when the canvas has no 2D context. */
export function paintFrame(canvas: HTMLCanvasElement | null, frame: Frame | null, minVisibility?: number): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (frame) drawSkeleton(ctx, frame, { ...SKELETON_STYLE, ...(minVisibility !== undefined ? { minVisibility } : {}) });
}

interface Props {
  test: TestDef;
  mode: SourceMode;
  onError: (code: string) => void;
}

/**
 * Live skeleton preview for the setup screen. With the camera it also shows a "Ready" indicator once the
 * landmarks the test needs have been visible for one continuous second (R3.4). With the demo clip it plays
 * the clip and offers Pause and Play (R13.6). Nothing starts until this component mounts, so no camera
 * permission is asked on the home screen (R2.5).
 */
export function PosePreview({ test, mode, onError }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let src: PoseSource | null = null;
    const offs: Array<() => void> = [];
    const samples: ReadinessSample[] = [];
    const minVisibility = test.spec.minVisibility;

    createSource(mode, test)
      .then(async (s) => {
        if (cancelled) {
          s.stop();
          return;
        }
        src = s;
        offs.push(
          s.onFrame((f) => {
            paintFrame(canvas.current, f, minVisibility);
            if (mode !== 'camera') return;
            samples.push({ t: f.t, visible: landmarksVisible(f, test.requiredLandmarks, minVisibility) });
            if (samples.length > 600) samples.splice(0, samples.length - 600);
            setReady(isReady(samples));
          }),
          s.onPoseLost(() => {
            samples.length = 0;
            paintFrame(canvas.current, null);
            setReady(false);
          }),
          s.onError((e) => {
            if (!cancelled) onErrorRef.current(e.code);
          }),
        );
        await s.start();
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current('camera-unavailable');
      });

    return () => {
      cancelled = true;
      offs.forEach((off) => off());
      src?.stop();
    };
  }, [mode, test, paused]);

  const camera = mode === 'camera';
  return (
    <section className={styles.preview} aria-labelledby="preview-heading">
      <h2 id="preview-heading">{camera ? 'Camera preview' : 'Demo clip preview'}</h2>
      <canvas
        ref={canvas}
        className={styles.canvas}
        width={640}
        height={480}
        role="img"
        aria-label={camera ? 'Skeleton drawn over your pose from the camera' : 'Skeleton drawn from the demo clip'}
      >
        A line drawing of a skeleton that follows the pose.
      </canvas>
      {camera ? (
        <p role="status" className={ready ? styles.ready : styles.notReady}>
          {ready ? 'Ready' : 'Step into view so the camera can see all of you.'}
        </p>
      ) : (
        <div>
          <p>This is a recorded demo clip. No camera is used.</p>
          <button type="button" className="btn" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Play' : 'Pause'}
          </button>
        </div>
      )}
    </section>
  );
}
