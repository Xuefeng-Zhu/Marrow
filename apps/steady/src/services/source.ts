import { createFixturePlayer, type PoseSource, type SourceErrorCode } from 'marrow-core';
import type { SourceMode } from '../session/machine';
import type { TestDef } from '../tests';

/**
 * Builds the pose source for a run. The demo source plays the committed clip and never touches the
 * camera. The camera source is created only when this is called with `'camera'`, and the core loads
 * MediaPipe lazily on its own `start()`, so nothing is fetched and no permission is asked before then (R2.5).
 */
export async function createSource(mode: SourceMode, test: TestDef): Promise<PoseSource> {
  if (mode === 'demo') return createFixturePlayer(test.clip);
  const { createMediaPipeSource } = await import('marrow-core');
  return createMediaPipeSource();
}

export interface SourceProblem {
  code: SourceErrorCode;
  message: string;
  /** The demo clip is always offered after a camera problem (R3.5). */
  offerDemo: true;
}

const MESSAGES: Record<SourceErrorCode, string> = {
  'camera-denied': 'Camera permission was not given. You can allow the camera in your browser settings, or try a demo clip instead.',
  'camera-unavailable': 'No camera was found. You can try a demo clip instead.',
  'model-load-failed': 'The pose model could not be loaded. Check your connection, or try a demo clip instead.',
  'fixture-invalid': 'The demo clip could not be read. Please reload the page.',
};

/** Plain-language message for a typed source error (R3.5). */
export function describeSourceError(code: SourceErrorCode): SourceProblem {
  return { code, message: MESSAGES[code], offerDemo: true };
}
