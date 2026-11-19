import { describe, expect, it } from 'vitest';
import type { Frame, Landmark } from '../types';
import { POSE_CONNECTIONS } from './connections';
import { drawSkeleton, type SkeletonStyle } from './drawSkeleton';

const style: SkeletonStyle = { boneColor: '#fff', jointColor: '#f00', lineWidth: 3, jointRadius: 4, minVisibility: 0.5 };

function fakeCtx() {
  const calls = { moveTo: 0, lineTo: 0, stroke: 0, arc: 0, fill: 0 };
  const ctx = {
    canvas: { width: 200, height: 100 },
    lineWidth: 0,
    lineCap: '',
    strokeStyle: '',
    fillStyle: '',
    beginPath() {},
    moveTo() {
      calls.moveTo++;
    },
    lineTo() {
      calls.lineTo++;
    },
    stroke() {
      calls.stroke++;
    },
    arc() {
      calls.arc++;
    },
    fill() {
      calls.fill++;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
}

function frame(visibility: number): Frame {
  const lm: Landmark = { x: 0.5, y: 0.5, z: 0, visibility };
  return { t: 0, landmarks: Array.from({ length: 33 }, () => ({ ...lm })) };
}

describe('POSE_CONNECTIONS', () => {
  it('only references valid landmark indices', () => {
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(33);
      expect(a).not.toBe(b);
    }
  });
});

describe('drawSkeleton', () => {
  it('draws every bone and joint when all are visible', () => {
    const { ctx, calls, raw } = fakeCtx();
    drawSkeleton(ctx, frame(1), style);
    expect(calls.stroke).toBe(POSE_CONNECTIONS.length);
    expect(calls.arc).toBe(33);
    expect(calls.fill).toBe(33);
    expect(raw.lineWidth).toBe(3);
    expect(raw.strokeStyle).toBe('#fff');
    expect(raw.fillStyle).toBe('#f00');
  });

  it('skips landmarks below minVisibility and the bones that touch them', () => {
    const { ctx, calls } = fakeCtx();
    drawSkeleton(ctx, frame(0.2), style);
    expect(calls.stroke).toBe(0);
    expect(calls.arc).toBe(0);

    const f = frame(1);
    f.landmarks[15]!.visibility = 0.1; // leftWrist
    const second = fakeCtx();
    drawSkeleton(second.ctx, f, style);
    const touching = POSE_CONNECTIONS.filter(([a, b]) => a === 15 || b === 15).length;
    expect(second.calls.stroke).toBe(POSE_CONNECTIONS.length - touching);
    expect(second.calls.arc).toBe(32);
  });

  it('defaults minVisibility to 0.5', () => {
    const { ctx, calls } = fakeCtx();
    const { minVisibility: _unused, ...rest } = style;
    drawSkeleton(ctx, frame(0.4), rest);
    expect(calls.arc).toBe(0);
  });

  it('scales normalised coordinates by the canvas size', () => {
    const pts: Array<[number, number]> = [];
    const { ctx, raw } = fakeCtx();
    (raw as { arc: (x: number, y: number) => void }).arc = (x, y) => pts.push([x, y]);
    drawSkeleton(ctx, frame(1), style);
    expect(pts[0]).toEqual([100, 50]);
  });

  it('does not throw on an empty frame and draws nothing', () => {
    const { ctx, calls } = fakeCtx();
    expect(() => drawSkeleton(ctx, { t: 0, landmarks: [] }, style)).not.toThrow();
    expect(calls).toEqual({ moveTo: 0, lineTo: 0, stroke: 0, arc: 0, fill: 0 });
  });
});
