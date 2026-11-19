/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine } from './engine/engine';
import type { MarrowEvent } from './engine/events';
import { parseFixture } from './fixtures/schema';
import { createPipeline, type ProcessedFrame } from './pipeline';
import { replay } from './sources/fixturePlayer';
import type { PoseSource, SourceError } from './sources/types';
import { parseMovementSpec } from './spec/parse';
import { angleFrame } from './testing/sequences';
import type { Frame } from './types';

const fixture = parseFixture(
  JSON.parse(readFileSync(new URL('../fixtures/elbow-cycle-3reps.json', import.meta.url), 'utf8')),
);
const parsed = parseMovementSpec(
  Object.values(import.meta.glob('../specs/elbow-cycle.json', { eager: true, import: 'default' }))[0],
);
if (!parsed.ok) throw new Error('example spec invalid');
const spec = parsed.spec;

/** A manual source: tests push frames and pose-lost notifications by hand. */
class StubSource implements PoseSource {
  started = false;
  stopped = 0;
  frames = new Set<(f: Frame) => void>();
  lost = new Set<(t: number) => void>();
  constructor(private readonly script: Frame[] = []) {}
  async start() {
    this.started = true;
    for (const f of this.script) this.emit(f);
  }
  stop() {
    this.stopped += 1;
    this.started = false;
  }
  onFrame(fn: (f: Frame) => void) {
    this.frames.add(fn);
    return () => this.frames.delete(fn);
  }
  onPoseLost(fn: (t: number) => void) {
    this.lost.add(fn);
    return () => this.lost.delete(fn);
  }
  onError(_fn: (e: SourceError) => void) {
    return () => {};
  }
  emit(f: Frame) {
    for (const fn of [...this.frames]) fn(f);
  }
  loseAt(t: number) {
    for (const fn of [...this.lost]) fn(t);
  }
}

function listen(p: ReturnType<typeof createPipeline>): MarrowEvent[] {
  const out: MarrowEvent[] = [];
  for (const type of ['phase', 'rep', 'hold:start', 'hold:tick', 'hold:end', 'form:warning', 'rom:sample'] as const) {
    p.on(type, (e) => out.push(e));
  }
  return out;
}

const fixtureFrames = [...replay(fixture)];
const summary = (events: MarrowEvent[]) =>
  events.map((e) => (e.type === 'phase' ? `phase:${e.to}` : e.type));

describe('createPipeline end to end (R7)', () => {
  it('with smoothing off, matches the engine run directly on the fixture', async () => {
    const source = new StubSource(fixtureFrames);
    const pipeline = createPipeline({ source, spec, smoothing: false });
    const got = listen(pipeline);
    await pipeline.start();
    const engine = createEngine(spec);
    const direct = fixtureFrames.flatMap((f) => engine.push(f));
    const order = (es: MarrowEvent[]) => [...es].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(order(got)).toEqual(order(direct));
    expect(got.filter((e) => e.type === 'rep')).toHaveLength(3);
  });

  it('with smoothing on (default), still yields 3 reps, 3 holds, 1 form warning and 3 ROM samples', async () => {
    for (const smoothing of [undefined, {}, { minCutoff: 2, beta: 1 }]) {
      const source = new StubSource(fixtureFrames);
      const pipeline = createPipeline({ source, spec, smoothing });
      const got = listen(pipeline);
      await pipeline.start();
      const count = (type: string) => got.filter((e) => e.type === type).length;
      expect(count('rep')).toBe(3);
      expect(count('hold:start')).toBe(3);
      expect(count('hold:end')).toBe(3);
      expect(count('form:warning')).toBe(1);
      expect(count('rom:sample')).toBe(3);
      expect(summary(got).filter((s) => s.startsWith('phase:'))).toEqual([
        'phase:extended',
        'phase:bent',
        'phase:extended',
        'phase:bent',
        'phase:extended',
        'phase:bent',
        'phase:extended',
      ]);
    }
  });

  it('smoothing off passes frames through; smoothing on keeps t and visibility', async () => {
    const raw = fixtureFrames.slice(0, 5);
    const seen: Record<string, ProcessedFrame[]> = { off: [], on: [] };
    for (const [name, smoothing] of [['off', false], ['on', undefined]] as const) {
      const pipeline = createPipeline({ source: new StubSource(raw), spec, smoothing });
      pipeline.onFrame((f) => seen[name]!.push(f));
      await pipeline.start();
    }
    expect(seen.off!.map((p) => p.frame)).toEqual(raw);
    expect(seen.on!.map((p) => p.frame.t)).toEqual(raw.map((f) => f.t));
    expect(seen.on![0]!.metrics.elbowAngle).toBeCloseTo(seen.off![0]!.metrics.elbowAngle!, 6);
    expect(seen.off![0]!.phase).toBe('extended');
    expect(Object.keys(seen.off![0]!.metrics).sort()).toEqual(['elbowAngle', 'elbowDrift']);
  });

  it('calls advance on onPoseLost and dispatches hold:end with lost-pose', async () => {
    const source = new StubSource();
    const pipeline = createPipeline({ source, spec, smoothing: false });
    const got = listen(pipeline);
    await pipeline.start();
    for (let t = 0; t <= 1500; t += 100) source.emit(angleFrame(t, 50));
    expect(got.some((e) => e.type === 'hold:start')).toBe(true);
    source.loseAt(1700);
    expect(got.some((e) => e.type === 'hold:end')).toBe(false);
    source.loseAt(2100);
    const ends = got.filter((e) => e.type === 'hold:end');
    expect(ends).toEqual([
      { type: 'hold:end', t: 2100, holdId: 'bent-hold', durationMs: 1500, reason: 'lost-pose' },
    ]);
    source.emit(angleFrame(2100, 50));
    expect(got.filter((e) => e.type === 'hold:end')).toHaveLength(1);
  });

  it('on() returns an unsubscribe that affects only that listener', async () => {
    const source = new StubSource(fixtureFrames);
    const pipeline = createPipeline({ source, spec, smoothing: false });
    const a: number[] = [];
    const b: number[] = [];
    const offA = pipeline.on('rep', (e) => a.push(e.count));
    pipeline.on('rep', (e) => b.push(e.count));
    offA();
    await pipeline.start();
    expect(a).toEqual([]);
    expect(b).toEqual([1, 2, 3]);
  });

  it('stop stops the source, unsubscribes from it and removes all listeners', async () => {
    const source = new StubSource();
    const pipeline = createPipeline({ source, spec, smoothing: false });
    const got = listen(pipeline);
    const frames: ProcessedFrame[] = [];
    pipeline.onFrame((f) => frames.push(f));
    await pipeline.start();
    expect(source.frames.size).toBe(1);
    expect(source.lost.size).toBe(1);
    pipeline.stop();
    expect(source.stopped).toBe(1);
    expect(source.frames.size).toBe(0);
    expect(source.lost.size).toBe(0);
    source.emit(angleFrame(0, 170));
    expect(got).toEqual([]);
    expect(frames).toEqual([]);
  });

  it('start twice subscribes once', async () => {
    const source = new StubSource();
    const pipeline = createPipeline({ source, spec, smoothing: false });
    await pipeline.start();
    await pipeline.start();
    expect(source.frames.size).toBe(1);
  });
});
