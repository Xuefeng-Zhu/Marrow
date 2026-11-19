import { parseFixture, type Fixture } from 'marrow-core';
import jumpingJack from './jumping-jack.json';
import lunge from './lunge.json';
import plank from './plank.json';
import pushUp from './push-up.json';
import squat from './squat.json';

/** The only module that imports the demo fixture JSON. Each file is validated once, on load. */
const FIXTURES: Readonly<Record<string, Fixture>> = {
  squat: parseFixture(squat),
  'push-up': parseFixture(pushUp),
  lunge: parseFixture(lunge),
  'jumping-jack': parseFixture(jumpingJack),
  plank: parseFixture(plank),
};

/** The demo clip for a movement id, or undefined for an unknown id. */
export function getFixture(movementId: string): Fixture | undefined {
  return Object.prototype.hasOwnProperty.call(FIXTURES, movementId) ? FIXTURES[movementId] : undefined;
}
