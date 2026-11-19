import { metricHysteresis } from '../spec/hysteresis';
import type { MovementSpec } from '../spec/schema';
import type { Frame } from '../types';
import type { MarrowEvent } from './events';
import { evaluateMetrics, type MetricValues } from './metrics';

export interface Engine {
  /** Process one frame and return the events it produced. */
  push(frame: Frame): MarrowEvent[];
  /**
   * Account for the passage of time without a frame (for example when the source loses the
   * pose). Ends an active hold with reason `lost-pose` once `t` is more than `holdGapMs` past
   * the last valid frame. Ignored when `t` is not newer than the latest frame `t`.
   */
  advance(t: number): MarrowEvent[];
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

  const holds = spec.holds ?? [];
  const rules = spec.formRules ?? [];
  const romDefs = spec.rom ?? [];
  type HoldState = { condStart: number | null; active: boolean; lastTickT: number };
  type RuleState = { violStart: number | null; latched: boolean };
  type RomState = { min: number; max: number };
  const freshHolds = (): HoldState[] => holds.map(() => ({ condStart: null, active: false, lastTickT: 0 }));
  const freshRules = (): RuleState[] => rules.map(() => ({ violStart: null, latched: false }));
  const freshRom = (): RomState[] => romDefs.map(() => ({ min: Infinity, max: -Infinity }));
  const ruleHyst = rules.map((r) => r.hysteresis ?? metricHysteresis(spec, r.metric));
  let holdStates = freshHolds();
  let ruleStates = freshRules();
  let romStates = freshRom();
  /** Latest frame t seen by push. */
  let lastT = -Infinity;
  /** t of the latest valid frame (at least one metric is not NaN). */
  let lastValidT: number | null = null;

  /** Emit `rom:sample` for every rom definition with this trigger, then clear its extremes. */
  function romTrigger(trigger: string, t: number, events: MarrowEvent[]): void {
    romDefs.forEach((def, i) => {
      if (def.sampleOn !== trigger) return;
      const st = romStates[i]!;
      if (st.min <= st.max) {
        events.push({ type: 'rom:sample', t, metric: def.metric, min: st.min, max: st.max, trigger });
      }
      st.min = Infinity;
      st.max = -Infinity;
    });
  }

  function endHold(i: number, t: number, endT: number, reason: 'released' | 'lost-pose', events: MarrowEvent[]): void {
    const hs = holdStates[i]!;
    if (hs.active) {
      events.push({
        type: 'hold:end',
        t,
        holdId: holds[i]!.id,
        durationMs: endT - hs.condStart!,
        reason,
      });
      romTrigger('hold:end', t, events);
    }
    hs.condStart = null;
    hs.active = false;
  }

  /** Ends active holds when `t` is more than holdGapMs past the last valid frame. */
  function gapCheck(t: number, events: MarrowEvent[]): void {
    if (lastValidT === null || t - lastValidT <= spec.holdGapMs) return;
    holds.forEach((_, i) => {
      if (holdStates[i]!.active) endHold(i, t, lastValidT!, 'lost-pose', events);
    });
  }

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
        romTrigger('rep', t, events);
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
    romTrigger(`phase:${id}`, t, events);
  }

  function updateHolds(t: number, events: MarrowEvent[]): void {
    const cur = current === null ? null : phases[current]!.id;
    holds.forEach((hold, i) => {
      const hs = holdStates[i]!;
      if (cur !== hold.phase) {
        if (hs.condStart !== null) endHold(i, t, t, 'released', events);
        return;
      }
      if (hs.condStart === null) hs.condStart = t;
      if (!hs.active) {
        if (t - hs.condStart >= hold.minMs) {
          hs.active = true;
          hs.lastTickT = t;
          events.push({ type: 'hold:start', t: hs.condStart, holdId: hold.id });
        }
      } else if (t - hs.lastTickT >= hold.tickMs) {
        hs.lastTickT = t;
        events.push({ type: 'hold:tick', t, holdId: hold.id, elapsedMs: t - hs.condStart });
      }
    });
  }

  function updateRules(values: MetricValues, t: number, events: MarrowEvent[]): void {
    const cur = current === null ? null : phases[current]!.id;
    rules.forEach((rule, i) => {
      const v = values[rule.metric]!;
      if (Number.isNaN(v)) return;
      const rs = ruleStates[i]!;
      const h = ruleHyst[i]!;
      if (rs.latched) {
        const clear = (rule.max === undefined || v <= rule.max - h) && (rule.min === undefined || v >= rule.min + h);
        if (clear) rs.latched = false;
        return;
      }
      const violated = (rule.max !== undefined && v > rule.max) || (rule.min !== undefined && v < rule.min);
      const applicable = rule.phases === undefined || (cur !== null && rule.phases.includes(cur));
      if (!violated || !applicable) {
        rs.violStart = null;
        return;
      }
      if (rs.violStart === null) rs.violStart = t;
      if (t - rs.violStart >= rule.debounceMs) {
        rs.latched = true;
        rs.violStart = null;
        events.push({ type: 'form:warning', t, ruleId: rule.id, message: rule.message, value: v });
      }
    });
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
      const t = frame.t;
      gapCheck(t, events);
      if (t > lastT) lastT = t;
      const values = evaluateMetrics(spec, frame);
      if (Object.values(values).every((v) => Number.isNaN(v))) return events;
      lastValidT = t;
      romDefs.forEach((def, i) => {
        const v = values[def.metric]!;
        if (Number.isNaN(v)) return;
        const st = romStates[i]!;
        if (v < st.min) st.min = v;
        if (v > st.max) st.max = v;
      });
      step(values, t, events);
      updateHolds(t, events);
      updateRules(values, t, events);
      return events;
    },
    advance(t) {
      const events: MarrowEvent[] = [];
      if (t <= lastT) return events;
      gapCheck(t, events);
      return events;
    },
    reset() {
      current = null;
      repCount = 0;
      progress = 0;
      entries = {};
      holdStates = freshHolds();
      ruleStates = freshRules();
      romStates = freshRom();
      lastT = -Infinity;
      lastValidT = null;
    },
    get repCount() {
      return repCount;
    },
    get phase() {
      return current === null ? null : phases[current]!.id;
    },
  };
}
