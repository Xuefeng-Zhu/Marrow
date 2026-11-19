import type { Frame } from '../types';
import { POSE_CONNECTIONS } from './connections';

/** Caller-supplied look of the skeleton. The core hard-codes no theme. */
export type SkeletonStyle = {
  /** Stroke colour of the bones (any CSS colour). */
  boneColor: string;
  /** Fill colour of the joints. */
  jointColor: string;
  /** Bone width in canvas pixels. */
  lineWidth: number;
  /** Joint radius in canvas pixels. */
  jointRadius: number;
  /** Landmarks with lower visibility are skipped, and so are bones touching them. Default 0.5. */
  minVisibility?: number;
};

/**
 * Draw a frame's skeleton onto a canvas. Landmarks are normalised, so they are scaled by the
 * canvas size. An empty frame draws nothing and does not throw.
 */
export function drawSkeleton(ctx: CanvasRenderingContext2D, frame: Frame, style: SkeletonStyle): void {
  const lms = frame.landmarks;
  if (lms.length === 0) return;
  const min = style.minVisibility ?? 0.5;
  const { width, height } = ctx.canvas;
  const visible = (i: number): boolean => {
    const p = lms[i];
    return p !== undefined && p.visibility >= min;
  };

  ctx.lineWidth = style.lineWidth;
  ctx.lineCap = 'round';
  ctx.strokeStyle = style.boneColor;
  for (const [a, b] of POSE_CONNECTIONS) {
    if (!visible(a) || !visible(b)) continue;
    const pa = lms[a]!;
    const pb = lms[b]!;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = style.jointColor;
  for (let i = 0; i < lms.length; i++) {
    if (!visible(i)) continue;
    const p = lms[i]!;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, style.jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
