import { LM, type Frame } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { isReady, landmarksVisible } from './readiness';

const vis = (t: number, visible = true) => ({ t, visible });

describe('readiness (R3.4)', () => {
  it('is not ready with no samples or a short run', () => {
    expect(isReady([])).toBe(false);
    expect(isReady([vis(0), vis(500), vis(999)])).toBe(false);
  });

  it('is ready after one continuous second', () => {
    expect(isReady([vis(0), vis(500), vis(1000)])).toBe(true);
  });

  it('one invisible sample resets the run', () => {
    expect(isReady([vis(0), vis(400), vis(800, false), vis(1000), vis(1500)])).toBe(false);
    expect(isReady([vis(0), vis(400), vis(800, false), vis(1000), vis(1900), vis(2000)])).toBe(true);
  });

  it('is not ready when the latest sample is not visible', () => {
    expect(isReady([vis(0), vis(1000), vis(1500, false)])).toBe(false);
  });

  it('landmarksVisible checks every named landmark against minVisibility', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
    const frame: Frame = { t: 0, landmarks };
    expect(landmarksVisible(frame, ['leftHip', 'leftKnee'], 0.5)).toBe(true);
    landmarks[LM.leftKnee] = { x: 0, y: 0, z: 0, visibility: 0.2 };
    expect(landmarksVisible(frame, ['leftHip', 'leftKnee'], 0.5)).toBe(false);
  });
});
