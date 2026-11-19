import { parseMovementSpec, type MovementSpec } from 'marrow-core';
import jumpingJack from './jumping-jack.json';
import lunge from './lunge.json';
import plank from './plank.json';
import pushUp from './push-up.json';
import squat from './squat.json';
import { PRESENTATION, type Target, type WorkoutPresentation } from './workouts';

export type { Target } from './workouts';

export interface WorkoutDef extends WorkoutPresentation {
  /** Equals `spec.id` and the JSON file name. */
  id: string;
  name: string;
  spec: MovementSpec;
}

/** The only module that imports the movement JSON files. */
const RAW: readonly unknown[] = [squat, pushUp, lunge, jumpingJack, plank];

function load(json: unknown): WorkoutDef {
  const parsed = parseMovementSpec(json);
  if (!parsed.ok) {
    const id = (json as { id?: unknown } | null)?.id;
    throw new Error(
      `Invalid movement spec "${String(id)}": ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    );
  }
  const spec = parsed.spec;
  const presentation = PRESENTATION[spec.id];
  if (!presentation) throw new Error(`No presentation data for movement "${spec.id}"`);
  return { ...presentation, id: spec.id, name: spec.name, spec };
}

export const WORKOUTS: readonly WorkoutDef[] = RAW.map(load);

export function getWorkout(id: string): WorkoutDef | undefined {
  return WORKOUTS.find((w) => w.id === id);
}
