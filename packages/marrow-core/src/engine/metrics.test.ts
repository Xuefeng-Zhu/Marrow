import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bodyScale } from '../geometry';
import { LM } from '../landmarks';
import { parseMovementSpec } from '../spec/parse';
import type { MovementSpec } from '../spec/schema';
import type { Frame, Landmark } from '../types';
import { evaluateMetrics } from './metrics';

const RUNS = { numRuns: 100 };

function spec(overrides: Record<string, unknown> = {}): MovementSpec {
  const r = parseMovementSpec({
    version: 1,
    id: 'metrics-test',
    name: 'Metrics test',
    metrics: {
      elbow: { kind: 'angle', points: ['leftShoulder', 'leftElbow', 'leftWrist'] },
      elbowXy: { kind: 'angle', points: ['leftShoulder', 'leftElbow', 'leftWrist'], plane: 'xy' },
      reach: { kind: 'distance', points: ['leftWrist', 'leftHip'] },
      drift: { kind: 'offset', points: ['leftElbow', 'leftHip'], axis: 'x' },
      lift: { kind: 'offset', points: ['leftElbow', 'leftHip'], axis: 'y' },
    },
    phases: [
      { id: 'a', metric: 'elbow', min: 0, max: 90 },
      { id: 'b', metric: 'elbow', min: 100, max: 180 },
    ],
    ...overrides,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
}

/** A frame with a torso of length 0.4 and a left arm. All landmarks are visible. */
function frame(overrides: Record<number, Partial<Landmark>> = {}): Frame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const set = (i: number, x: number, y: number, z = 0) => {
    landmarks[i] = { x, y, z, visibility: 1 };
  };
  // Mid-shoulder (0.5, 0.2) to mid-hip (0.5, 0.6): torso length 0.4.
  set(LM.leftShoulder, 0.4, 0.2);
  set(LM.rightShoulder, 0.6, 0.2);
  set(LM.leftHip, 0.4, 0.6);
  set(LM.rightHip, 0.6, 0.6);
  set(LM.leftElbow, 0.3, 0.4);
  set(LM.leftWrist, 0.3, 0.2); // wrist is straight above the elbow
  for (const [i, v] of Object.entries(overrides)) landmarks[Number(i)] = { ...landmarks[Number(i)]!, ...v };
  return { t: 0, landmarks };
}

describe('evaluateMetrics', () => {
  it('evaluates an angle metric in degrees', () => {
    const v = evaluateMetrics(spec(), frame());
    // Rays from the elbow (0.3,0.4): to the shoulder (0.1,-0.2), to the wrist (0,-0.2).
    const expected = (Math.atan(0.1 / 0.2) * 180) / Math.PI;
    expect(v.elbow).toBeCloseTo(expected, 6);
  });

  it('measures a straight 90 degree elbow', () => {
    const f = frame({ [LM.leftShoulder]: { x: 0.5, y: 0.4 } }); // shoulder to the right of elbow
    expect(evaluateMetrics(spec(), f).elbow).toBeCloseTo(90, 6);
  });

  it('honours the xy plane for angles', () => {
    const f = frame({
      [LM.leftShoulder]: { x: 0.5, y: 0.4, z: 0.3 },
      [LM.leftWrist]: { z: -0.2 },
    });
    const v = evaluateMetrics(spec(), f);
    expect(v.elbowXy).toBeCloseTo(90, 6);
    expect(v.elbow).not.toBeCloseTo(90, 3);
  });

  it('normalises distance by the torso length', () => {
    const v = evaluateMetrics(spec(), frame());
    // wrist (0.3,0.2) to hip (0.4,0.6), torso 0.4.
    expect(v.reach).toBeCloseTo(Math.hypot(0.1, 0.4) / 0.4, 9);
  });

  it('gives a signed offset along the axis, normalised', () => {
    const v = evaluateMetrics(spec(), frame());
    expect(v.drift).toBeCloseTo((0.3 - 0.4) / 0.4, 9);
    expect(v.lift).toBeCloseTo((0.4 - 0.6) / 0.4, 9);
  });

  it('returns NaN when a used landmark is below minVisibility', () => {
    const f = frame({ [LM.leftWrist]: { visibility: 0.2 } });
    const v = evaluateMetrics(spec(), f);
    expect(v.elbow).toBeNaN();
    expect(v.elbowXy).toBeNaN();
    expect(v.reach).toBeNaN();
    expect(v.drift).not.toBeNaN();
  });

  it('uses the spec minVisibility, default 0.5, and accepts equality', () => {
    const f = frame({ [LM.leftWrist]: { visibility: 0.5 } });
    expect(evaluateMetrics(spec(), f).elbow).not.toBeNaN();
    const g = frame({ [LM.leftWrist]: { visibility: 0.7 } });
    expect(evaluateMetrics(spec({ minVisibility: 0.8 }), g).elbow).toBeNaN();
    expect(evaluateMetrics(spec({ minVisibility: 0.6 }), g).elbow).not.toBeNaN();
  });

  it('returns NaN for normalised metrics when a torso landmark is not visible', () => {
    const f = frame({ [LM.rightHip]: { visibility: 0.1 } });
    const v = evaluateMetrics(spec(), f);
    expect(v.reach).toBeNaN();
    expect(v.drift).toBeNaN();
    expect(v.elbow).not.toBeNaN();
  });

  it('returns NaN for normalised metrics when the torso has zero length', () => {
    const f = frame({
      [LM.leftShoulder]: { x: 0.5, y: 0.6 },
      [LM.rightShoulder]: { x: 0.5, y: 0.6 },
    });
    const v = evaluateMetrics(spec(), f);
    expect(v.reach).toBeNaN();
    expect(v.drift).toBeNaN();
  });

  it('returns NaN for a degenerate angle and for a short landmark array', () => {
    const f = frame({ [LM.leftWrist]: { x: 0.3, y: 0.4 } });
    expect(evaluateMetrics(spec(), f).elbow).toBeNaN();
    const short: Frame = { t: 0, landmarks: [] };
    const v = evaluateMetrics(spec(), short);
    for (const x of Object.values(v)) expect(x).toBeNaN();
  });

  it('returns NaN for non-finite landmark coordinates', () => {
    const f = frame({ [LM.leftWrist]: { x: Number.NaN } });
    expect(evaluateMetrics(spec(), f).elbow).toBeNaN();
  });

  it('P5 (normalisation, metric layer): distance and offset metrics are unchanged by uniform scaling', () => {
    const coord = fc.double({ min: 0.05, max: 0.95, noNaN: true });
    const pt = fc.record({ x: coord, y: coord, z: fc.double({ min: -0.5, max: 0.5, noNaN: true }) });
    fc.assert(
      fc.property(
        fc.array(pt, { minLength: 33, maxLength: 33 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (pts, k) => {
          const f: Frame = { t: 0, landmarks: pts.map((p) => ({ ...p, visibility: 1 })) };
          const g: Frame = {
            t: 0,
            landmarks: f.landmarks.map((l) => ({ x: l.x * k, y: l.y * k, z: l.z * k, visibility: 1 })),
          };
          fc.pre(bodyScale(f) > 0.05); // avoid near-degenerate torsos, where float error dominates
          const a = evaluateMetrics(spec(), f);
          const b = evaluateMetrics(spec(), g);
          for (const name of ['reach', 'drift', 'lift']) {
            if (Number.isNaN(a[name]!)) {
              expect(b[name]).toBeNaN();
            } else {
              expect(b[name]!).toBeCloseTo(a[name]!, 6);
            }
          }
        },
      ),
      RUNS,
    );
  });
});
