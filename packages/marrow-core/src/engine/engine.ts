import { metricHysteresis } from '../spec/hysteresis';
import type { MovementSpec } from '../spec/schema';
import type { Frame } from '../types';
import type { MarrowEvent } from './events';
import { evaluateMetrics, type MetricValues } from './metrics';

export interface Engine {
  /** Process one frame and return the events it produced. */
  push(frame: Frame): MarrowEvent[];
  /** Forget all state, as on a fresh engine. */
  reset(): void;
  /** Number of reps counted since the last reset. */
  readonly repCount: number;
  /** Id of the current phase, or null while unknown. */
  readonly phase: string | null;
}

/**
 * Create a deterministic rules engine for a validated movement spec.
 * State and output depend only on the spec and the ordered frames pushed since the last reset.
 */
export function createEngine(spec: MovementSpec): Engine {
  const phases = spec.phases;
  const n = phases.length;
  const hyst = phases.map((p) => metricHysteresis(spec, p.metric));

  let current: number | null = null;
  let repCount = 0;
  /** Number of phases visited in order in the current partial cycle (0 means no cycle). */
  let progress = 0;
  let entries: Record<string, number> = {};

  function enter(k: number, t: number, events: MarrowEvent[]): void {
    const from = current === null ? null : phases[current]!.id;
    const id = phases[k]!.id;
    current = k;
    events.push({ type: 'phase', t, from, to: id });

    if (k === 0 && progress === n) {
      const start = entries[phases[0]!.id]!;
      const durationMs = t - start;
      if (durationMs >= spec.minRepMs) {
        repCount += 1;
        events.push({ type: 'rep', t, count: repCount, durationMs, phaseEntries: entries });
      }
      entries = { [id]: t };
      progress = 1;
    } else if (progress > 0 && k === progress) {
      entries[id] = t;
      progress += 1;
    } else if (k === 0) {
      entries = { [id]: t };
      progress = 1;
    } else {
      entries = {};
      progress = 0;
    }
  }

  function step(values: MetricValues, t: number, events: MarrowEvent[]): void {
    if (current === null) {
      for (let k = 0; k < n; k++) {
        const v = values[phases[k]!.metric]!;
        if (v >= phases[k]!.min && v <= phases[k]!.max) {
          enter(k, t, events);
          return;
        }
      }
      return;
    }
    const cur = phases[current]!;
    const cv = values[cur.metric]!;
    if (Number.isNaN(cv)) return;
    const h = hyst[current]!;
    if (cv >= cur.min - h && cv <= cur.max + h) return;
    for (let k = 0; k < n; k++) {
      if (k === current) continue;
      const q = phases[k]!;
      const v = values[q.metric]!;
      if (v >= q.min + hyst[k]! && v <= q.max - hyst[k]!) {
        enter(k, t, events);
        return;
      }
    }
  }

  return {
    push(frame) {
      const events: MarrowEvent[] = [];
      step(evaluateMetrics(spec, frame), frame.t, events);
      return events;
    },
    reset() {
      current = null;
      repCount = 0;
      progress = 0;
      entries = {};
    },
    get repCount() {
      return repCount;
    },
    get phase() {
      return current === null ? null : phases[current]!.id;
    },
  };
}
