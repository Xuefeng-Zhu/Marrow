import { describe, expect, it } from 'vitest';
import { FixtureError, parseFixture } from './schema';

const lm = (): number[][] => Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);

function valid(): Record<string, any> {
  return {
    version: 1,
    id: 'x',
    description: 'd',
    fps: 30,
    landmarkCount: 33,
    frames: [
      { t: 0, l: lm() },
      { t: 33, l: lm() },
    ],
  };
}

function failure(mutate: (fx: Record<string, any>) => void): FixtureError {
  const fx = valid();
  mutate(fx);
  try {
    parseFixture(fx);
  } catch (e) {
    expect(e).toBeInstanceOf(FixtureError);
    return e as FixtureError;
  }
  throw new Error('expected parseFixture to throw');
}

describe('parseFixture (R2b.5)', () => {
  it('accepts a valid fixture', () => {
    expect(parseFixture(valid()).frames).toHaveLength(2);
  });

  it('rejects non-objects and wrong version', () => {
    expect(() => parseFixture(null)).toThrow(FixtureError);
    expect(failure((f) => (f.version = 2)).field).toBe('version');
  });

  it('names the field and frame for non-increasing timestamps', () => {
    const e = failure((f) => (f.frames[1].t = 0));
    expect(e.field).toBe('frames[1].t');
    expect(e.frameIndex).toBe(1);
    expect(e.message).toContain('frames[1].t');
  });

  it('requires the first frame to start at t = 0', () => {
    expect(failure((f) => (f.frames[0].t = 5)).field).toBe('frames[0].t');
  });

  it('rejects a wrong landmark count and names the frame', () => {
    const e = failure((f) => f.frames[1].l.pop());
    expect(e.field).toBe('frames[1].l');
    expect(e.frameIndex).toBe(1);
  });

  it('rejects non-finite values and out-of-range visibility', () => {
    expect(failure((f) => (f.frames[1].l[4][0] = null)).field).toBe('frames[1].l[4][0]');
    const e = failure((f) => (f.frames[0].l[2][3] = 1.5));
    expect(e.field).toBe('frames[0].l[2][3]');
    expect(e.frameIndex).toBe(0);
  });

  it('rejects unknown keys, empty frame lists and bad fps', () => {
    expect(failure((f) => (f.extra = 1)).field).toBe('(root)');
    expect(failure((f) => (f.frames = [])).field).toBe('frames');
    expect(failure((f) => (f.fps = 0)).field).toBe('fps');
  });
});
