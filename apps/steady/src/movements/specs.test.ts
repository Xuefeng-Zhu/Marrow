import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMovementSpec } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { TESTS } from '../tests';

const files = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const entries = Object.entries(files).map(([path, json]) => ({
  name: path.replace(/^\.\//, '').replace(/\.json$/, ''),
  json,
}));

describe('movement specs', () => {
  it('has the seven expected spec files', () => {
    expect(entries.map((e) => e.name).sort()).toEqual([
      'chair-stand',
      'knee-flexion-left',
      'knee-flexion-right',
      'shoulder-flexion-left',
      'shoulder-flexion-right',
      'single-leg-stance-left',
      'single-leg-stance-right',
    ]);
  });

  it.each(entries)('$name passes parseMovementSpec and its id equals the file name', ({ name, json }) => {
    const r = parseMovementSpec(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.id).toBe(name);
  });

  it('maps every catalogue entry to a valid spec, with ids equal to the file names', () => {
    expect(TESTS.map((t) => t.id).sort()).toEqual(entries.map((e) => e.name).sort());
    for (const t of TESTS) expect(t.spec.id).toBe(t.id);
  });

  it("sets plane 'xy' on every shoulderAngle metric (shoulder plane review finding)", () => {
    const shoulder = entries.filter((e) => e.name.startsWith('shoulder-flexion-'));
    expect(shoulder).toHaveLength(2);
    for (const { json } of shoulder) {
      const spec = json as { metrics: Record<string, { kind: string; plane?: string }> };
      const angles = Object.entries(spec.metrics).filter(([name]) => name === 'shoulderAngle');
      expect(angles).toHaveLength(1);
      for (const [, metric] of angles) {
        expect(metric.kind).toBe('angle');
        expect(metric.plane).toBe('xy');
      }
    }
    // The parsed catalogue specs keep the plane too.
    for (const t of TESTS.filter((x) => x.family === 'shoulder-flexion')) {
      const m = t.spec.metrics['shoulderAngle'];
      expect(m && m.kind === 'angle' ? m.plane : undefined).toBe('xy');
    }
  });

  it('measures hip, shoulder, elbow of the chosen side for shoulder flexion', () => {
    for (const t of TESTS.filter((x) => x.family === 'shoulder-flexion')) {
      const m = t.spec.metrics['shoulderAngle'];
      expect(m && m.kind === 'angle' ? m.points : []).toEqual([`${t.side}Hip`, `${t.side}Shoulder`, `${t.side}Elbow`]);
    }
  });
});

describe('marrow-core imports (R1.8)', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = join(dir, d.name);
      if (d.isDirectory()) return sources(p);
      return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
    });
  }

  it('never imports a deep marrow-core path other than specs and fixtures data', () => {
    const files = sources(join(process.cwd(), 'src'));
    expect(files.length).toBeGreaterThan(3);
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]marrow-core\/([^'"]+)['"]/g)) {
        if (!/^(specs|fixtures)\/[\w.-]+\.json$/.test(m[1]!)) bad.push(`${f}: marrow-core/${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
