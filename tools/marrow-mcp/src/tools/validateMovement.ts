import { parseMovementSpec } from 'marrow-core';
import { readRepoJson } from '../repo';
import { toPointer } from './pointer';

export type ToolError = { pointer: string; path: string; message: string };
export type ValidateResult = { valid: boolean; errors: ToolError[] };

export function specErrors(json: unknown): ToolError[] {
  const r = parseMovementSpec(json);
  return r.ok ? [] : r.issues.map((i) => ({ pointer: toPointer(i.path), path: i.path, message: i.message }));
}

const fail = (message: string): ValidateResult => ({ valid: false, errors: [{ pointer: '', path: '', message }] });

/** Exactly one of `path` or `json` is required. Never throws. */
export function validateMovement(args: { path?: string; json?: unknown }, root: string): ValidateResult {
  const hasPath = args.path !== undefined;
  const hasJson = args.json !== undefined;
  if (hasPath === hasJson) return fail('provide exactly one of "path" or "json"');
  let value: unknown;
  if (hasPath) {
    const loaded = readRepoJson(args.path!, root);
    if (!loaded.ok) return fail(loaded.message);
    value = loaded.value;
  } else if (typeof args.json === 'string') {
    try {
      value = JSON.parse(args.json);
    } catch (e) {
      return fail(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    value = args.json;
  }
  const errors = specErrors(value);
  return { valid: errors.length === 0, errors };
}
