/// <reference types="vite/client" />
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbSpecJson } from '../testing/arbitraries';
import { parseMovementSpec } from './parse';

const RUNS = { numRuns: 100 };

function base(): Record<string, any> {
  return {
    version: 1,
    id: 'test-spec',
    name: 'Test',
    metrics: {
      a: { kind: 'angle', points: ['leftShoulder', 'leftElbow', 'leftWrist'] },
      d: { kind: 'distance', points: ['leftWrist', 'leftHip'] },
      o: { kind: 'offset', points: ['leftElbow', 'leftHip'], axis: 'x' },
    },
    phases: [
      { id: 'up', metric: 'a', min: 150, max: 180 },
      { id: 'down', metric: 'a', min: 30, max: 70 },
    ],
  };
}

function issuesOf(json: unknown) {
  const r = parseMovementSpec(json);
  if (r.ok) throw new Error('expected the spec to be rejected');
  return r.issues;
}

function expectIssue(json: unknown, path: string, text?: string) {
  const issues = issuesOf(json);
  const hit = issues.find((i) => i.path === path && (text === undefined || i.message.includes(text)));
  expect(hit, JSON.stringify(issues)).toBeDefined();
}

describe('parseMovementSpec: accepted specs', () => {
  it('accepts a minimal spec and applies defaults', () => {
    const r = parseMovementSpec(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.minVisibility).toBe(0.5);
    expect(r.spec.hysteresis).toBe(5);
    expect(r.spec.normHysteresis).toBe(0.05);
    expect(r.spec.minRepMs).toBe(0);
    expect(r.spec.holdGapMs).toBe(500);
  });

  it('validates every file in specs/', () => {
    const files = import.meta.glob('../../specs/*.json', { eager: true, import: 'default' });
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(1);
    for (const [file, json] of Object.entries(files)) {
      const r = parseMovementSpec(json);
      expect(r.ok, `${file}: ${JSON.stringify(r.ok ? [] : r.issues)}`).toBe(true);
    }
  });
});

