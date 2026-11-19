export type OneEuroOptions = {
  /** Cutoff frequency in Hz at zero speed. Lower removes more jitter. Default 1. */
  minCutoff?: number;
  /** Speed coefficient. Higher cuts lag during fast motion. Default 5 (tuned for 0..1 image units per second). */
  beta?: number;
  /** Cutoff in Hz for the derivative low-pass. Default 1. */
  dCutoff?: number;
};

export const ONE_EURO_DEFAULTS = { minCutoff: 1, beta: 5, dCutoff: 1 } as const;

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/**
 * One-Euro filter (Casiez et al. 2012) for one scalar signal. Timestamps are in ms.
 * Deterministic and finite: bad samples never poison the state.
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private prevT: number | null = null;
  private prevX = 0;
  private prevDx = 0;

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? ONE_EURO_DEFAULTS.minCutoff;
    this.beta = opts.beta ?? ONE_EURO_DEFAULTS.beta;
    this.dCutoff = opts.dCutoff ?? ONE_EURO_DEFAULTS.dCutoff;
    if (!(this.minCutoff > 0) || !Number.isFinite(this.minCutoff)) throw new RangeError('minCutoff must be a finite number > 0');
    if (!(this.dCutoff > 0) || !Number.isFinite(this.dCutoff)) throw new RangeError('dCutoff must be a finite number > 0');
    if (!(this.beta >= 0) || !Number.isFinite(this.beta)) throw new RangeError('beta must be a finite number >= 0');
  }

  filter(value: number, tMs: number): number {
    if (Number.isNaN(value)) return NaN;
    if (!Number.isFinite(value)) return this.prevT === null ? NaN : this.prevX;
    if (this.prevT === null) {
      if (!Number.isFinite(tMs)) return value;
      this.prevT = tMs;
      this.prevX = value;
      this.prevDx = 0;
      return value;
    }
    const dt = (tMs - this.prevT) / 1000;
    if (!(dt > 0) || !Number.isFinite(dt)) return this.prevX;

    const dx = (value - this.prevX) / dt;
    const aD = smoothingFactor(this.dCutoff, dt);
    const dxHat = this.prevDx + aD * (dx - this.prevDx);
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(cutoff, dt);
    let out = this.prevX + a * (value - this.prevX);
    if (!Number.isFinite(dxHat) || !Number.isFinite(out)) return this.prevX;
    // Keep the result between the previous output and the input despite rounding.
    out = Math.min(Math.max(out, Math.min(this.prevX, value)), Math.max(this.prevX, value));

    this.prevT = tMs;
    this.prevX = out;
    this.prevDx = dxHat;
    return out;
  }

  reset(): void {
    this.prevT = null;
    this.prevX = 0;
    this.prevDx = 0;
  }
}
