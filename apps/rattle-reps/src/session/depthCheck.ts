import type { MarrowEvent } from 'marrow-core';
import { getWorkout } from '../movements/registry';

export const SHALLOW_RULE_ID = 'shallow-depth';

interface DepthRule {
  metric: string;
  /** A rep whose minimum is above this bound is shallow. */
  bound: number;
  message: string;
}

/**
 * The depth rule of a workout, read from its spec so the bound and message cannot drift from the
 * JSON. Only workouts with a `shallow-depth` rule and a `rom` entry sampled on `rep` for the same
 * metric have one (the squat and the push-up).
 */
export function depthRuleFor(workoutId: string): DepthRule | null {
  const spec = getWorkout(workoutId)?.spec;
  const rule = spec?.formRules?.find((r) => r.id === SHALLOW_RULE_ID);
  if (!spec || !rule || rule.max === undefined) return null;
  const sampled = (spec.rom ?? []).some((r) => r.metric === rule.metric && r.sampleOn === 'rep');
  return sampled ? { metric: rule.metric, bound: rule.max, message: rule.message } : null;
}

export interface DepthChecker {
  /** The event itself, followed by a synthesized `shallow-depth` warning when one is due. */
  push(event: MarrowEvent): MarrowEvent[];
}

/**
 * Incremental form of `withDepthWarnings`, for live sessions. At each `rom:sample` of the depth
 * metric whose `min` is above the bound, a `shallow-depth` warning is added unless the core already
 * warned inside the rep window `(previous rep t, this rep t]`.
 */
export function createDepthChecker(workoutId: string): DepthChecker {
  const rule = depthRuleFor(workoutId);
  let lastRepT = Number.NEGATIVE_INFINITY;
  let prevRepT = Number.NEGATIVE_INFINITY;
  let warningTs: number[] = [];

  return {
    push(event) {
      if (!rule) return [event];
      if (event.type === 'rep') {
        prevRepT = lastRepT;
        lastRepT = event.t;
        warningTs = warningTs.filter((t) => t > prevRepT);
      } else if (event.type === 'form:warning' && event.ruleId === SHALLOW_RULE_ID) {
        warningTs.push(event.t);
      } else if (
        event.type === 'rom:sample' &&
        event.metric === rule.metric &&
        event.trigger === 'rep' &&
        event.min > rule.bound
      ) {
        const warned = warningTs.some((t) => t > prevRepT && t <= event.t);
        if (!warned) {
          warningTs.push(event.t);
          const synthetic: MarrowEvent = {
            type: 'form:warning',
            t: event.t,
            ruleId: SHALLOW_RULE_ID,
            message: rule.message,
            value: event.min,
          };
          return [event, synthetic];
        }
      }
      return [event];
    },
  };
}

/** Add one `shallow-depth` warning per shallow rep window that the core did not warn in. */
export function withDepthWarnings(events: readonly MarrowEvent[], workoutId: string): MarrowEvent[] {
  const checker = createDepthChecker(workoutId);
  return events.flatMap((e) => checker.push(e));
}
