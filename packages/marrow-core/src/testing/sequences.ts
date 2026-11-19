import { LM } from '../landmarks';
import { metricHysteresis } from '../spec/hysteresis';
import type { MovementSpec } from '../spec/schema';
import { subtractClosed, type Interval } from '../spec/validate';
import type { Frame, Landmark } from '../types';

/**
 * Test-only frame and value sequence generators. Not exported from the public entry.
 * They assume a single angle metric on leftShoulder, leftElbow, leftWrist (see SPEC_METRIC in
 * arbitraries.ts).
 */

/** A frame with a standing torso and a left arm whose elbow angle is `angle` degrees. */
export function angleFrame(t: number, angle: number): Frame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const set = (i: number, x: number, y: number) => {
    landmarks[i] = { x, y, z: 0, visibility: 1 };
  };
  set(LM.leftShoulder, 0.4, 0.2);
  set(LM.rightShoulder, 0.6, 0.2);
  set(LM.leftHip, 0.4, 0.6);
  set(LM.rightHip, 0.6, 0.6);
  set(LM.leftElbow, 0.4, 0.4);
  const rad = (angle * Math.PI) / 180;
  // The angle at the elbow is measured from the ray up to the shoulder.
  set(LM.leftWrist, 0.4 + 0.2 * Math.sin(rad), 0.4 - 0.2 * Math.cos(rad));
  return { t, landmarks };
}

/** A frame in which the wrist is not visible, so every metric using it is NaN. */
export function nanFrame(t: number): Frame {
  const f = angleFrame(t, 90);
  f.landmarks[LM.leftWrist] = { ...f.landmarks[LM.leftWrist]!, visibility: 0 };
  return f;
}

export type Witness = { value: number; halfWidth: number };

/**
 * Transition witness for entering phase `q` from phase `p` (R10, P14): the midpoint of the
 * widest interval of q's entry band that lies outside p's retention band and outside the
 * entry bands of the phases before q other than p. Returns null if the band is empty.
 */
export function witness(spec: MovementSpec, q: number, p: number): Witness | null {
  const phases = spec.phases;
  const Q = phases[q]!;
  const P = phases[p]!;
  const h = metricHysteresis(spec, Q.metric);
  let rest: Interval[] = [{ lo: Q.min + h, hi: Q.max - h, loOpen: false, hiOpen: false }];
  rest = subtractClosed(rest, P.min - h, P.max + h);
  for (let k = 0; k < q; k++) {
    if (k === p) continue;
    rest = subtractClosed(rest, phases[k]!.min + h, phases[k]!.max - h);
  }
  let best: Interval | undefined;
  for (const i of rest) if (!best || i.hi - i.lo > best.hi - best.lo) best = i;
  if (!best) return null;
  return { value: (best.lo + best.hi) / 2, halfWidth: (best.hi - best.lo) / 2 };
}

export type CycleOptions = {
  /** Number of complete cycles. */
  cycles: number;
  /** Frame spacings in ms, used cyclically. Each should be at least 1. */
  dts: number[];
  /** Unit noise samples in [-1, 1], used cyclically. */
  noise: number[];
  /** Noise amplitude as a fraction of min(h, m) (must be below 1). Default 0.9. */
  noiseScale?: number;
  /** Phase indices to leave out of the cycle (for "never visits a phase" tests). */
  skip?: number[];
  t0?: number;
};

/**
 * Frames for `cycles` clean cycles through the phases using transition witnesses, closed by
 * one final return to the first phase so that N cycles give N reps. Each witness is held
 * for at least 3 frames and at least `minRepMs` of time. Noise is strictly below min(h, m).
 */
export function cleanCycleFrames(spec: MovementSpec, opts: CycleOptions): Frame[] {
  const n = spec.phases.length;
  const skip = new Set(opts.skip ?? []);
  const scale = opts.noiseScale ?? 0.9;
  const order: number[] = [];
  for (let c = 0; c < opts.cycles; c++) for (let k = 0; k < n; k++) if (!skip.has(k)) order.push(k);
  if (!skip.has(0)) order.push(0);

  const frames: Frame[] = [];
  let t = opts.t0 ?? 0;
  let di = 0;
  let ni = 0;
  for (const k of order) {
    const pred = (k - 1 + n) % n;
    // A skipped predecessor is replaced by the previous visited phase's witness setup.
    const from = skip.has(pred) ? previousVisited(k, n, skip) : pred;
    const h = metricHysteresis(spec, spec.phases[k]!.metric);
    const ph = spec.phases[k]!;
    // With a single visited phase there is no transition: use the middle of its entry band.
    const w = from === k ? { value: (ph.min + ph.max) / 2, halfWidth: (ph.max - ph.min) / 2 - h } : witness(spec, k, from);
    if (!w) throw new Error(`no witness for phase ${k}`);
    const amp = scale * Math.min(h, w.halfWidth);
    const start = t;
    let count = 0;
    while (count < 3 || t - start < spec.minRepMs) {
      const noise = opts.noise.length > 0 ? opts.noise[ni++ % opts.noise.length]! : 0;
      frames.push(angleFrame(t, w.value + amp * noise));
      t += opts.dts[di++ % opts.dts.length]!;
      count++;
    }
  }
  return frames;
}

function previousVisited(k: number, n: number, skip: Set<number>): number {
  let p = (k - 1 + n) % n;
  while (skip.has(p) && p !== k) p = (p - 1 + n) % n;
  return p;
}

/** Frames for a list of raw angle values with the given spacing. NaN becomes a not-visible frame. */
export function valueFrames(values: number[], dts: number[], t0 = 0): Frame[] {
  const out: Frame[] = [];
  let t = t0;
  values.forEach((v, i) => {
    out.push(Number.isNaN(v) ? nanFrame(t) : angleFrame(t, v));
    t += dts[i % dts.length]!;
  });
  return out;
}

/**
 * Insert not-visible frames into a frame list. `positions` are indices (modulo length + 1)
 * of the frame before which a NaN frame is inserted. Inserted frames get a timestamp strictly
 * between their neighbours, so the real frames keep their `t`.
 */
export function withNaNFrames(frames: Frame[], positions: number[]): Frame[] {
  const out: Frame[] = [];
  const at = new Set(positions.map((p) => p % (frames.length + 1)));
  for (let i = 0; i <= frames.length; i++) {
    if (at.has(i)) {
      const prev = frames[i - 1];
      const next = frames[i];
      const t = prev && next ? (prev.t + next.t) / 2 : prev ? prev.t + 0.5 : next ? next.t - 0.5 : 0;
      out.push(nanFrame(t));
    }
    if (i < frames.length) out.push(frames[i]!);
  }
  return out;
}
