import { z } from 'zod';
import { LANDMARK_NAMES } from '../landmarks';
import { validateSpec } from './validate';

const landmarkName = z.enum(LANDMARK_NAMES);
const finite = z.number().finite();
const nonNegative = finite.nonnegative();

const angleMetric = z
  .object({
    kind: z.literal('angle'),
    points: z.tuple([landmarkName, landmarkName, landmarkName]),
    plane: z.enum(['xy', 'xyz']).optional(),
  })
  .strict();

const distanceMetric = z
  .object({
    kind: z.literal('distance'),
    points: z.tuple([landmarkName, landmarkName]),
  })
  .strict();

const offsetMetric = z
  .object({
    kind: z.literal('offset'),
    points: z.tuple([landmarkName, landmarkName]),
    axis: z.enum(['x', 'y']),
  })
  .strict();

export const MetricSchema = z.discriminatedUnion('kind', [angleMetric, distanceMetric, offsetMetric]);

const phase = z
  .object({
    id: z.string().min(1),
    metric: z.string().min(1),
    min: finite,
    max: finite,
  })
  .strict();

const hold = z
  .object({
    id: z.string().min(1),
    phase: z.string().min(1),
    minMs: nonNegative,
    tickMs: finite.positive(),
  })
  .strict();

const formRule = z
  .object({
    id: z.string().min(1),
    metric: z.string().min(1),
    min: finite.optional(),
    max: finite.optional(),
    hysteresis: nonNegative.optional(),
    phases: z.array(z.string().min(1)).optional(),
    debounceMs: nonNegative,
    message: z.string().min(1),
  })
  .strict();

const rom = z
  .object({
    metric: z.string().min(1),
    sampleOn: z.union([z.literal('rep'), z.literal('hold:end'), z.string().regex(/^phase:.+$/)]),
  })
  .strict();

const specObject = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a slug (lowercase letters, digits, hyphens)'),
    name: z.string().min(1),
    minVisibility: finite.min(0).max(1).default(0.5),
    hysteresis: nonNegative.default(5),
    normHysteresis: nonNegative.default(0.05),
    minRepMs: nonNegative.default(0),
    holdGapMs: finite.positive().default(500),
    metrics: z.record(z.string().min(1), MetricSchema),
    phases: z.array(phase).min(2),
    holds: z.array(hold).optional(),
    formRules: z.array(formRule).optional(),
    rom: z.array(rom).optional(),
  })
  .strict();

export type MovementSpec = z.output<typeof specObject>;

export const MovementSpecSchema = specObject.superRefine(validateSpec);

export type Metric = z.output<typeof MetricSchema>;
export type Phase = MovementSpec['phases'][number];
export type Hold = NonNullable<MovementSpec['holds']>[number];
export type FormRule = NonNullable<MovementSpec['formRules']>[number];
export type RomDef = NonNullable<MovementSpec['rom']>[number];
