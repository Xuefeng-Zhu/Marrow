import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { angleAt, bodyScale, distance } from './geometry';
import { LANDMARK_NAMES, LM, isLandmarkName } from './landmarks';
import type { Frame, Landmark, Vec3 } from './types';

const p = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const RUNS = { numRuns: 100 };

const coord = fc.double({ min: -100, max: 100, noNaN: true });
const vec = fc.record({ x: coord, y: coord, z: coord });
/** A point at least 0.5 away from the origin, so segments are never degenerate. */
const farVec = vec.filter((v) => Math.hypot(v.x, v.y, v.z) > 0.5);
const unit = fc
  .tuple(coord, coord, coord)
  .filter(([x, y, z]) => Math.hypot(x, y, z) > 0.5)
  .map(([x, y, z]) => {
    const n = Math.hypot(x, y, z);
    return p(x / n, y / n, z / n);
  });

const add = (a: Vec3, b: Vec3): Vec3 => p(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: Vec3, k: number): Vec3 => p(a.x * k, a.y * k, a.z * k);

/** Rotate v about the unit axis k by theta (Rodrigues). */
function rotate(v: Vec3, k: Vec3, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dot = v.x * k.x + v.y * k.y + v.z * k.z;
  const cr = p(k.y * v.z - k.z * v.y, k.z * v.x - k.x * v.z, k.x * v.y - k.y * v.x);
  return p(
    v.x * c + cr.x * s + k.x * dot * (1 - c),
    v.y * c + cr.y * s + k.y * dot * (1 - c),
    v.z * c + cr.z * s + k.z * dot * (1 - c),
  );
}

function frameOf(overrides: Record<number, Partial<Landmark>>): Frame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  for (const [i, v] of Object.entries(overrides)) landmarks[Number(i)] = { ...landmarks[Number(i)]!, ...v };
  return { t: 0, landmarks };
}

describe('landmarks', () => {
  it('maps names to MediaPipe indices', () => {
    expect(LANDMARK_NAMES).toHaveLength(33);
    expect(LM.nose).toBe(0);
    expect(LM.leftShoulder).toBe(11);
    expect(LM.rightShoulder).toBe(12);
    expect(LM.leftElbow).toBe(13);
    expect(LM.leftWrist).toBe(15);
    expect(LM.leftHip).toBe(23);
    expect(LM.leftKnee).toBe(25);
    expect(LM.leftAnkle).toBe(27);
    expect(LM.rightFootIndex).toBe(32);
  });

  it('recognises names and rejects others', () => {
    expect(isLandmarkName('leftKnee')).toBe(true);
    expect(isLandmarkName('knee')).toBe(false);
    expect(isLandmarkName('toString')).toBe(false);
  });
});

