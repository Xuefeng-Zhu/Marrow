/** The minimal spec shape needed to look up a hysteresis margin. */
export type HysteresisSource = {
  hysteresis: number;
  normHysteresis: number;
  metrics: Record<string, { kind: 'angle' | 'distance' | 'offset' }>;
};

/**
 * Hysteresis for a named metric, in that metric's unit: `hysteresis` (degrees) for
 * angle metrics, `normHysteresis` (fraction of torso length) for distance and offset.
 * Returns 0 for an unknown metric name.
 */
export function metricHysteresis(spec: HysteresisSource, metric: string): number {
  if (!Object.prototype.hasOwnProperty.call(spec.metrics, metric)) return 0;
  return spec.metrics[metric]!.kind === 'angle' ? spec.hysteresis : spec.normHysteresis;
}
