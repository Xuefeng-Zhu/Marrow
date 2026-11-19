import { parseFixture, parseMovementSpec, type Fixture, type LandmarkName, type MovementSpec } from 'marrow-core';
import chairClip from './clips/chair-stand.json';
import kneeLeftClip from './clips/knee-flexion-left.json';
import kneeRightClip from './clips/knee-flexion-right.json';
import shoulderLeftClip from './clips/shoulder-flexion-left.json';
import shoulderRightClip from './clips/shoulder-flexion-right.json';
import stanceLeftClip from './clips/single-leg-stance-left.json';
import stanceRightClip from './clips/single-leg-stance-right.json';
import chairStand from './movements/chair-stand.json';
import kneeLeft from './movements/knee-flexion-left.json';
import kneeRight from './movements/knee-flexion-right.json';
import shoulderLeft from './movements/shoulder-flexion-left.json';
import shoulderRight from './movements/shoulder-flexion-right.json';
import stanceLeft from './movements/single-leg-stance-left.json';
import stanceRight from './movements/single-leg-stance-right.json';

export type Side = 'left' | 'right';
export type ResultKind = 'rom-peak' | 'count' | 'seconds';
export type TestId =
  | 'shoulder-flexion-left'
  | 'shoulder-flexion-right'
  | 'knee-flexion-left'
  | 'knee-flexion-right'
  | 'chair-stand'
  | 'single-leg-stance-left'
  | 'single-leg-stance-right';
export type Family = 'shoulder-flexion' | 'knee-flexion' | 'chair-stand' | 'single-leg-stance';

/** Text for each stage of a run. The UI shows it and the speech service reads it. */
export interface PromptScript {
  intro: string;
  go: string;
  rep: string;
  hold: string;
  /** Keyed by form rule id. */
  warn: Record<string, string>;
  lost: string;
  done: string;
}

export interface TestDef {
  id: TestId;
  family: Family;
  side?: Side;
  title: string;
  summary: string;
  kind: ResultKind;
  unit: string;
  /** Spec metric the app reads for the result (ROM tests). */
  metric?: string;
  /** Which edge of a `rom:sample` carries the result. Knee flexion reads the minimum angle. */
  romEdge?: 'max' | 'min';
  spec: MovementSpec;
  /** Synthetic demo clip, parsed with `parseFixture`. */
  clip: Fixture;
  limitMs: number;
  requiredLandmarks: LandmarkName[];
  setup: string[];
  script: PromptScript;
}

function load(json: unknown): MovementSpec {
  const r = parseMovementSpec(json);
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return r.spec;
}

const COMMON_SETUP = [
  'Place the camera at about waist height, two to three metres away, on a steady surface.',
  'Wear clothes that let the camera see your joints. Make sure the room is well lit.',
];

function shoulder(side: Side, spec: unknown, clip: unknown): TestDef {
  return {
    id: `shoulder-flexion-${side}`,
    family: 'shoulder-flexion',
    side,
    title: `Shoulder flexion, ${side} arm`,
    summary: `Raise your ${side} arm forward and up as far as is comfortable.`,
    kind: 'rom-peak',
    unit: 'degrees',
    metric: 'shoulderAngle',
    romEdge: 'max',
    spec: load(spec),
    clip: parseFixture(clip),
    limitMs: 60000,
    requiredLandmarks: [`${side}Hip`, `${side}Shoulder`, `${side}Elbow`],
    setup: [
      ...COMMON_SETUP,
      `Stand with your ${side} side toward the camera so the camera sees your ${side} arm.`,
      'Let your arm hang at your side with the elbow straight.',
    ],
    script: {
      intro: `Stand with your ${side} arm toward the camera and let it hang at your side.`,
      go: `Raise your ${side} arm forward and up as far as is comfortable, then lower it slowly.`,
      rep: 'Good. Lower your arm and repeat.',
      hold: 'Hold it there.',
      warn: {},
      lost: 'I cannot see you. Please step back into view.',
      done: 'All done. Well done.',
    },
  };
}

