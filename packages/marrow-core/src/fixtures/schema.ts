import { z } from 'zod';
import type { Frame } from '../types';

const finite = z.number().finite();
const tuple = z.tuple([finite, finite, finite, finite]);

const fixtureObject = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    description: z.string(),
    fps: finite.positive(),
    landmarkCount: z.literal(33),
    frames: z
      .array(
        z
          .object({
            t: finite,
            l: z.array(tuple),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** A recorded or synthetic landmark clip. Frames hold `[x, y, z, visibility]` tuples. */
export type Fixture = z.output<typeof fixtureObject>;

export const FixtureSchema = fixtureObject.superRefine((fx, ctx) => {
  let prev = -Infinity;
  fx.frames.forEach((frame, i) => {
    if (i === 0 && frame.t !== 0) {
      ctx.addIssue({ code: 'custom', path: ['frames', 0, 't'], message: 'the first frame must have t = 0' });
    }
    if (frame.t <= prev) {
      ctx.addIssue({
        code: 'custom',
        path: ['frames', i, 't'],
        message: `t must be strictly increasing (got ${frame.t} after ${prev})`,
      });
    }
    prev = frame.t;
    if (frame.l.length !== fx.landmarkCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['frames', i, 'l'],
        message: `expected ${fx.landmarkCount} landmarks, got ${frame.l.length}`,
      });
    }
    frame.l.forEach((p, j) => {
      if (p[3] < 0 || p[3] > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['frames', i, 'l', j, 3],
          message: `visibility must be in [0, 1] (got ${p[3]})`,
        });
      }
    });
  });
});

/** Thrown by `parseFixture`. `field` is a path such as `frames[3].l[5][3]`; `frameIndex` is set for frame errors. */
export class FixtureError extends Error {
  readonly field: string;
  readonly frameIndex: number | undefined;

  constructor(field: string, message: string, frameIndex?: number) {
    super(`${field}: ${message}`);
    this.name = 'FixtureError';
    this.field = field;
    this.frameIndex = frameIndex;
  }
}

function formatPath(path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg),
    '',
  );
}

/** Validate unknown JSON as a fixture. Throws `FixtureError` naming the field and frame index. */
export function parseFixture(json: unknown): Fixture {
  const result = FixtureSchema.safeParse(json);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const field = formatPath(issue.path) || '(root)';
  const frameIndex = issue.path[0] === 'frames' && typeof issue.path[1] === 'number' ? issue.path[1] : undefined;
  throw new FixtureError(field, frameIndex === undefined ? issue.message : `${issue.message} (frame ${frameIndex})`, frameIndex);
}

/** Convert one fixture frame to a `Frame`, adding `offsetMs` to its timestamp. */
export function fixtureFrame(fixture: Fixture, index: number, offsetMs = 0): Frame {
  const f = fixture.frames[index]!;
  return {
    t: f.t + offsetMs,
    landmarks: f.l.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
  };
}
