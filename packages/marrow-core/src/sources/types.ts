import type { Frame } from '../types';

export type SourceErrorCode = 'camera-denied' | 'camera-unavailable' | 'model-load-failed' | 'fixture-invalid';

export type SourceError = { code: SourceErrorCode; message: string };

/** A producer of pose frames: a camera or a recorded clip. */
export interface PoseSource {
  /** Begin delivering frames. A no-op when already started. */
  start(): Promise<void>;
  /** Stop delivering frames and release resources. */
  stop(): void;
  /** Subscribe to frames. Returns an unsubscribe function. */
  onFrame(fn: (f: Frame) => void): () => void;
  /**
   * Subscribe to pose-lost notifications: no pose was found in the video frame at time `t`
   * and no `Frame` was delivered for it. Returns an unsubscribe function.
   */
  onPoseLost(fn: (t: number) => void): () => void;
  /** Subscribe to source errors. Returns an unsubscribe function. */
  onError(fn: (e: SourceError) => void): () => void;
}
