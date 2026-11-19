import type { Frame } from '../types';
import type { PoseSource, SourceError, SourceErrorCode } from './types';

export const DEFAULT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
/** Must match the exact `@mediapipe/tasks-vision` version in package.json. */
export const MEDIAPIPE_VERSION = '1.2.3';
export const DEFAULT_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

export type MediaPipeSourceOptions = {
  /** URL of the Pose Landmarker `.task` model. Defaults to the public lite model. */
  modelUrl?: string;
  /** Base URL of the MediaPipe WASM assets. Defaults to a pinned CDN copy. */
  wasmUrl?: string;
  /** Video element to attach the camera stream to. Defaults to a new hidden element. */
  video?: HTMLVideoElement;
  /** `getUserMedia` video constraints. Defaults to the front camera. */
  camera?: MediaTrackConstraints | boolean;
};

type VideoLike = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type Landmarker = {
  detectForVideo(
    video: HTMLVideoElement,
    ts: number,
  ): { landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>> };
  close(): void;
};

/**
 * A `PoseSource` backed by the webcam and the MediaPipe Pose Landmarker. Inference runs on
 * device. `@mediapipe/tasks-vision` is imported lazily inside `start()`. Failures are reported
 * through `onError`; `start()` never throws. Frames without a pose call `onPoseLost(t)` and
 * deliver no `Frame`. Timestamps are milliseconds since `start()` and strictly increase.
 */
export function createMediaPipeSource(opts: MediaPipeSourceOptions = {}): PoseSource {
  const frameListeners = new Set<(f: Frame) => void>();
  const lostListeners = new Set<(t: number) => void>();
  const errorListeners = new Set<(e: SourceError) => void>();

  let running = false;
  let generation = 0;
  let stream: MediaStream | null = null;
  let landmarker: Landmarker | null = null;
  let video: VideoLike | null = null;
  let handle: number | undefined;
  let origin = 0;
  let lastT = -Infinity;

  function report(code: SourceErrorCode, message: string): void {
    for (const fn of [...errorListeners]) fn({ code, message });
  }

  function release(): void {
    if (video && handle !== undefined) {
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
      else if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    }
    handle = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video) {
      video.pause?.();
      video.srcObject = null;
    }
    try {
      landmarker?.close();
    } catch {
      /* already closed */
    }
    landmarker = null;
  }

  function schedule(gen: number): void {
    if (!video) return;
    const tick = (): void => {
      if (gen !== generation || !running || !video || !landmarker) return;
      let t = performance.now() - origin;
      if (t <= lastT) t = lastT + 0.001;
      lastT = t;
      try {
        const result = landmarker.detectForVideo(video, t);
        const pose = result.landmarks[0];
        if (pose && pose.length > 0) {
          const frame: Frame = {
            t,
            landmarks: pose.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })),
          };
          for (const fn of [...frameListeners]) fn(frame);
        } else {
          for (const fn of [...lostListeners]) fn(t);
        }
      } catch (err) {
        running = false;
        generation += 1;
        release();
        report('model-load-failed', `Pose detection failed: ${errorMessage(err)}`);
        return;
      }
      if (gen === generation && running) schedule(gen);
    };
    if (video.requestVideoFrameCallback) handle = video.requestVideoFrameCallback(tick);
    else handle = requestAnimationFrame(tick);
  }

  return {
    async start() {
      if (running) return;
      running = true;
      const gen = ++generation;
      const cancelled = (): boolean => gen !== generation || !running;

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        running = false;
        report('camera-unavailable', 'This browser cannot access a camera.');
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: opts.camera ?? { facingMode: 'user' },
          audio: false,
        });
        if (cancelled()) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
      } catch (err) {
        if (cancelled()) return;
        running = false;
        const name = err instanceof Error ? err.name : '';
        const denied = name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
        report(denied ? 'camera-denied' : 'camera-unavailable', errorMessage(err));
        return;
      }

      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(opts.wasmUrl ?? DEFAULT_WASM_URL);
        const create = (delegate: 'GPU' | 'CPU') =>
          vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: opts.modelUrl ?? DEFAULT_MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          }) as Promise<Landmarker>;
        let created: Landmarker;
        try {
          created = await create('GPU');
        } catch {
          created = await create('CPU');
        }
        if (cancelled()) {
          created.close();
          return;
        }
        landmarker = created;
      } catch (err) {
        if (cancelled()) return;
        running = false;
        release();
        report('model-load-failed', errorMessage(err));
        return;
      }

      try {
        video = (opts.video ?? document.createElement('video')) as VideoLike;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        if (cancelled()) return;
        running = false;
        release();
        report('camera-unavailable', errorMessage(err));
        return;
      }
      if (cancelled()) return;
      origin = performance.now();
      lastT = -Infinity;
      schedule(gen);
    },
    stop() {
      if (!running && !stream && !landmarker) return;
      running = false;
      generation += 1;
      release();
    },
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    onPoseLost(fn) {
      lostListeners.add(fn);
      return () => lostListeners.delete(fn);
    },
    onError(fn) {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
