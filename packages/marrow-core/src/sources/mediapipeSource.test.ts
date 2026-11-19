import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../types';
import { createMediaPipeSource, DEFAULT_WASM_URL, MEDIAPIPE_VERSION } from './mediapipeSource';
import type { SourceError } from './types';

const mp = vi.hoisted(() => ({
  loaded: 0,
  createFails: false,
  gpuFails: false,
  detect: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => {
  mp.loaded++;
  return {
    FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
    PoseLandmarker: {
      createFromOptions: vi.fn(async (_f: unknown, o: { baseOptions: { delegate: string } }) => {
        if (mp.gpuFails && o.baseOptions.delegate === 'GPU') throw new Error('no webgl');
        if (mp.createFails) throw new Error('boom');
        return { detectForVideo: mp.detect, close: mp.close };
      }),
    },
  };
});

const pose = Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: 0.5, z: 0, visibility: 0.9 }));

function fakeVideo() {
  let cb: (() => void) | undefined;
  return {
    muted: false,
    playsInline: false,
    srcObject: undefined as unknown,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    requestVideoFrameCallback: vi.fn((fn: () => void) => {
      cb = fn;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(),
    /** Fire the pending video frame callback once. */
    step() {
      const fn = cb;
      cb = undefined;
      fn?.();
    },
  };
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function setup(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: vi.fn(getUserMedia) } },
    configurable: true,
  });
  const video = fakeVideo();
  const source = createMediaPipeSource({ video: video as unknown as HTMLVideoElement });
  const errors: SourceError[] = [];
  const frames: Frame[] = [];
  const lost: number[] = [];
  source.onError((e) => errors.push(e));
  source.onFrame((f) => frames.push(f));
  source.onPoseLost((t) => lost.push(t));
  return { video, source, errors, frames, lost };
}

beforeEach(() => {
  mp.createFails = false;
  mp.detect.mockReset();
  mp.close.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMediaPipeSource', () => {
  it('starts, delivers frames with increasing t, and stop releases resources', async () => {
    const { track, stream } = fakeStream();
    const { video, source, errors, frames } = setup(async () => stream);
    mp.detect.mockReturnValue({ landmarks: [pose] });
    await source.start();
    expect(errors).toEqual([]);
    expect(video.play).toHaveBeenCalled();
    video.step();
    video.step();
    expect(frames).toHaveLength(2);
    expect(frames[0]!.landmarks).toHaveLength(33);
    expect(frames[1]!.t).toBeGreaterThan(frames[0]!.t);

    source.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mp.close).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    video.step();
    expect(frames).toHaveLength(2);
  });

  it('start is idempotent', async () => {
    const { stream } = fakeStream();
    const { source } = setup(async () => stream);
    const gum = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;
    await source.start();
    await source.start();
    expect(gum).toHaveBeenCalledTimes(1);
    source.stop();
  });

  it('reports camera-denied without throwing', async () => {
    const { source, errors } = setup(async () => {
      throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    });
    await expect(source.start()).resolves.toBeUndefined();
    expect(errors.map((e) => e.code)).toEqual(['camera-denied']);
  });

  it('reports camera-unavailable when there is no camera', async () => {
    const { source, errors } = setup(async () => {
      throw Object.assign(new Error('none'), { name: 'NotFoundError' });
    });
    await source.start();
    expect(errors.map((e) => e.code)).toEqual(['camera-unavailable']);
  });

  it('reports model-load-failed and releases the camera', async () => {
    mp.createFails = true;
    const { track, stream } = fakeStream();
    const { source, errors } = setup(async () => stream);
    await expect(source.start()).resolves.toBeUndefined();
    expect(errors.map((e) => e.code)).toEqual(['model-load-failed']);
    expect(track.stop).toHaveBeenCalled();
  });

  it('falls back to the CPU delegate when GPU creation fails', async () => {
    mp.gpuFails = true;
    const { stream } = fakeStream();
    const { source, errors } = setup(async () => stream);
    await source.start();
    expect(errors).toEqual([]);
    source.stop();
    mp.gpuFails = false;
  });

  it('reports a detection failure once and stops', async () => {
    const { stream } = fakeStream();
    const { video, source, errors } = setup(async () => stream);
    mp.detect.mockImplementation(() => {
      throw new Error('bad frame');
    });
    await source.start();
    video.step();
    video.step();
    expect(errors).toHaveLength(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    mp.detect.mockReset();
  });

  it('pins the WASM URL to the package version', async () => {
    const pkg = (await import('../../package.json')) as { default: { dependencies: Record<string, string> } };
    expect(pkg.default.dependencies['@mediapipe/tasks-vision']).toBe(MEDIAPIPE_VERSION);
    expect(DEFAULT_WASM_URL).toContain(`@${MEDIAPIPE_VERSION}/`);
  });

  it('calls onPoseLost with t and delivers no frame when no pose is found', async () => {
    const { stream } = fakeStream();
    const { video, source, frames, lost } = setup(async () => stream);
    mp.detect.mockReturnValueOnce({ landmarks: [pose] }).mockReturnValueOnce({ landmarks: [] });
    await source.start();
    video.step();
    video.step();
    expect(frames).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toBeGreaterThan(frames[0]!.t);
    source.stop();
  });
});

describe('public entry', () => {
  it('does not load @mediapipe/tasks-vision on import', async () => {
    vi.resetModules();
    const before = mp.loaded;
    await import('../index');
    expect(mp.loaded).toBe(before);
  });
});
