import { createPipeline, type MarrowEvent, type Pipeline, type ProcessedFrame, type SourceError } from 'marrow-core';
import type { Target, WorkoutDef } from '../movements/registry';
import { summarize, type SetSummary } from '../summary/summarize';
import { nextCue, cueFor, type ActiveCue } from './cues';
import { createDepthChecker } from './depthCheck';
import type { Mode } from './screenReducer';
import type { CreateSourceOptions, SessionSource } from './sourceFactory';

export type SessionStatus = 'starting' | 'running' | 'paused' | 'ended' | 'error';

export interface SessionError {
  code: string;
  message: string;
  /** Camera failures offer the demo clip for the same workout (R3.7). */
  demoFallback: boolean;
}

/** What the screen shows. Driven by the same events as the event log. */
export interface LiveView {
  reps: number;
  holdElapsedMs: number;
  phase: string | null;
  cue: ActiveCue | null;
  poseLost: boolean;
  status: SessionStatus;
  error: SessionError | null;
}

export const INITIAL_VIEW: LiveView = {
  reps: 0,
  holdElapsedMs: 0,
  phase: null,
  cue: null,
  poseLost: false,
  status: 'starting',
  error: null,
};

export type ViewAction =
  | { type: 'event'; event: MarrowEvent; workout: WorkoutDef; now: number }
  | { type: 'status'; status: SessionStatus }
  | { type: 'poseLost'; lost: boolean }
  | { type: 'error'; error: SessionError };

/** Pure live view reducer. The rep counter never decreases (R5.6). */
export function viewReducer(view: LiveView, action: ViewAction): LiveView {
  switch (action.type) {
    case 'status':
      return { ...view, status: action.status };
    case 'poseLost':
      return view.poseLost === action.lost ? view : { ...view, poseLost: action.lost };
    case 'error':
      return { ...view, status: 'error', error: action.error };
    case 'event': {
      const { event, workout, now } = action;
      let next: LiveView = { ...view, poseLost: false };
      if (event.type === 'rep' && workout.kind === 'reps') next.reps = Math.max(view.reps, event.count);
      else if (event.type === 'phase') next.phase = event.to;
      else if (event.type === 'hold:tick') next.holdElapsedMs = event.elapsedMs;
      else if (event.type === 'hold:start') next.holdElapsedMs = 0;
      next = { ...next, cue: nextCue(view.cue, cueFor(event, workout), now) };
      return next;
    }
  }
}

export interface SessionResult {
  summary: SetSummary;
  /** The merged event log, depth warnings included, in arrival order. */
  events: readonly MarrowEvent[];
  startT: number;
  stopT: number;
  reason: 'target' | 'clip-end' | 'stop';
}

export interface SessionControllerOptions {
  workout: WorkoutDef;
  mode: Mode;
  target: Target;
  createSource: (opts: Pick<CreateSourceOptions, 'isHoldActive'>) => Promise<SessionSource>;
  onView?: (view: LiveView) => void;
  onEnd?: (result: SessionResult) => void;
  /** Wall clock in ms for cue expiry and pose-lost detection. */
  now?: () => number;
}

export interface SessionController {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** End the set now (the Stop button). */
  stop(): void;
  /** Stop everything without producing a result (unmount). Safe to call more than once. */
  dispose(): void;
  getView(): LiveView;
  getEvents(): readonly MarrowEvent[];
  onFrame(fn: (f: ProcessedFrame) => void): () => void;
}

/** A pose-lost cue appears after this long without a frame (R6.6). */
export const POSE_LOST_AFTER_MS = 2000;

const EVENT_TYPES = ['rep', 'phase', 'hold:start', 'hold:tick', 'hold:end', 'form:warning', 'rom:sample'] as const;

/**
 * The pipeline wiring of a session, without React. Every core event passes through the depth
 * checker before the event log and the cues. The set ends on the target, the clip end or `stop()`.
 * Ending on the target, or at the clip end, is deferred to the end of the synchronous dispatch of
 * the terminal frame, so that its `rom:sample` (and the `shallow-depth` warning it can produce) and
 * every other event of that frame are logged first, because `pipeline.stop()` drops listeners.
 */
