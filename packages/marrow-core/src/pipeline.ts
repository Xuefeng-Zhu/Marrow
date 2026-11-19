import { evaluateMetrics, type MetricValues } from './engine/metrics';
import { createEngine } from './engine/engine';
import type { MarrowEvent } from './engine/events';
import type { MovementSpec } from './spec/schema';
import { LandmarkSmoother } from './smoothing/landmarkSmoother';
import type { OneEuroOptions } from './smoothing/oneEuro';
import type { PoseSource } from './sources/types';
import type { Frame } from './types';

/** What a frame listener receives: the (smoothed) frame, its metric values and the current phase. */
export type ProcessedFrame = { frame: Frame; metrics: MetricValues; phase: string | null };

export type PipelineOptions = {
  source: PoseSource;
  spec: MovementSpec;
  /** One-Euro options, or `false` to pass landmarks through unchanged. Default: smoothing on with defaults. */
  smoothing?: OneEuroOptions | false;
};

export interface Pipeline {
  start(): Promise<void>;
  /** Stop the source, unsubscribe from it and remove all listeners. */
  stop(): void;
  on<K extends MarrowEvent['type']>(type: K, fn: (e: Extract<MarrowEvent, { type: K }>) => void): () => void;
  onFrame(fn: (f: ProcessedFrame) => void): () => void;
}

type AnyListener = (e: MarrowEvent) => void;

/** Wire a source, optional smoothing and the rules engine, and dispatch events to typed listeners. */
export function createPipeline(opts: PipelineOptions): Pipeline {
  const { source, spec } = opts;
  const engine = createEngine(spec);
  const smoother = opts.smoothing === false ? null : new LandmarkSmoother(opts.smoothing ?? {});
  const listeners = new Map<MarrowEvent['type'], Set<AnyListener>>();
  const frameListeners = new Set<(f: ProcessedFrame) => void>();
  let unsubscribe: (() => void)[] = [];

  function dispatch(events: MarrowEvent[]): void {
    for (const e of events) for (const fn of [...(listeners.get(e.type) ?? [])]) fn(e);
  }

  function handleFrame(raw: Frame): void {
    const frame = smoother ? smoother.smooth(raw) : raw;
    const events = engine.push(frame);
    const processed: ProcessedFrame = { frame, metrics: evaluateMetrics(spec, frame), phase: engine.phase };
    for (const fn of [...frameListeners]) fn(processed);
    dispatch(events);
  }

  function subscribe(): void {
    if (unsubscribe.length > 0) return;
    unsubscribe = [source.onFrame(handleFrame), source.onPoseLost((t) => dispatch(engine.advance(t)))];
  }

  return {
    async start() {
      subscribe();
      await source.start();
    },
    stop() {
      source.stop();
      for (const off of unsubscribe) off();
      unsubscribe = [];
      listeners.clear();
      frameListeners.clear();
    },
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn as AnyListener);
      return () => {
        set.delete(fn as AnyListener);
      };
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => {
        frameListeners.delete(fn);
      };
    },
  };
}
