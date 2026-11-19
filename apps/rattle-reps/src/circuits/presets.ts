import type { Circuit } from './sequencer';

export const PRESET_CIRCUITS: readonly Circuit[] = [
  {
    id: 'spooky-starter',
    name: 'Spooky Starter',
    blurb: 'Squats, push-ups and a short plank. A gentle warm-up round.',
    steps: [
      { movementId: 'squat', target: { kind: 'reps', reps: 10 }, restSec: 20 },
      { movementId: 'push-up', target: { kind: 'reps', reps: 5 }, restSec: 20 },
      { movementId: 'plank', target: { kind: 'hold', seconds: 20 }, restSec: 20 },
    ],
  },
  {
    id: 'graveyard-cardio',
    name: 'Graveyard Cardio',
    blurb: 'Jumping jacks around a set of lunges to get the bones moving.',
    steps: [
      { movementId: 'jumping-jack', target: { kind: 'reps', reps: 20 }, restSec: 15 },
      { movementId: 'lunge', target: { kind: 'reps', reps: 8 }, restSec: 15 },
      { movementId: 'jumping-jack', target: { kind: 'reps', reps: 20 }, restSec: 15 },
    ],
  },
  {
    id: 'full-skeleton',
    name: 'Full Skeleton',
    blurb: 'All five movements, one after another.',
    steps: [
      { movementId: 'jumping-jack', target: { kind: 'reps', reps: 15 }, restSec: 20 },
      { movementId: 'squat', target: { kind: 'reps', reps: 10 }, restSec: 20 },
      { movementId: 'push-up', target: { kind: 'reps', reps: 8 }, restSec: 20 },
      { movementId: 'lunge', target: { kind: 'reps', reps: 8 }, restSec: 20 },
      { movementId: 'plank', target: { kind: 'hold', seconds: 30 }, restSec: 20 },
    ],
  },
];

export function getCircuit(id: string): Circuit | undefined {
  return PRESET_CIRCUITS.find((c) => c.id === id);
}
