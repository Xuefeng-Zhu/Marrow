import { describe, expect, it } from 'vitest';
import { findRepoRoot } from '../repo';
import { listMovements } from './listMovements';
import { toPointer } from './pointer';
import { replayFixture } from './replayFixture';
import { validateMovement } from './validateMovement';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = findRepoRoot();
const ELBOW = 'packages/marrow-core/specs/elbow-cycle.json';
const ELBOW_FX = 'packages/marrow-core/fixtures/elbow-cycle-3reps.json';
const spec = () => JSON.parse(readFileSync(join(root, ELBOW), 'utf8'));

describe('toPointer', () => {
  it('converts issue paths', () => {
    expect(toPointer([])).toBe('');
    expect(toPointer(['phases', 1, 'min'])).toBe('/phases/1/min');
    expect(toPointer(['metrics', 'elbow', 'points', 0])).toBe('/metrics/elbow/points/0');
  });

  it('keeps dotted metric keys intact and escapes ~ and /', () => {
    expect(toPointer(['metrics', 'knee.angle', 'points', 0])).toBe('/metrics/knee.angle/points/0');
    expect(toPointer(['metrics', 'a~b/c'])).toBe('/metrics/a~0b~1c');
  });

  it('reports a dotted metric key pointer from validateMovement', () => {
    const s = spec();
    s.metrics = { 'knee.angle': { kind: 'angle', points: ['nope', 'leftKnee', 'leftAnkle'] } };
    const errs = validateMovement({ json: s }, root).errors;
    expect(errs.map((e) => e.pointer)).toContain('/metrics/knee.angle/points/0');
  });
});

describe('validate_movement', () => {
  it('accepts a valid spec by path, object and string', () => {
    expect(validateMovement({ path: ELBOW }, root)).toEqual({ valid: true, errors: [] });
    expect(validateMovement({ json: spec() }, root).valid).toBe(true);
    expect(validateMovement({ json: JSON.stringify(spec()) }, root).valid).toBe(true);
  });

  it('reports pointers for invalid specs', () => {
    const bad = spec();
    bad.phases[1].min = 'x';
    const r = validateMovement({ json: bad }, root);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatchObject({ pointer: '/phases/1/min', path: 'phases[1].min' });
    const rootBad = validateMovement({ json: 5 }, root);
    expect(rootBad.errors[0]!.pointer).toBe('');
  });

  it('requires exactly one of path or json', () => {
    expect(validateMovement({}, root).valid).toBe(false);
    expect(validateMovement({ path: ELBOW, json: spec() }, root).errors[0]!.message).toMatch(/exactly one/);
  });

  it('returns errors, not crashes, for bad text, missing files and outside paths', () => {
    expect(validateMovement({ json: '{nope' }, root).errors[0]!.message).toMatch(/invalid JSON/);
    expect(validateMovement({ path: 'nope.json' }, root).valid).toBe(false);
    expect(validateMovement({ path: '/etc/passwd' }, root).errors[0]!.message).toMatch(/outside the repo/);
  });
});

describe('replay_fixture', () => {
  it('counts 3 reps for the elbow cycle fixture', () => {
    const r = replayFixture({ movementPath: ELBOW, fixturePath: ELBOW_FX }, root);
    expect(r).toMatchObject({ ok: true, repCount: 3 });
    if (r.ok) expect(r.phases.length).toBeGreaterThan(0);
  });

  it('replays a rattle-reps fixture', () => {
    const r = replayFixture(
      { movementPath: 'apps/rattle-reps/src/movements/squat.json', fixturePath: 'apps/rattle-reps/src/fixtures/squat.json' },
      root,
    );
    expect(r.ok && r.repCount).toBeGreaterThan(0);
  });

  it('replays a steady clip with ROM samples', () => {
    const r = replayFixture(
      { movementPath: 'apps/steady/src/movements/chair-stand.json', fixturePath: 'apps/steady/src/clips/chair-stand.json' },
      root,
    );
    expect(r).toMatchObject({ ok: true, repCount: 11 });
  });

  it('surfaces form warnings and hold summaries', () => {
    const sq = replayFixture(
      { movementPath: 'apps/rattle-reps/src/movements/squat.json', fixturePath: 'apps/rattle-reps/src/fixtures/squat.json' },
      root,
    );
    expect(sq.ok && sq.warnings.length).toBeGreaterThan(0);
    if (sq.ok) expect(sq.warnings[0]).toHaveProperty('ruleId');
    const pl = replayFixture(
      { movementPath: 'apps/rattle-reps/src/movements/plank.json', fixturePath: 'apps/rattle-reps/src/fixtures/plank.json' },
      root,
    );
    expect(pl.ok && pl.holds.length).toBeGreaterThan(0);
  });

  it('returns validation errors with pointers instead of throwing', () => {
    const r = replayFixture({ movementPath: 'package.json', fixturePath: ELBOW_FX }, root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
    const bad = replayFixture({ movementPath: ELBOW, fixturePath: ELBOW }, root);
    expect(bad.ok).toBe(false);
  });

  it('refuses paths outside the repo', () => {
    const r = replayFixture({ movementPath: '../../etc/passwd', fixturePath: ELBOW_FX }, root);
    expect(r.ok).toBe(false);
  });
});

describe('list_movements', () => {
  it('lists all apps', () => {
    const r = listMovements({}, root);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(new Set(r.movements.map((m) => m.app))).toEqual(new Set(['rattle-reps', 'steady']));
      expect(r.movements.every((m) => !m.errors)).toBe(true);
      const sq = r.movements.find((m) => m.id === 'squat')!;
      expect(sq.joints).toEqual([...sq.joints!].sort());
      expect(sq.phaseCount).toBeGreaterThan(1);
    }
  });

  it('filters by app', () => {
    const r = listMovements({ app: 'steady' }, root);
    expect(r.ok && r.movements.every((m) => m.app === 'steady')).toBe(true);
  });

  it('errors on unknown app listing valid ones', () => {
    const r = listMovements({ app: 'nope' }, root);
    expect(r).toMatchObject({ ok: false, validApps: ['rattle-reps', 'steady'] });
  });
});
