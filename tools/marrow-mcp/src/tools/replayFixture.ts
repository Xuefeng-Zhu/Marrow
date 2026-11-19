import { createEngine, parseMovementSpec, parseFixture, replay, FixtureError } from 'marrow-core';
import { readRepoJson } from '../repo';
import { specErrors, type ToolError } from './validateMovement';

export type ReplayResult =
  | {
      ok: true;
      repCount: number;
      phases: { t: number; from: string | null; to: string }[];
      rom: { metric: string; min: number; max: number; trigger: string; t: number }[];
      warnings: { t: number; ruleId: string; message: string; value: number }[];
      holds: { holdId: string; durationMs: number; reason: string; t: number }[];
    }
  | { ok: false; errors: ToolError[] };

const fail = (path: string, message: string): ReplayResult => ({
  ok: false,
  errors: [{ pointer: '', path, message }],
});

function parseSpec(v: unknown) {
  const r = parseMovementSpec(v);
  if (!r.ok) throw new Error('unreachable: spec already validated');
  return r.spec;
}

export function replayFixture(args: { movementPath: string; fixturePath: string }, root: string): ReplayResult {
  const s = readRepoJson(args.movementPath, root);
  if (!s.ok) return fail('movementPath', s.message);
  const f = readRepoJson(args.fixturePath, root);
  if (!f.ok) return fail('fixturePath', f.message);

  const errs = specErrors(s.value);
  if (errs.length > 0) return { ok: false, errors: errs };
  let fixture;
  try {
    fixture = parseFixture(f.value);
  } catch (e) {
    return fail('fixturePath', e instanceof FixtureError ? e.message : String(e));
  }
  const parsed = parseSpec(s.value);
  const engine = createEngine(parsed);
  const out: Extract<ReplayResult, { ok: true }> = {
    ok: true,
    repCount: 0,
    phases: [],
    rom: [],
    warnings: [],
    holds: [],
  };
  for (const frame of replay(fixture)) {
    for (const ev of engine.push(frame)) {
      if (ev.type === 'rep') out.repCount = ev.count;
      else if (ev.type === 'phase') out.phases.push({ t: ev.t, from: ev.from, to: ev.to });
      else if (ev.type === 'rom:sample')
        out.rom.push({ metric: ev.metric, min: ev.min, max: ev.max, trigger: ev.trigger, t: ev.t });
      else if (ev.type === 'form:warning')
        out.warnings.push({ t: ev.t, ruleId: ev.ruleId, message: ev.message, value: ev.value });
      else if (ev.type === 'hold:end')
        out.holds.push({ holdId: ev.holdId, durationMs: ev.durationMs, reason: ev.reason, t: ev.t });
    }
  }
  return out;
}
