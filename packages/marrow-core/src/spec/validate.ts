import type { z } from 'zod';
import { metricHysteresis } from './hysteresis';
import type { MovementSpec } from './schema';

type Ctx = z.RefinementCtx;

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** An interval with open or closed ends, used for the exact reachability check. */
export type Interval = { lo: number; hi: number; loOpen: boolean; hiOpen: boolean };

function isNonEmpty(i: Interval): boolean {
  return i.lo < i.hi || (i.lo === i.hi && !i.loOpen && !i.hiOpen);
}

/** Subtract the closed interval [a, b] from each interval in the list. */
export function subtractClosed(list: Interval[], a: number, b: number): Interval[] {
  const out: Interval[] = [];
  for (const i of list) {
    // Part below a.
    const left: Interval = { ...i };
    if (a < left.hi) {
      left.hi = a;
      left.hiOpen = true;
    } else if (a === left.hi) {
      left.hiOpen = true;
    }
    if (isNonEmpty(left)) out.push(left);
    // Part above b.
    const right: Interval = { ...i };
    if (b > right.lo) {
      right.lo = b;
      right.loOpen = true;
    } else if (b === right.lo) {
      right.loOpen = true;
    }
    if (isNonEmpty(right)) out.push(right);
  }
  return out;
}

/** Cross-reference, hysteresis and reachability checks (R5.6 to R5.8, R6d.4). */
export function validateSpec(spec: MovementSpec, ctx: Ctx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  const phaseIds = new Set<string>();
  spec.phases.forEach((p, i) => {
    if (phaseIds.has(p.id)) issue(['phases', i, 'id'], `duplicate phase id "${p.id}"`);
    phaseIds.add(p.id);
    if (p.min > p.max) issue(['phases', i], `min (${p.min}) must be less than or equal to max (${p.max})`);
    if (!has(spec.metrics, p.metric)) issue(['phases', i, 'metric'], `unknown metric "${p.metric}"`);
  });

  // Hysteresis must leave every phase reachable on its own (R5.8).
  const hysteresisOk: boolean[] = spec.phases.map((p, i) => {
    if (!has(spec.metrics, p.metric) || p.min > p.max) return false;
    const h = metricHysteresis(spec, p.metric);
    if (h > (p.max - p.min) / 2) {
      issue(
        ['phases', i],
        `hysteresis ${h} is greater than half of the phase width ${p.max - p.min}, so phase "${p.id}" would be unreachable`,
      );
      return false;
    }
    return true;
  });

  // Reachability between phases that share a metric, with first-match shadowing.
  spec.phases.forEach((q, j) => {
    if (!hysteresisOk[j]) return;
    const h = metricHysteresis(spec, q.metric);
    spec.phases.forEach((p, i) => {
      if (i === j || p.metric !== q.metric || !hysteresisOk[i]) return;
      let rest: Interval[] = [{ lo: q.min + h, hi: q.max - h, loOpen: false, hiOpen: false }];
      rest = subtractClosed(rest, p.min - h, p.max + h);
      for (let k = 0; k < j && rest.length > 0; k++) {
        const e = spec.phases[k]!;
        if (k === i || e.metric !== q.metric || !hysteresisOk[k]) continue;
        rest = subtractClosed(rest, e.min + h, e.max - h);
      }
      if (rest.length === 0) {
        issue(
          ['phases', j],
          `phase "${q.id}" can never be entered from phase "${p.id}": its entry band is covered by the retention band of "${p.id}" or the entry bands of earlier phases`,
        );
      }
    });
  });

  const holdIds = new Set<string>();
  (spec.holds ?? []).forEach((hd, i) => {
    if (holdIds.has(hd.id)) issue(['holds', i, 'id'], `duplicate hold id "${hd.id}"`);
    holdIds.add(hd.id);
    if (!phaseIds.has(hd.phase)) issue(['holds', i, 'phase'], `unknown phase "${hd.phase}"`);
  });

  const ruleIds = new Set<string>();
  (spec.formRules ?? []).forEach((r, i) => {
    if (ruleIds.has(r.id)) issue(['formRules', i, 'id'], `duplicate form rule id "${r.id}"`);
    ruleIds.add(r.id);
    if (!has(spec.metrics, r.metric)) {
      issue(['formRules', i, 'metric'], `unknown metric "${r.metric}"`);
    } else if (r.min === undefined && r.max === undefined) {
      issue(['formRules', i], 'a form rule needs a min, a max, or both');
    } else if (r.min !== undefined && r.max !== undefined && r.min > r.max) {
      issue(['formRules', i], `min (${r.min}) must be less than or equal to max (${r.max})`);
    } else {
      const h = r.hysteresis ?? metricHysteresis(spec, r.metric);
      if (r.min !== undefined && r.max !== undefined && r.max - h < r.min + h) {
        issue(
          ['formRules', i],
          `hysteresis ${h} leaves no clearable value between min ${r.min} and max ${r.max}`,
        );
      }
    }
    (r.phases ?? []).forEach((id, k) => {
      if (!phaseIds.has(id)) issue(['formRules', i, 'phases', k], `unknown phase "${id}"`);
    });
  });

  (spec.rom ?? []).forEach((r, i) => {
    if (!has(spec.metrics, r.metric)) issue(['rom', i, 'metric'], `unknown metric "${r.metric}"`);
    if (r.sampleOn.startsWith('phase:')) {
      const id = r.sampleOn.slice('phase:'.length);
      if (!phaseIds.has(id)) issue(['rom', i, 'sampleOn'], `unknown phase "${id}"`);
    }
  });
}
