import { LM, type Frame, type LandmarkName } from 'marrow-core';

export interface ReadinessSample {
  t: number;
  visible: boolean;
}

/** True when every named landmark is present with visibility at or above `minVisibility` (R3.4). */
export function landmarksVisible(frame: Frame, names: readonly LandmarkName[], minVisibility: number): boolean {
  return names.every((n) => {
    const lm = frame.landmarks[LM[n]];
    return lm !== undefined && lm.visibility >= minVisibility;
  });
}

/**
 * True when the samples (in time order) end with an unbroken run of visible samples that spans at
 * least `holdMs` (R3.4). A single invisible sample resets the run.
 */
export function isReady(samples: readonly ReadinessSample[], holdMs = 1000): boolean {
  const last = samples[samples.length - 1];
  if (!last || !last.visible) return false;
  let start = last.t;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    if (!s.visible) break;
    start = s.t;
  }
  return last.t - start >= holdMs;
}
