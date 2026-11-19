import { MovementSpecSchema, type MovementSpec } from './schema';

export type SpecIssue = { path: string; message: string };

export type ParseResult = { ok: true; spec: MovementSpec } | { ok: false; issues: SpecIssue[] };

/** Format a zod issue path as `phases[1].min`. The root is the empty string. */
function formatPath(path: (string | number)[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out === '' ? seg : `.${seg}`;
  }
  return out;
}

/** Validate unknown JSON as a movement spec. Never throws for invalid input. */
export function parseMovementSpec(json: unknown): ParseResult {
  const result = MovementSpecSchema.safeParse(json);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
  };
}
