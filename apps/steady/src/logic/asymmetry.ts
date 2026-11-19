import type { Side } from '../tests';

/** `|a - b| / max(a, b) * 100`, or 0 when the larger value is not positive or an input is not finite (R6.1, R6.2). */
export function asymmetryPct(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const max = Math.max(a, b);
  if (max <= 0) return 0;
  return (Math.abs(a - b) / max) * 100;
}

export interface AsymmetryDescription {
  /** Rounded to one decimal. */
  pct: number;
  larger: Side | 'equal';
  text: string;
}

/** Plain-words description that names the larger side and never labels a side as abnormal (R6.4). */
export function describeAsymmetry(left: number, right: number): AsymmetryDescription {
  const pct = Math.round(asymmetryPct(left, right) * 10) / 10;
  const valid = Number.isFinite(left) && Number.isFinite(right);
  if (!valid || left === right || pct === 0) {
    return { pct, larger: 'equal', text: 'Both sides are about the same.' };
  }
  const larger: Side = left > right ? 'left' : 'right';
  const name = larger === 'left' ? 'Left' : 'Right';
  return { pct, larger, text: `${name} is ${pct}% larger.` };
}
