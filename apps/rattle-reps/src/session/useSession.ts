import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ProcessedFrame } from 'marrow-core';
import type { Target, WorkoutDef } from '../movements/registry';
import {
  INITIAL_VIEW,
  createSessionController,
  type LiveView,
  type SessionController,
  type SessionResult,
} from './sessionController';
import type { Mode } from './screenReducer';
import { createSource, type CreateSourceOptions, type SessionSource } from './sourceFactory';

export interface UseSessionOptions {
  workout: WorkoutDef;
  mode: Mode;
  target: Target;
  /** The `<video>` element for camera mode. */
  video?: RefObject<HTMLVideoElement | null>;
  /** Called once when the set ends on the target, the clip end or Stop. */
  onEnd?: (result: SessionResult) => void;
  /** Replaces the real source factory (tests). */
  createSource?: (o: CreateSourceOptions) => Promise<SessionSource>;
}

export interface UseSession {
  view: LiveView;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Subscribe to processed frames, for the canvas loop. */
  onFrame(fn: (f: ProcessedFrame) => void): () => void;
}

/** The only place that touches the pipeline. Starts on mount and cleans up on unmount (R14.6). */
export function useSession(options: UseSessionOptions): UseSession {
  const [view, setView] = useState<LiveView>(INITIAL_VIEW);
  const controller = useRef<SessionController | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const { workout, mode, target } = options;

  useEffect(() => {
    setView(INITIAL_VIEW);
    const make = latest.current.createSource ?? createSource;
    const c = createSessionController({
      workout,
      mode,
      target,
      createSource: ({ isHoldActive }) =>
        make({ mode, workout, video: latest.current.video?.current ?? undefined, isHoldActive }),
      onView: setView,
      onEnd: (r) => latest.current.onEnd?.(r),
    });
    controller.current = c;
    void c.start();
    return () => {
      c.dispose();
      if (controller.current === c) controller.current = null;
    };
  }, [workout, mode, target]);

  return {
    view,
    pause: useCallback(() => controller.current?.pause(), []),
    resume: useCallback(() => controller.current?.resume(), []),
    stop: useCallback(() => controller.current?.stop(), []),
    onFrame: useCallback((fn) => controller.current?.onFrame(fn) ?? (() => undefined), []),
  };
}
