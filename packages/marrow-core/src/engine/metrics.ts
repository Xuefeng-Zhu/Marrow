import { angleAt, bodyScale, distance } from '../geometry';
import { LM } from '../landmarks';
import type { MovementSpec } from '../spec/schema';
import type { Frame, Landmark } from '../types';

export type MetricValues = Record<string, number>;

const TORSO = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip] as const;

function visible(l: Landmark | undefined, minVisibility: number): l is Landmark {
  return l !== undefined && l.visibility >= minVisibility;
}

/**
 * Evaluate every metric of a spec for one frame.
 *
 * - `angle`: degrees, 3D unless the metric sets `plane: "xy"`.
 * - `distance`: 3D distance divided by `bodyScale(frame)`.
 * - `offset`: `points[0] - points[1]` along the axis, divided by `bodyScale(frame)`.
 *
 * A metric is `NaN` when any landmark it uses is missing or below `minVisibility`, when
 * the result is not finite, and, for `distance` and `offset`, when any torso landmark
 * used by `bodyScale` is below `minVisibility` or the torso length is zero.
 */
export function evaluateMetrics(
  spec: Pick<MovementSpec, 'metrics' | 'minVisibility'>,
  frame: Frame,
): MetricValues {
  const out: MetricValues = {};
  let scale: number | undefined;
  const torsoScale = (): number => {
    if (scale === undefined) {
      const ok = TORSO.every((i) => visible(frame.landmarks[i], spec.minVisibility));
      const s = ok ? bodyScale(frame) : NaN;
      scale = Number.isFinite(s) && s > 0 ? s : NaN;
    }
    return scale;
  };

  for (const [name, metric] of Object.entries(spec.metrics)) {
    const pts = metric.points.map((n) => frame.landmarks[LM[n]]);
    if (!pts.every((p) => visible(p, spec.minVisibility))) {
      out[name] = NaN;
      continue;
    }
    let value: number;
    if (metric.kind === 'angle') {
      value = angleAt(pts[0]!, pts[1]!, pts[2]!, metric.plane ?? 'xyz');
    } else if (metric.kind === 'distance') {
      value = distance(pts[0]!, pts[1]!) / torsoScale();
    } else {
      value = (pts[0]![metric.axis] - pts[1]![metric.axis]) / torsoScale();
    }
    out[name] = Number.isFinite(value) ? value : NaN;
  }
  return out;
}
