import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseMovementSpec } from 'marrow-core';
import { readRepoJson } from '../repo';
import { specErrors, type ToolError } from './validateMovement';

export type MovementInfo = {
  app: string;
  file: string;
  id?: string;
  name?: string;
  joints?: string[];
  phaseCount?: number;
  errors?: ToolError[];
};
export type ListResult = { ok: true; movements: MovementInfo[] } | { ok: false; error: string; validApps: string[] };

export function listApps(root: string): string[] {
  const dir = join(root, 'apps');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'src', 'movements')))
    .map((d) => d.name)
    .sort();
}

export function listMovements(args: { app?: string }, root: string): ListResult {
  const apps = listApps(root);
  if (args.app !== undefined && !apps.includes(args.app)) {
    return { ok: false, error: `unknown app "${args.app}". Valid apps: ${apps.join(', ')}`, validApps: apps };
  }
  const movements: MovementInfo[] = [];
  for (const app of args.app ? [args.app] : apps) {
    const dir = join('apps', app, 'src', 'movements');
    const files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      const file = `${dir}/${f}`;
      const loaded = readRepoJson(file, root);
      if (!loaded.ok) {
        movements.push({ app, file, errors: [{ pointer: '', path: '', message: loaded.message }] });
        continue;
      }
      const parsed = parseMovementSpec(loaded.value);
      if (!parsed.ok) {
        movements.push({ app, file, errors: specErrors(loaded.value) });
        continue;
      }
      const { spec } = parsed;
      const joints = [...new Set(Object.values(spec.metrics).flatMap((m) => m.points as string[]))].sort();
      movements.push({ app, file, id: spec.id, name: spec.name, joints, phaseCount: spec.phases.length });
    }
  }
  return { ok: true, movements };
}