describe('parseMovementSpec: rejection rules (R5)', () => {
  it('rejects non-objects and returns a list of issues without throwing', () => {
    for (const v of [null, 1, 'x', [], undefined]) {
      expect(issuesOf(v).length).toBeGreaterThan(0);
    }
  });

  it('rejects a wrong version', () => {
    const s = base();
    s.version = 2;
    expectIssue(s, 'version');
  });

  it('rejects missing required fields', () => {
    for (const key of ['id', 'name', 'metrics', 'phases']) {
      const s = base();
      delete s[key];
      expectIssue(s, key);
    }
  });

  it('rejects unknown top-level keys (R5.9)', () => {
    const s = base();
    s.hystersis = 4;
    expect(issuesOf(s).length).toBeGreaterThan(0);
  });

  it('rejects unknown keys inside nested objects', () => {
    const s = base();
    s.phases[0].extra = 1;
    expect(issuesOf(s).length).toBeGreaterThan(0);
    const m = base();
    m.metrics.a.extra = 1;
    expect(issuesOf(m).length).toBeGreaterThan(0);
  });

  it('rejects a non-slug id', () => {
    const s = base();
    s.id = 'Not A Slug';
    expectIssue(s, 'id');
  });

  it('rejects fewer than two phases', () => {
    const s = base();
    s.phases = [s.phases[0]];
    expectIssue(s, 'phases');
  });

  it('rejects an unknown landmark name (R5.5)', () => {
    const s = base();
    s.metrics.a.points[1] = 'leftKnuckle';
    expectIssue(s, 'metrics.a.points[1]');
  });

  it('rejects wrong point counts and unknown kinds (R5.4)', () => {
    const s = base();
    s.metrics.d.points = ['leftWrist'];
    expect(issuesOf(s).length).toBeGreaterThan(0);
    const t = base();
    t.metrics.a.kind = 'curl';
    expect(issuesOf(t).length).toBeGreaterThan(0);
  });

  it('rejects an offset metric without a valid axis', () => {
    const s = base();
    delete s.metrics.o.axis;
    expect(issuesOf(s).length).toBeGreaterThan(0);
    const t = base();
    t.metrics.o.axis = 'z';
    expect(issuesOf(t).length).toBeGreaterThan(0);
  });

  it('rejects a bad angle plane', () => {
    const s = base();
    s.metrics.a.plane = 'yz';
    expect(issuesOf(s).length).toBeGreaterThan(0);
  });

  it('accepts the xy plane', () => {
    const s = base();
    s.metrics.a.plane = 'xy';
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('rejects a phase whose min exceeds max (R5.6)', () => {
    const s = base();
    s.phases[1] = { id: 'down', metric: 'a', min: 70, max: 30 };
    expectIssue(s, 'phases[1]', 'min');
  });

  it('rejects duplicate phase ids (R5.7)', () => {
    const s = base();
    s.phases[1].id = 'up';
    expectIssue(s, 'phases[1].id', 'duplicate');
  });

  it('rejects a phase that names an unknown metric', () => {
    const s = base();
    s.phases[0].metric = 'nope';
    expectIssue(s, 'phases[0].metric');
  });

  it('rejects a hold that names an unknown phase', () => {
    const s = base();
    s.holds = [{ id: 'h', phase: 'nope', minMs: 100, tickMs: 50 }];
    expectIssue(s, 'holds[0].phase');
  });

  it('rejects a form rule with an unknown metric or phase', () => {
    const s = base();
    s.formRules = [{ id: 'f', metric: 'nope', max: 1, debounceMs: 0, message: 'm' }];
    expectIssue(s, 'formRules[0].metric');
    const t = base();
    t.formRules = [{ id: 'f', metric: 'o', max: 1, phases: ['nope'], debounceMs: 0, message: 'm' }];
    expectIssue(t, 'formRules[0].phases[0]');
  });

  it('rejects a form rule with neither min nor max', () => {
    const s = base();
    s.formRules = [{ id: 'f', metric: 'o', debounceMs: 0, message: 'm' }];
    expectIssue(s, 'formRules[0]');
  });

  it('rejects a rom entry with an unknown metric or phase', () => {
    const s = base();
    s.rom = [{ metric: 'nope', sampleOn: 'rep' }];
    expectIssue(s, 'rom[0].metric');
    const t = base();
    t.rom = [{ metric: 'a', sampleOn: 'phase:nope' }];
    expectIssue(t, 'rom[0].sampleOn');
    const u = base();
    u.rom = [{ metric: 'a', sampleOn: 'sometimes' }];
    expect(issuesOf(u).length).toBeGreaterThan(0);
  });

  it('accepts rom triggers on rep, hold:end and a known phase', () => {
    const s = base();
    s.rom = [
      { metric: 'a', sampleOn: 'rep' },
      { metric: 'a', sampleOn: 'hold:end' },
      { metric: 'a', sampleOn: 'phase:down' },
    ];
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('rejects negative hysteresis values (R5.8)', () => {
    const s = base();
    s.hysteresis = -1;
    expectIssue(s, 'hysteresis');
    const t = base();
    t.normHysteresis = -0.1;
    expectIssue(t, 'normHysteresis');
  });

  it('rejects hysteresis greater than half the phase width (angle)', () => {
    const s = base();
    s.hysteresis = 16; // narrowest phase is 30 wide, limit is 15
    expectIssue(s, 'phases[0]', 'half');
    s.hysteresis = 15;
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('applies normHysteresis to distance phases and hysteresis to angle phases', () => {
    const s = base();
    s.phases = [
      { id: 'near', metric: 'd', min: 0.25, max: 0.75 },
      { id: 'far', metric: 'd', min: 1.25, max: 1.75 },
    ];
    s.hysteresis = 50; // irrelevant: no angle phases
    s.normHysteresis = 0.25;
    expect(parseMovementSpec(s).ok).toBe(true);
    s.normHysteresis = 0.26;
    expectIssue(s, 'phases[0]', 'half');
  });

  it('rejects hysteresis that applies to an offset phase', () => {
    const s = base();
    s.phases = [
      { id: 'left', metric: 'o', min: -0.4, max: -0.2 },
      { id: 'right', metric: 'o', min: 0.2, max: 0.4 },
    ];
    s.normHysteresis = 0.2;
    expectIssue(s, 'phases[0]', 'half');
  });

  it('rejects two phases with the same range on one metric (reachability)', () => {
    const s = base();
    s.phases = [
      { id: 'one', metric: 'a', min: 30, max: 70 },
      { id: 'two', metric: 'a', min: 30, max: 70 },
    ];
    expectIssue(s, 'phases[1]', '"one"');
  });

  it('rejects a phase whose entry band lies inside another phase retention band', () => {
    const s = base();
    s.hysteresis = 5;
    s.phases = [
      { id: 'wide', metric: 'a', min: 0, max: 100 },
      { id: 'inner', metric: 'a', min: 40, max: 80 },
    ];
    expectIssue(s, 'phases[1]', '"wide"');
  });

  it('rejects a phase shadowed by earlier phases and a retention band (first-match)', () => {
    const s = base();
    s.hysteresis = 5;
    s.phases = [
      { id: 'P', metric: 'a', min: 0, max: 100 },
      { id: 'S', metric: 'a', min: 80, max: 180 },
      { id: 'Q', metric: 'a', min: 40, max: 140 },
    ];
    expectIssue(s, 'phases[2]', '"P"');
  });

  it('accepts overlapping phases that are still reachable', () => {
    const s = base();
    s.hysteresis = 5;
    s.phases = [
      { id: 'a1', metric: 'a', min: 0, max: 100 },
      { id: 'a2', metric: 'a', min: 90, max: 180 },
    ];
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('does not compare phases that use different metrics', () => {
    const s = base();
    s.phases = [
      { id: 'one', metric: 'a', min: 30, max: 70 },
      { id: 'two', metric: 'o', min: -0.5, max: 0.5 },
    ];
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('rejects a form rule margin that leaves no clearable value (R6d.4)', () => {
    const s = base();
    s.formRules = [{ id: 'f', metric: 'a', min: 80, max: 90, hysteresis: 6, debounceMs: 0, message: 'm' }];
    expectIssue(s, 'formRules[0]', 'clearable');
    s.formRules[0].hysteresis = 5;
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('uses the default hysteresis for form rules without their own', () => {
    const s = base();
    // offset metric: default normHysteresis 0.05, so min 0.1 and max 0.19 cannot clear.
    s.formRules = [{ id: 'f', metric: 'o', min: 0.1, max: 0.19, debounceMs: 0, message: 'm' }];
    expectIssue(s, 'formRules[0]', 'clearable');
    s.formRules[0].max = 0.2;
    expect(parseMovementSpec(s).ok).toBe(true);
  });

  it('rejects non-finite and out-of-range numbers', () => {
    const s = base();
    s.minVisibility = 1.5;
    expectIssue(s, 'minVisibility');
    const t = base();
    t.holdGapMs = 0;
    expectIssue(t, 'holdGapMs');
    const u = base();
    u.phases[0].min = Number.NaN;
    expectIssue(u, 'phases[0].min');
  });

  it('rejects duplicate hold and form rule ids', () => {
    const s = base();
    s.holds = [
      { id: 'h', phase: 'up', minMs: 1, tickMs: 1 },
      { id: 'h', phase: 'down', minMs: 1, tickMs: 1 },
    ];
    expectIssue(s, 'holds[1].id', 'duplicate');
    const t = base();
    t.formRules = [
      { id: 'f', metric: 'o', max: 1, debounceMs: 0, message: 'm' },
      { id: 'f', metric: 'o', max: 1, debounceMs: 0, message: 'm' },
    ];
    expectIssue(t, 'formRules[1].id', 'duplicate');
  });
});

describe('movement spec properties', () => {
  it('P20 (round trip): parse(serialise(parse(spec))) equals parse(spec)', () => {
    fc.assert(
      fc.property(arbSpecJson, (json) => {
        const first = parseMovementSpec(json);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const second = parseMovementSpec(JSON.parse(JSON.stringify(first.spec)));
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.spec).toEqual(first.spec);
      }),
      RUNS,
    );
  });

  it('P21 (no throw): never throws for arbitrary JSON values', () => {
    fc.assert(
      fc.property(fc.anything({ withNullPrototype: true, withBigInt: true, withSparseArray: true }), (v) => {
        expect(() => parseMovementSpec(v)).not.toThrow();
      }),
      RUNS,
    );
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = parseMovementSpec(v);
        expect(r.ok).toBe(false);
      }),
      RUNS,
    );
  });

  it('P21: never throws for arbitrary mutations of a valid spec', () => {
    const mutate = (v: unknown, path: (string | number)[], repl: unknown): unknown => {
      const copy = JSON.parse(JSON.stringify(v));
      let cur = copy;
      for (const seg of path.slice(0, -1)) {
        if (cur === null || typeof cur !== 'object') return copy;
        cur = cur[seg];
      }
      if (cur !== null && typeof cur === 'object') cur[path[path.length - 1]!] = repl;
      return copy;
    };
    fc.assert(
      fc.property(
        arbSpecJson,
        fc.constantFrom<(string | number)[]>(
          ['phases'],
          ['phases', 0],
          ['phases', 0, 'min'],
          ['metrics'],
          ['metrics', 'm0', 'points'],
          ['hysteresis'],
          ['holds'],
          ['formRules'],
          ['rom'],
        ),
        fc.jsonValue(),
        (spec, path, repl) => {
          expect(() => parseMovementSpec(mutate(spec, path, repl))).not.toThrow();
        },
      ),
      RUNS,
    );
  });

  it('P24 (reachability, rejection): a phase whose entry band is inside another phase retention band is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 40, max: 100 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (lo, w, insetLo, insetHi, h) => {
          // Q lies inside P (so Q's entry band lies inside P's retention band).
          const pMin = lo;
          const pMax = lo + w;
          const qMin = pMin + insetLo;
          const qMax = Math.max(qMin, pMax - insetHi);
          const spec = base();
          spec.hysteresis = h;
          spec.phases = [
            { id: 'outer', metric: 'a', min: pMin, max: pMax },
            { id: 'inner', metric: 'a', min: qMin, max: qMax },
          ];
          const r = parseMovementSpec(spec);
          expect(r.ok).toBe(false);
          if (r.ok) return;
          expect(r.issues.some((i) => i.path === 'phases[1]' && i.message.includes('"outer"'))).toBe(true);
        },
      ),
      RUNS,
    );
  });

  it('P24: two phases with identical ranges on one metric are always rejected', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 80 }), (min, w) => {
        const spec = base();
        spec.hysteresis = 0;
        spec.phases = [
          { id: 'one', metric: 'a', min, max: min + w },
          { id: 'two', metric: 'a', min, max: min + w },
        ];
        const r = parseMovementSpec(spec);
        expect(r.ok).toBe(false);
      }),
      RUNS,
    );
  });
});
