import { useEffect, useRef, useState } from 'react';
import { drawSkeleton, type Frame, type ProcessedFrame } from 'marrow-core';
import type { ActiveCue } from '../session/cues';
import { TOKENS } from '../theme/tokens';
import { useReducedMotion } from '../theme/useReducedMotion';
import styles from './SkeletonCanvas.module.css';

export const WIDTH = 640;
export const HEIGHT = 480;
export const RATTLE_MS = 600;
export const RATTLE_AMPLITUDE = 7;
export const TINT_MS = 1000;

const defaultNow = () => performance.now();

/** Deterministic pseudo-random number in [0, 1) from an integer seed. */
function unit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Decaying jitter of the whole figure, in canvas pixels. The amplitude is `A * exp(-elapsed / 120)`
 * with a direction that depends only on `seed` and the elapsed time. It is exactly zero from 600 ms
 * on, before the start, and always under reduced motion (R8.3, R8.5).
 */
export function rattleOffset(elapsedMs: number, seed: number, reducedMotion = false): { x: number; y: number } {
  if (reducedMotion || !(elapsedMs >= 0) || elapsedMs >= RATTLE_MS) return { x: 0, y: 0 };
  const amp = RATTLE_AMPLITUDE * Math.exp(-elapsedMs / 120);
  const angle = unit(seed * 1000 + Math.floor(elapsedMs / 16)) * Math.PI * 2;
  return { x: amp * Math.cos(angle), y: amp * Math.sin(angle) };
}

export interface SkeletonCanvasProps {
  /** Subscribe to processed frames. */
  subscribe: (fn: (f: ProcessedFrame) => void) => () => void;
  /** The rep count: every increase rattles the skeleton. */
  reps: number;
  /** The current cue: a warning tints the skeleton for one second. */
  cue: ActiveCue | null;
  /** Mirror the picture, as the camera preview is mirrored. */
  mirror?: boolean;
  now?: () => number;
  /** Width over height of the picture behind the canvas (the camera frame). */
  aspect?: number;
}

/** The skeleton overlay. Decorative: the count and cues are available as text next to it (R19.6). */
export function SkeletonCanvas({ subscribe, reps, cue, mirror, now = defaultNow, aspect = WIDTH / HEIGHT }: SkeletonCanvasProps) {
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<Frame | null>(null);
  const rattleStart = useRef<number | null>(null);
  const lastReps = useRef(reps);
  const repsRef = useRef(reps);
  repsRef.current = reps;
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [flash, setFlash] = useState(false);

  useEffect(() => subscribe((f) => (frame.current = f.frame)), [subscribe]);

  useEffect(() => {
    if (reps > lastReps.current) {
      rattleStart.current = now();
      if (reduced) {
        setFlash(true);
        const id = setTimeout(() => setFlash(false), RATTLE_MS);
        lastReps.current = reps;
        return () => clearTimeout(id);
      }
    }
    lastReps.current = reps;
    return undefined;
  }, [reps, reduced, now]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d') ?? null;
    if (!el || !ctx) return;
    let raf = 0;
    const loop = () => {
      const t = now();
      ctx.clearRect(0, 0, el.width, el.height);
      const f = frame.current;
      if (f) {
        const c = cueRef.current;
        const tinted = !!c && c.cue.kind === 'warning' && t - c.shownAt < TINT_MS && t >= c.shownAt;
        const shift = rattleOffset(rattleStart.current === null ? -1 : t - rattleStart.current, repsRef.current, reducedRef.current);
        ctx.save();
        ctx.translate(shift.x, shift.y);
        drawSkeleton(ctx, f, {
          boneColor: tinted ? TOKENS['--warn'] : TOKENS['--bone'],
          jointColor: tinted ? TOKENS['--warn'] : TOKENS['--pumpkin'],
          lineWidth: 5,
          jointRadius: 6,
        });
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [now]);

  const canvasHeight = Math.max(1, Math.round(WIDTH / (aspect > 0 && Number.isFinite(aspect) ? aspect : WIDTH / HEIGHT)));

  return (
    <canvas
      ref={canvas}
      width={WIDTH}
      height={canvasHeight}
      aria-hidden="true"
      className={`${styles.canvas} ${mirror ? styles.mirror : ''} ${flash ? styles.flash : ''}`}
    />
  );
}
