import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine, parseFixture, replay, type MarrowEvent } from 'marrow-core';
import { describe, expect, it } from 'vitest';
import { generateClip, serializeClip } from '../../scripts/make-clips.ts';
import { TEST_BY_ID, TESTS } from '../tests';
import { CLIP_IDS, OUTCOMES, type CountOutcome, type RomOutcome, type StanceOutcome } from './outcomes';

function committed(id: string): string {
  return readFileSync(join(process.cwd(), 'src', 'clips', `${id}.json`), 'utf8');
}

function run(id: (typeof CLIP_IDS)[number]): MarrowEvent[] {
  const test = TEST_BY_ID[id];
  const engine = createEngine(test.spec);
  const events: MarrowEvent[] = [];
  for (const frame of replay(test.clip)) events.push(...engine.push(frame));
  return events;
}

describe('demo clips (R13.1, R13.2)', () => {
  it('covers every test', () => {
    expect([...CLIP_IDS].sort()).toEqual(TESTS.map((t) => t.id).sort());
  });

  it.each(CLIP_IDS)('%s passes parseFixture and is attached to its catalogue entry', (id) => {
    const fx = parseFixture(JSON.parse(committed(id)));
    expect(fx.id).toBe(id);
    expect(TEST_BY_ID[id].clip).toEqual(fx);
  });

  it.each(CLIP_IDS)('%s is reproduced exactly by the generator', (id) => {
    expect(serializeClip(generateClip(id))).toBe(committed(id));
  });

  it.each(CLIP_IDS)('%s stays under 400 KB', (id) => {
    expect(Buffer.byteLength(committed(id))).toBeLessThan(400 * 1024);
  });
});

describe('replaying each clip through the engine gives the designed outcome (R13.4)', () => {
  const rom = CLIP_IDS.filter((id) => OUTCOMES[id].kind === 'rom-peak');

  it.each(rom)('%s: three reps and the designed peaks', (id) => {
    const o = OUTCOMES[id] as RomOutcome;
    const test = TEST_BY_ID[id];
    const events = run(id);
    expect(events.filter((e) => e.type === 'rep')).toHaveLength(3);
    const samples = events.filter(
      (e): e is Extract<MarrowEvent, { type: 'rom:sample' }> => e.type === 'rom:sample' && e.metric === test.metric,
    );
    // The first sample is the resting pose at the start of the clip. The next three follow each rep.
    expect(samples).toHaveLength(4);
    const flexion = samples.slice(1).map((s) => (test.romEdge === 'min' ? 180 - s.min : s.max));
    flexion.forEach((v, i) => expect(Math.abs(v - o.peaks[i]!)).toBeLessThanOrEqual(o.toleranceDeg));
    expect(Math.abs(Math.max(...flexion) - o.result)).toBeLessThanOrEqual(o.toleranceDeg);
  });

  it('chair-stand: the designed number of stands, all inside the 30 s window', () => {
    const o = OUTCOMES['chair-stand'] as CountOutcome;
    const reps = run('chair-stand').filter((e) => e.type === 'rep');
    expect(reps).toHaveLength(o.stands);
    expect(reps.every((e) => e.t <= o.windowMs)).toBe(true);
    expect(TEST_BY_ID['chair-stand'].clip.frames.at(-1)!.t).toBeGreaterThan(o.windowMs);
  });

  it('single-leg-stance-left: foot-down stop at the designed time, no sway warning', () => {
    const o = OUTCOMES['single-leg-stance-left'] as StanceOutcome;
    const events = run('single-leg-stance-left');
    const start = events.find((e) => e.type === 'hold:start');
    const end = events.find((e) => e.type === 'hold:end');
    expect(start?.t).toBe(o.liftMs);
    expect(end?.type === 'hold:end' && end.reason).toBe(o.reason);
    expect(end?.t).toBe(o.footDownMs);
    expect(Math.abs((end!.t - start!.t) / 1000 - o.seconds)).toBeLessThanOrEqual(0.1);
    expect(events.some((e) => e.type === 'form:warning')).toBe(false);
  });

  it('single-leg-stance-right: sway warning at the designed time while the foot stays up', () => {
    const o = OUTCOMES['single-leg-stance-right'] as StanceOutcome;
    const events = run('single-leg-stance-right');
    const start = events.find((e) => e.type === 'hold:start');
    const warnings = events.filter((e) => e.type === 'form:warning');
    expect(start?.t).toBe(o.liftMs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.type === 'form:warning' && warnings[0]!.ruleId).toBe('sway-limit');
    expect(warnings[0]!.t).toBe(o.warningMs);
    expect(Math.abs((warnings[0]!.t - start!.t) / 1000 - o.seconds)).toBeLessThanOrEqual(0.1);
    expect(events.some((e) => e.type === 'hold:end')).toBe(false);
  });

  it('the two stance clips cover one foot-down stop and one sway stop (R13.5)', () => {
    const reasons = (['single-leg-stance-left', 'single-leg-stance-right'] as const).map((id) => OUTCOMES[id]);
    expect(reasons.map((o) => (o.kind === 'seconds' ? o.reason : null)).sort()).toEqual(['released', 'sway']);
  });
});
