// @vitest-environment node
/**
 * Movement spec tests.
 *
 * Sign convention of `offset` metrics, confirmed against packages/marrow-core/src/engine/metrics.ts
 * (read only): the value is `points[0][axis] - points[1][axis]`, divided by the torso length
 * (mid-shoulder to mid-hip). A `distance` metric is the 3D distance divided by the same length.
 * Image y grows downward, so `offset` on y is negative when the first point is above the second.
 * The lunge assumes the person faces towards +x (right), so a knee ahead of the ankle gives a
 * positive x offset.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMovementSpec } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { WORKOUTS, getWorkout } from './registry';

const dir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = fileURLToPath(new URL('..', import.meta.url));
const jsonFiles = readdirSync(dir).filter((f) => f.endsWith('.json'));
const IDS = ['squat', 'push-up', 'lunge', 'jumping-jack', 'plank'];

function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}${e.name}/`) : [`${d}${e.name}`],
  );
}

describe('movement spec files', () => {
  it('has exactly the five movement files', () => {
    expect([...jsonFiles].sort()).toEqual(IDS.map((id) => `${id}.json`).sort());
  });

  it.each(jsonFiles)('%s parses and its id equals the file name', (file) => {
    const result = parseMovementSpec(JSON.parse(readFileSync(`${dir}${file}`, 'utf8')));
    if (!result.ok) throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    expect(result.spec.id).toBe(file.replace(/\.json$/, ''));
  });

  it.each(jsonFiles)('%s has at least two form rules with messages of at most 40 characters', (file) => {
    const result = parseMovementSpec(JSON.parse(readFileSync(`${dir}${file}`, 'utf8')));
    if (!result.ok) throw new Error('invalid spec');
    const rules = result.spec.formRules ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const rule of rules) expect(rule.message.length).toBeLessThanOrEqual(40);
  });
});

const REQUIRED_RULES: Record<string, string[]> = {
  squat: ['knees-caving', 'shallow-depth'],
  'push-up': ['hips-sagging', 'shallow-depth'],
  lunge: ['knee-past-ankle', 'torso-lean'],
  'jumping-jack': ['arms-low', 'feet-narrow'],
  plank: ['hips-sagging', 'hips-piking'],
};

describe('registry', () => {
  it('lists the five workouts in order', () => {
    expect(WORKOUTS.map((w) => w.id)).toEqual(IDS);
  });

  it('getWorkout finds by id and returns undefined for unknown ids', () => {
    expect(getWorkout('squat')?.spec.id).toBe('squat');
    expect(getWorkout('nope')).toBeUndefined();
  });

  it.each(IDS)('%s has its required rules', (id) => {
    const ruleIds = (getWorkout(id)?.spec.formRules ?? []).map((r) => r.id);
    for (const required of REQUIRED_RULES[id]!) expect(ruleIds).toContain(required);
  });

  it.each(['squat', 'push-up'])('%s declares a rom entry sampled on rep for its depth metric', (id) => {
    const spec = getWorkout(id)!.spec;
    const depthRule = spec.formRules!.find((r) => r.id === 'shallow-depth')!;
    expect(spec.rom).toContainEqual({ metric: depthRule.metric, sampleOn: 'rep' });
  });

  it('the plank has a hold and is a hold workout; the others are rep workouts', () => {
    const plank = getWorkout('plank')!;
    expect(plank.spec.holds?.length).toBeGreaterThanOrEqual(1);
    expect(plank.kind).toBe('hold');
    expect(plank.holdId).toBe(plank.spec.holds![0]!.id);
    for (const id of ['squat', 'push-up', 'lunge', 'jumping-jack']) expect(getWorkout(id)!.kind).toBe('reps');
  });

  it('presentation data covers every phase of every spec', () => {
    for (const w of WORKOUTS) {
      for (const p of w.spec.phases) expect(w.phaseCues[p.id], `${w.id}:${p.id}`).toBeTruthy();
      expect(w.blurb.length).toBeGreaterThan(0);
      expect(w.cameraTip.length).toBeGreaterThan(0);
    }
  });

  it('the registry is the only importer of the movement JSON files', () => {
    const offenders = walk(srcDir)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !f.endsWith('registry.ts') && !f.endsWith('movements.test.ts'))
      .filter((f) => /movements\/[\w-]+\.json|from '\.\/(squat|push-up|lunge|jumping-jack|plank)\.json'/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
