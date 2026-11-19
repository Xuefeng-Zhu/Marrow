import { fixtureFrame, type Fixture } from '../fixtures/schema';
import type { Frame } from '../types';
import type { PoseSource, SourceError } from './types';

/** Timer functions, injectable so tests run without real timers. */
export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export type FixturePlayerOptions = {
  /** Playback speed multiplier, greater than 0. Default 1. Frame `t` values are not scaled. */
  speed?: number;
  /** Restart after the last frame. Default false. */
  loop?: boolean;
  clock?: Clock;
};

/** Synchronously yield every frame of a fixture, without timers. */
export function* replay(fixture: Fixture): Iterable<Frame> {
  for (let i = 0; i < fixture.frames.length; i++) yield fixtureFrame(fixture, i);
}

/**
 * A `PoseSource` that plays a fixture. Frames carry the recorded `t`; when looping, each pass
 * is offset by the previous pass's length plus one frame interval so `t` stays increasing.
 * The player never loses the pose, so it never calls `onPoseLost` listeners.
 */
export function createFixturePlayer(fixture: Fixture, opts: FixturePlayerOptions = {}): PoseSource {
  const speed = opts.speed ?? 1;
  if (!(speed > 0) || !Number.isFinite(speed)) throw new RangeError('speed must be a positive finite number');
  const loop = opts.loop ?? false;
  const clock = opts.clock ?? systemClock;
  const frames = fixture.frames;
  const interval = 1000 / fixture.fps;
  const duration = frames[frames.length - 1]!.t + interval;

  const frameListeners = new Set<(f: Frame) => void>();
  const lostListeners = new Set<(t: number) => void>();
  const errorListeners = new Set<(e: SourceError) => void>();

  let started = false;
  let handle: unknown;
  let index = 0;
  let offset = 0;
  let lastT: number | null = null;

  /** Prepare a restart from the first frame, after the last delivered timestamp. */
  function rewind(): void {
    index = 0;
    if (lastT !== null) offset = lastT + interval;
  }

  function deliver(): void {
    handle = undefined;
    if (!started) return;
    const frame = fixtureFrame(fixture, index, offset);
    lastT = frame.t;
    for (const fn of [...frameListeners]) fn(frame);
    if (!started) return;
    const cur = frames[index]!.t;
    let delay: number;
    if (index + 1 < frames.length) {
      delay = (frames[index + 1]!.t - cur) / speed;
      index += 1;
    } else if (loop) {
      delay = interval / speed;
      index = 0;
      offset += duration;
    } else {
      started = false;
      rewind();
      return;
    }
    handle = clock.setTimeout(deliver, delay);
  }

  return {
    async start() {
      if (started) return;
      started = true;
      handle = clock.setTimeout(deliver, 0);
    },
    stop() {
      if (!started) return;
      started = false;
      if (handle !== undefined) clock.clearTimeout(handle);
      handle = undefined;
      rewind();
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
  };
}