describe('angleAt unit cases', () => {
  it('measures a right angle', () => {
    expect(angleAt(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90, 9);
  });
  it('measures straight and folded', () => {
    expect(angleAt(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180, 9);
    expect(angleAt(p(1, 0), p(0, 0), p(2, 0))).toBeCloseTo(0, 9);
  });
  it('returns NaN for zero-length segments without throwing', () => {
    expect(angleAt(p(0, 0), p(0, 0), p(1, 0))).toBeNaN();
    expect(angleAt(p(1, 0), p(0, 0), p(0, 0))).toBeNaN();
  });
  it('ignores z in the xy plane', () => {
    const a = p(1, 0, 5);
    const c = p(0, 1, -5);
    expect(angleAt(a, p(0, 0), c, 'xy')).toBeCloseTo(90, 9);
    expect(angleAt(a, p(0, 0), c, 'xyz')).not.toBeCloseTo(90, 3);
  });
  it('computes distance', () => {
    expect(distance(p(0, 0, 0), p(3, 4, 0))).toBe(5);
  });
});

describe('bodyScale', () => {
  it('is the mid-shoulder to mid-hip distance', () => {
    const f = frameOf({
      [LM.leftShoulder]: { x: 0.4, y: 0.2 },
      [LM.rightShoulder]: { x: 0.6, y: 0.2 },
      [LM.leftHip]: { x: 0.4, y: 0.6 },
      [LM.rightHip]: { x: 0.6, y: 0.6 },
    });
    expect(bodyScale(f)).toBeCloseTo(0.4, 12);
  });
  it('is NaN for an empty frame', () => {
    expect(bodyScale({ t: 0, landmarks: [] })).toBeNaN();
  });
});

describe('geometry properties', () => {
  it('P1 range: angle is within [0, 180]', () => {
    fc.assert(
      fc.property(farVec, vec, farVec, (a, b, c) => {
        const A = add(b, a);
        const C = add(b, c);
        const r = angleAt(A, b, C);
        return r >= 0 && r <= 180;
      }),
      RUNS,
    );
  });

  it('P2 symmetry: angleAt(a,b,c) equals angleAt(c,b,a)', () => {
    fc.assert(
      fc.property(vec, vec, vec, (a, b, c) => {
        const x = angleAt(a, b, c);
        const y = angleAt(c, b, a);
        return Object.is(x, y) || Math.abs(x - y) < 1e-9;
      }),
      RUNS,
    );
  });

  it('P3 rigid and scale invariance', () => {
    fc.assert(
      fc.property(
        farVec,
        vec,
        farVec,
        vec,
        unit,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (a, b, c, shift, axis, theta, k) => {
          const A = add(b, a);
          const C = add(b, c);
          const base = angleAt(A, b, C);
          const tr = (v: Vec3) => add(scale(rotate(v, axis, theta), k), shift);
          const moved = angleAt(tr(A), tr(b), tr(C));
          return Math.abs(base - moved) < 1e-6;
        },
      ),
      RUNS,
    );
  });

  it('P4 collinear and perpendicular anchors', () => {
    fc.assert(
      fc.property(
        vec,
        unit,
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (b, dir, l1, l2) => {
          const opposite = angleAt(add(b, scale(dir, l1)), b, add(b, scale(dir, -l2)));
          const same = angleAt(add(b, scale(dir, l1)), b, add(b, scale(dir, l2)));
          // Any vector perpendicular to dir.
          const helper = Math.abs(dir.x) < 0.9 ? p(1, 0, 0) : p(0, 1, 0);
          const perp = p(
            dir.y * helper.z - dir.z * helper.y,
            dir.z * helper.x - dir.x * helper.z,
            dir.x * helper.y - dir.y * helper.x,
          );
          const pn = Math.hypot(perp.x, perp.y, perp.z);
          const u = scale(perp, 1 / pn);
          const right = angleAt(add(b, scale(dir, l1)), b, add(b, scale(u, l2)));
          return (
            Math.abs(opposite - 180) < 1e-6 && Math.abs(same) < 1e-6 && Math.abs(right - 90) < 1e-6
          );
        },
      ),
      RUNS,
    );
  });

  it('P5 normalisation: distance / bodyScale is unchanged by uniform frame scaling', () => {
    const lm = fc.record({ x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.double({ min: 0, max: 1, noNaN: true }), z: fc.double({ min: -0.5, max: 0.5, noNaN: true }) });
    fc.assert(
      fc.property(
        fc.array(lm, { minLength: 33, maxLength: 33 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.integer({ min: 0, max: 32 }),
        fc.integer({ min: 0, max: 32 }),
        (pts, k, i, j) => {
          const f: Frame = { t: 0, landmarks: pts.map((q) => ({ ...q, visibility: 1 })) };
          const s = bodyScale(f);
          fc.pre(s > 1e-3);
          const g: Frame = { t: 0, landmarks: f.landmarks.map((q) => ({ ...q, x: q.x * k, y: q.y * k, z: q.z * k })) };
          const n1 = distance(f.landmarks[i]!, f.landmarks[j]!) / s;
          const n2 = distance(g.landmarks[i]!, g.landmarks[j]!) / bodyScale(g);
          return Math.abs(n1 - n2) < 1e-9 * Math.max(1, Math.abs(n1));
        },
      ),
      RUNS,
    );
  });
});