function knee(side: Side, spec: unknown, clip: unknown): TestDef {
  return {
    id: `knee-flexion-${side}`,
    family: 'knee-flexion',
    side,
    title: `Knee flexion, ${side} leg`,
    summary: `Bend your ${side} knee as far as is comfortable.`,
    kind: 'rom-peak',
    unit: 'degrees',
    metric: 'kneeAngle',
    romEdge: 'min',
    spec: load(spec),
    clip: parseFixture(clip),
    limitMs: 60000,
    requiredLandmarks: [`${side}Hip`, `${side}Knee`, `${side}Ankle`],
    setup: [
      ...COMMON_SETUP,
      `Stand side-on to the camera with your ${side} leg nearest to it. Hold a steady chair or counter for balance.`,
      'Stand tall with your leg straight.',
    ],
    script: {
      intro: `Stand side-on with your ${side} leg toward the camera. Hold a chair for balance.`,
      go: `Bend your ${side} knee, bringing your heel back, as far as is comfortable. Then straighten it.`,
      rep: 'Good. Straighten your leg and repeat.',
      hold: 'Hold it there.',
      warn: {},
      lost: 'I cannot see you. Please step back into view.',
      done: 'All done. Well done.',
    },
  };
}

function stance(side: Side, spec: unknown, clip: unknown): TestDef {
  const other: Side = side === 'left' ? 'right' : 'left';
  return {
    id: `single-leg-stance-${side}`,
    family: 'single-leg-stance',
    side,
    title: `Single-leg stance, ${side} leg`,
    summary: `Stand on your ${side} leg for as long as you can, up to 30 seconds.`,
    kind: 'seconds',
    unit: 'seconds',
    spec: load(spec),
    clip: parseFixture(clip),
    limitMs: 30000,
    requiredLandmarks: [`${side}Hip`, `${side}Ankle`, `${other}Ankle`, 'leftShoulder', 'rightShoulder', 'rightHip', 'leftHip'],
    setup: [
      ...COMMON_SETUP,
      'Face the camera. Stand next to a sturdy counter or wall you can grab if you wobble.',
      `You will stand on your ${side} leg, so lift your ${other} foot when the test starts.`,
    ],
    script: {
      intro: `Face the camera and stand next to something sturdy. You will stand on your ${side} leg.`,
      go: `Lift your ${other} foot off the floor now.`,
      rep: '',
      hold: 'Keep going. Stay steady.',
      warn: { 'sway-limit': 'Steady yourself.' },
      lost: 'I cannot see you. Please step back into view.',
      done: 'All done. Well done.',
    },
  };
}

const chair: TestDef = {
  id: 'chair-stand',
  family: 'chair-stand',
  title: '30-second chair stand',
  summary: 'Stand up and sit down as many times as you can in 30 seconds.',
  kind: 'count',
  unit: 'stands in 30 seconds',
  spec: load(chairStand),
  clip: parseFixture(chairClip),
  limitMs: 30000,
  requiredLandmarks: ['leftHip', 'leftKnee', 'leftAnkle', 'leftShoulder', 'rightShoulder', 'rightHip'],
  setup: [
    ...COMMON_SETUP,
    'Use a sturdy chair with a straight back and no wheels, placed against a wall.',
    'Sit side-on to the camera with your arms crossed over your chest and your feet flat on the floor.',
  ],
  script: {
    intro: 'Sit near the front of the chair with your arms crossed over your chest.',
    go: 'Go. Stand up fully, then sit back down. Keep going.',
    rep: '',
    hold: '',
    warn: {},
    lost: 'I cannot see you. Please move back into view.',
    done: 'Time is up.',
  },
};

export const TESTS: readonly TestDef[] = [
  shoulder('left', shoulderLeft, shoulderLeftClip),
  shoulder('right', shoulderRight, shoulderRightClip),
  knee('left', kneeLeft, kneeLeftClip),
  knee('right', kneeRight, kneeRightClip),
  chair,
  stance('left', stanceLeft, stanceLeftClip),
  stance('right', stanceRight, stanceRightClip),
];

export const TEST_BY_ID: Readonly<Record<TestId, TestDef>> = Object.fromEntries(
  TESTS.map((t) => [t.id, t]),
) as Record<TestId, TestDef>;
