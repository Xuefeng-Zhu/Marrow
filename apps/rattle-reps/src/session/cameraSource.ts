import { createMediaPipeSource, type PoseSource } from 'marrow-core';

/** Loaded with a dynamic `import()` so that the camera path is its own chunk (R21.4). */
export function createCameraSource(video: HTMLVideoElement | undefined): PoseSource {
  return createMediaPipeSource(video ? { video } : {});
}