export function createSessionController(opts: SessionControllerOptions): SessionController {
  const { workout, target } = opts;
  const now = opts.now ?? (() => performance.now());
  const checker = createDepthChecker(workout.id);
  const log: MarrowEvent[] = [];
  const frameListeners = new Set<(f: ProcessedFrame) => void>();

  let view = INITIAL_VIEW;
  let session: SessionSource | null = null;
  let pipeline: Pipeline | null = null;
  let generation = 0;
  let disposed = false;
  let ended = false;
  let pendingEnd: { t: number; reason: SessionResult['reason'] } | null = null;
  let startT: number | null = null;
  let lastT: number | null = null;
  let lastFrameWall = now();
  let holdOpen = false;
  let completedHoldMs = 0;
  let poseTimer: ReturnType<typeof setInterval> | undefined;
  let offError: (() => void) | undefined;

  function dispatch(action: ViewAction): void {
    const next = viewReducer(view, action);
    if (next === view) return;
    view = next;
    opts.onView?.(view);
  }

  function clearTimers(): void {
    if (poseTimer !== undefined) clearInterval(poseTimer);
    poseTimer = undefined;
  }

  function teardown(): void {
    clearTimers();
    offError?.();
    offError = undefined;
    pipeline?.stop();
    pipeline = null;
    frameListeners.clear();
  }

  function finish(reason: SessionResult['reason'], t: number): void {
    if (ended || disposed) return;
    ended = true;
    teardown();
    const from = startT ?? t;
    const stopT = Math.max(t, from);
    const summary = summarize({ workout: { id: workout.id, kind: workout.kind }, events: log, startT: from, stopT });
    dispatch({ type: 'status', status: 'ended' });
    opts.onEnd?.({ summary, events: [...log], startT: from, stopT, reason });
  }

  /** Request the end of the set once the current frame has been dispatched completely. */
  function endAfterFrame(t: number, reason: SessionResult['reason']): void {
    if (pendingEnd || ended) return;
    pendingEnd = { t, reason };
    const gen = generation;
    queueMicrotask(() => {
      if (gen === generation && pendingEnd) finish(pendingEnd.reason, pendingEnd.t);
    });
  }

  function targetReached(event: MarrowEvent): boolean {
    if (target.kind === 'reps') return event.type === 'rep' && workout.kind === 'reps' && event.count >= target.reps;
    if (event.type === 'hold:end') completedHoldMs += event.durationMs;
    const elapsed = event.type === 'hold:tick' ? completedHoldMs + event.elapsedMs : completedHoldMs;
    return elapsed >= target.seconds * 1000;
  }

  function handle(raw: MarrowEvent): void {
    if (ended) return;
    for (const event of checker.push(raw)) {
      log.push(event);
      if (event.type === 'hold:start') holdOpen = true;
      if (event.type === 'hold:end') holdOpen = false;
      if (pendingEnd) continue; // counter and cues stop updating once the set is ending
      dispatch({ type: 'event', event, workout, now: now() });
      if (targetReached(event)) endAfterFrame(event.t, 'target');
    }
  }

  function onSourceError(e: SourceError): void {
    dispatch({
      type: 'error',
      error: { code: e.code, message: e.message, demoFallback: opts.mode === 'camera' },
    });
    teardown();
  }

  return {
    async start() {
      const gen = ++generation;
      let created: SessionSource;
      try {
        created = await opts.createSource({ isHoldActive: () => holdOpen });
      } catch (err) {
        if (gen !== generation || disposed) return;
        dispatch({
          type: 'error',
          error: {
            code: 'camera-unavailable',
            message: err instanceof Error ? err.message : 'The source could not be started.',
            demoFallback: opts.mode === 'camera',
          },
        });
        return;
      }
      if (gen !== generation || disposed) {
        created.source.stop();
        return;
      }
      session = created;
      const p = createPipeline({ source: created.source, spec: workout.spec });
      pipeline = p;
      for (const type of EVENT_TYPES) p.on(type, handle);
      p.onFrame((f) => {
        if (ended) return;
        lastFrameWall = now();
        startT ??= f.frame.t;
        lastT = f.frame.t;
        if (view.poseLost) dispatch({ type: 'poseLost', lost: false });
        for (const fn of [...frameListeners]) fn(f);
        if (created.endT !== undefined && f.frame.t >= created.endT) endAfterFrame(f.frame.t, 'clip-end');
      });
      offError = created.source.onError(onSourceError);
      if (opts.mode === 'camera') {
        poseTimer = setInterval(() => {
          if (view.status === 'running' && now() - lastFrameWall > POSE_LOST_AFTER_MS) {
            dispatch({ type: 'poseLost', lost: true });
          }
        }, 500);
      }
      lastFrameWall = now();
      dispatch({ type: 'status', status: 'running' });
      try {
        await p.start();
      } catch (err) {
        if (gen !== generation || disposed) return;
        onSourceError({ code: 'camera-unavailable', message: err instanceof Error ? err.message : 'Start failed' });
      }
    },
    pause() {
      if (view.status !== 'running' || !session) return;
      session.pause();
      dispatch({ type: 'status', status: 'paused' });
    },
    resume() {
      if (view.status !== 'paused' || !session) return;
      lastFrameWall = now();
      session.resume();
      dispatch({ type: 'status', status: 'running' });
    },
    stop() {
      if (ended || disposed || !pipeline) return;
      finish('stop', lastT ?? startT ?? 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (!ended) teardown();
      session?.source.stop();
    },
    getView: () => view,
    getEvents: () => log,
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
  };
}
