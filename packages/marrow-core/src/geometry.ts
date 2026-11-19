import { LM } from './landmarks';
import type { Frame, Vec3 } from './types';

export type AnglePlane = 'xy' | 'xyz';

/**
 * Angle at vertex `b` between rays b->a and b->c, in degrees within [0, 180].
 * Returns NaN when a or c coincides with b. `plane: 'xy'` ignores z.
 */
export function angleAt(a: Vec3, b: Vec3, c: Vec3, plane: AnglePlane = 'xyz'): number {
  const useZ = plane === 'xyz';
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = useZ ? a.z - b.z : 0;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = useZ ? c.z - b.z : 0;
  if ((ux === 0 && uy === 0 && uz === 0) || (vx === 0 && vy === 0 && vz === 0)) return NaN;
  const dot = ux * vx + uy * vy + uz * vz;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const cross = Math.hypot(cx, cy, cz);
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mid(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Torso length: distance from the mid-shoulder to the mid-hip. NaN if landmarks are missing. */
export function bodyScale(frame: Frame): number {
  const ls = frame.landmarks[LM.leftShoulder];
  const rs = frame.landmarks[LM.rightShoulder];
  const lh = frame.landmarks[LM.leftHip];
  const rh = frame.landmarks[LM.rightHip];
  if (!ls || !rs || !lh || !rh) return NaN;
  return distance(mid(ls, rs), mid(lh, rh));
}
