import { createFixturePlayer, type PoseSource } from 'marrow-core';
import { getFixture } from '../fixtures';
import type { WorkoutDef } from '../movements/registry';
import { createPausableClock, type PausableClockOptions } from './pausableClock';
import { createPausableSource } from './pausableSource';
import type { Mode } from './screenReducer';

/** A pose source and its pause controls, chosen for the mode. */
export interface SessionSource {
  source: PoseSource;
  pause(): void;
  resume(): void;
  /** Demo clips: timestamp of the last frame, so the controller can end the set at the clip end. */
  endT?: number;
}

export interface CreateSourceOptions {
  mode: Mode;
  workout: WorkoutDef;
  /** The `<video>` element that the camera source reads from. */
  video?: HTMLVideoElement;
  /** True while a hold is active; the camera pause needs it (see `pausableSource`). */
  isHoldActive: () => boolean;
  /** Timer and time source of the demo clip, so that tests can run it on a fake clock. */
  clock?: PausableClockOptions;
}

export type CameraSupport = { ok: true } | { ok: false; reason: string };

/** Whether the camera can be used: a secure context with `navigator.mediaDevices` (R21.6). */
export function cameraSupport(
  env: { isSecureContext?: boolean; mediaDevices?: unknown } = {
    isSecureContext: globalThis.isSecureContext,
    mediaDevices: globalThis.navigator?.mediaDevices,
  },
): CameraSupport {
  if (!env.isSecureContext) return { ok: false, reason: 'The camera needs a secure (HTTPS) page.' };
  if (!env.mediaDevices) return { ok: false, reason: 'This browser does not give access to a camera.' };
  return { ok: true };
}

export async function createSource(opts: CreateSourceOptions): Promise<SessionSource> {
  const { workout } = opts;
  if (opts.mode === 'demo') {
    const fixture = getFixture(workout.fixtureId);
    if (!fixture) throw new Error(`No demo clip for "${workout.id}"`);
    const clock = createPausableClock(opts.clock);
    const source = createFixturePlayer(fixture, { loop: false, clock });
    const endT = fixture.frames[fixture.frames.length - 1]!.t;
    return { source, pause: () => clock.pause(), resume: () => clock.resume(), endT };
  }
  const support = cameraSupport();
  if (!support.ok) throw new Error(support.reason);
  const { createCameraSource } = await import('./cameraSource');
  const pausable = createPausableSource(createCameraSource(opts.video), {
    holdGapMs: workout.spec.holdGapMs,
    isHoldActive: opts.isHoldActive,
  });
  return { source: pausable, pause: () => pausable.pause(), resume: () => pausable.resume() };
}
