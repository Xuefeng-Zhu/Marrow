/**
 * Designed outcomes of the seven demo clips. `scripts/make-clips.ts` builds the clips from these
 * numbers and the tests replay each clip through the engine and compare against them.
 * Times are in ms on the clip timeline (the first frame is t = 0).
 */

export type ClipId =
  | 'shoulder-flexion-left'
  | 'shoulder-flexion-right'
  | 'knee-flexion-left'
  | 'knee-flexion-right'
  | 'chair-stand'
  | 'single-leg-stance-left'
  | 'single-leg-stance-right';

export interface RomOutcome {
  kind: 'rom-peak';
  fps: number;
  /** Flexion in degrees reached on each of the three raises or bends. */
  peaks: readonly number[];
  /** Expected reported result: the largest peak. */
  result: number;
  /** Allowed difference between the replayed result and `result`, in degrees. */
  toleranceDeg: number;
}

export interface CountOutcome {
  kind: 'count';
  fps: number;
  /** Full stands (sit, stand, sit) completed inside the 30-second window. */
  stands: number;
  windowMs: number;
}

export interface StanceOutcome {
  kind: 'seconds';
  fps: number;
  /** The raised foot leaves the floor at this time, so `hold:start` carries it. */
  liftMs: number;
  /** Expected stop reason. */
  reason: 'released' | 'sway';
  /** Foot down time, for reason `released`. */
  footDownMs?: number;
  /** The hip starts to drift past the sway limit here, for reason `sway`. */
  swayOnsetMs?: number;
  /** Time of the `form:warning` event: onset plus the 300 ms debounce in the spec. */
  warningMs?: number;
  /** Expected seconds from `hold:start` to the stop event, accurate to 0.1 s. */
  seconds: number;
  /** Clip length in ms (the last frame time). */
  endMs: number;
}

export type Outcome = RomOutcome | CountOutcome | StanceOutcome;

export const OUTCOMES: Readonly<Record<ClipId, Outcome>> = {
  'shoulder-flexion-left': { kind: 'rom-peak', fps: 20, peaks: [150, 158, 165], result: 165, toleranceDeg: 2 },
  'shoulder-flexion-right': { kind: 'rom-peak', fps: 20, peaks: [140, 148, 152], result: 152, toleranceDeg: 2 },
  'knee-flexion-left': { kind: 'rom-peak', fps: 20, peaks: [112, 118, 120], result: 120, toleranceDeg: 2 },
  'knee-flexion-right': { kind: 'rom-peak', fps: 20, peaks: [98, 102, 105], result: 105, toleranceDeg: 2 },
  'chair-stand': { kind: 'count', fps: 10, stands: 11, windowMs: 30000 },
  'single-leg-stance-left': {
    kind: 'seconds',
    fps: 10,
    liftMs: 1000,
    reason: 'released',
    footDownMs: 14500,
    seconds: 13.5,
    endMs: 16000,
  },
  'single-leg-stance-right': {
    kind: 'seconds',
    fps: 10,
    liftMs: 1000,
    reason: 'sway',
    swayOnsetMs: 9000,
    warningMs: 9300,
    seconds: 8.3,
    endMs: 12000,
  },
};

export const CLIP_IDS = Object.keys(OUTCOMES) as ClipId[];
