import type { Frame, PoseSource, SourceError } from 'marrow-core';

export interface PausableSource extends PoseSource {
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

export interface PausableSourceOptions {
  /** `holdGapMs` of the movement spec: a gap above it ends an active hold with `lost-pose`. */
  holdGapMs: number;
  /** True while a hold is active (a `hold:start` without a later `hold:end`). */
  isHoldActive: () => boolean;
}

/** Spacing used for the one-frame gap when a pause left no hold open and no spacing is known. */
const DEFAULT_FRAME_MS = 33;

/**
 * Camera pause. While paused, frames and pose-lost notifications are dropped. After `resume()` the
 * time spent paused is subtracted from every `t`, so timestamps keep increasing and paused time is
 * never inside a `durationMs`. Only a short gap remains: one frame spacing, or `holdGapMs + 1` when
 * a hold was active at pause, so the core ends that hold with `lost-pose` on the first frame after
 * resume (the core compares timestamps only, it does not read the wall clock).
 */
export function createPausableSource(inner: PoseSource, opts: PausableSourceOptions): PausableSource {
  const frameListeners = new Set<(f: Frame) => void>();
  const lostListeners = new Set<(t: number) => void>();
  const errorListeners = new Set<(e: SourceError) => void>();
  let off: (() => void)[] = [];

  let paused = false;
  let offset = 0;
  /** True from `resume()` until the first frame or notification that sets the offset. */
  let needsShift = false;
  let holdOpenAtPause = false;
  let lastOut: number | null = null;
  let spacing = DEFAULT_FRAME_MS;

  function shifted(innerT: number): number {
    if (needsShift) {
      needsShift = false;
      if (lastOut !== null) {
        const gap = holdOpenAtPause ? opts.holdGapMs + 1 : Math.min(spacing, opts.holdGapMs);
        offset = innerT - (lastOut + gap);
      }
      holdOpenAtPause = false;
    }
    return innerT - offset;
  }

  function handleFrame(f: Frame): void {
    if (paused) return;
    const first = needsShift;
    const t = shifted(f.t);
    if (!first && lastOut !== null && t > lastOut) spacing = Math.max(1, t - lastOut);
    lastOut = t;
    const out: Frame = { t, landmarks: f.landmarks };
    for (const fn of [...frameListeners]) fn(out);
  }

  function handleLost(innerT: number): void {
    if (paused) return;
    const t = shifted(innerT);
    for (const fn of [...lostListeners]) fn(t);
  }

  function handleError(e: SourceError): void {
    for (const fn of [...errorListeners]) fn(e);
  }

  return {
    async start() {
      if (off.length === 0) off = [inner.onFrame(handleFrame), inner.onPoseLost(handleLost), inner.onError(handleError)];
      await inner.start();
    },
    stop() {
      inner.stop();
      for (const fn of off) fn();
      off = [];
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    onPoseLost(fn) {
      lostListeners.add(fn);
      return () => lostListeners.delete(fn);
    },
    onError(fn) {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
    pause() {
      if (paused) return;
      paused = true;
      holdOpenAtPause = holdOpenAtPause || opts.isHoldActive();
    },
    resume() {
      if (!paused) return;
      paused = false;
      needsShift = true;
    },
    get paused() {
      return paused;
    },
  };
}
