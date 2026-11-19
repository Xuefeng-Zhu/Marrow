/** A joint angle or flexion value is valid when it is a finite number from 0 to 180 degrees (R5.3). */
export function isValidAngle(v: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 180;
}

/** Knee flexion from the hip-knee-ankle joint angle: a straight leg (180) is 0 flexion. */
export function kneeFlexion(angle: number): number {
  return 180 - angle;
}

/** Largest valid value, or null when there is none (R5.2, R5.4). */
export function selectPeak(values: readonly number[]): number | null {
  let peak: number | null = null;
  for (const v of values) {
    if (isValidAngle(v) && (peak === null || v > peak)) peak = v;
  }
  return peak;
}
