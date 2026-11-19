import fc from 'fast-check';
import type { MovementSpec } from '../spec/schema';

/** Test-only generators. Not exported from the public entry. */

/** The one angle metric used by generated specs. */
export const SPEC_METRIC = 'm0';
export const SPEC_METRIC_POINTS = ['leftShoulder', 'leftElbow', 'leftWrist'] as const;

/**
 * A valid single-metric angle spec as plain JSON input (defaults not yet applied).
 * Phases have disjoint ranges in 0..180 (widths 20 to 40, gaps 0 to 5), listed in a random
 * array order, with hysteresis 0 to 5 degrees. Values are integers, so JSON round trips
 * are exact.
 */
export const arbSpecJson: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    widths: fc.array(fc.integer({ min: 20, max: 40 }), { minLength: 2, maxLength: 4 }),
    gaps: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 4, maxLength: 4 }),
    hysteresis: fc.integer({ min: 0, max: 5 }),
    minRepMs: fc.integer({ min: 0, max: 500 }),
    minVisibility: fc.constantFrom(0.3, 0.5, 0.8),
    withExtras: fc.boolean(),
  })
  .chain((r) => {
    let at = 0;
    const bands = r.widths.map((w, i) => {
      const min = at;
      at += w + (r.gaps[i] ?? 0);
      return { min, max: min + w };
    });
    return fc.shuffledSubarray(bands, { minLength: bands.length, maxLength: bands.length }).map((order) => {
      const phases = order.map((b, i) => ({ id: `p${i}`, metric: SPEC_METRIC, ...b }));
      const spec: Record<string, unknown> = {
        version: 1,
        id: 'generated',
        name: 'Generated',
        minVisibility: r.minVisibility,
        hysteresis: r.hysteresis,
        minRepMs: r.minRepMs,
        metrics: { [SPEC_METRIC]: { kind: 'angle', points: [...SPEC_METRIC_POINTS] } },
        phases,
      };
      if (r.withExtras) {
        spec.metrics = {
          ...(spec.metrics as object),
          d0: { kind: 'distance', points: ['leftWrist', 'leftHip'] },
          o0: { kind: 'offset', points: ['leftElbow', 'leftHip'], axis: 'x' },
        };
        spec.holds = [{ id: 'h0', phase: 'p0', minMs: 500, tickMs: 250 }];
        spec.formRules = [
          { id: 'f0', metric: 'o0', max: 0.3, phases: ['p1'], debounceMs: 200, message: 'Careful' },
        ];
        spec.rom = [{ metric: SPEC_METRIC, sampleOn: 'rep' }];
      }
      return spec;
    });
  });

export type GeneratedSpec = MovementSpec;
