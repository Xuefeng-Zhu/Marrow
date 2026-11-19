/**
 * Generates `src/fixtures/*.json`: synthetic demo clips for the five Rattle Reps movements.
 * Each clip is built from joint angles over time with a small kinematic rig. No camera or
 * personal data is involved.
 *
 * Run from the repo root:  npm run make-fixtures -w apps/rattle-reps
 * A test checks that the committed files equal this script's output.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Fixture } from 'marrow-core';

// MediaPipe Pose indices (kept local so the script runs under plain Node type stripping).
const I = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

const FPS = 20;
const FRAME_MS = 1000 / FPS;
const DEG = Math.PI / 180;

type Pt = [number, number, number];
type Pose = Partial<Record<number, Pt>>;
type Tuple4 = [number, number, number, number];
type Landmarks = Tuple4[];

const round = (v: number): number => Math.round(v * 10000) / 10000;
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
const lerpPt = (a: Pt, b: Pt, f: number): Pt => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
const add = (a: Pt, dx: number, dy: number, dz = 0): Pt => [a[0] + dx, a[1] + dy, a[2] + dz];

/** A value over time: smooth steps between `[ms, value]` keys, constant before and after them. */
function track(keys: readonly (readonly [number, number])[]): (ms: number) => number {
  return (ms) => {
    const first = keys[0]!;
    if (ms <= first[0]) return first[1];
    for (let i = 1; i < keys.length; i++) {
      const [t0, v0] = keys[i - 1]!;
      const [t1, v1] = keys[i]!;
      if (ms <= t1) {
        const x = (ms - t0) / (t1 - t0);
        return v0 + (v1 - v0) * x * x * (3 - 2 * x);
      }
    }
    return keys[keys.length - 1]![1];
  };
}

/** Keys for `count` consecutive cycles of `cycleMs`, starting at `startMs`. `keysFor` gives the relative keys of cycle `index`. */
function cycles(
  startMs: number,
  cycleMs: number,
  count: number,
  keysFor: (index: number) => readonly (readonly [number, number])[],
): [number, number][] {
  const out: [number, number][] = [];
  for (let c = 0; c < count; c++) {
    for (const [t, v] of keysFor(c)) out.push([startMs + c * cycleMs + t, v]);
  }
  return out;
}

/** Fill the 33 landmarks: face points near the nose, hand points at the wrists, foot points at the ankles. */
function build(p: Pose): Landmarks {
  const out: Pt[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[Number(k)] = v;
  const nose = out[I.nose]!;
  for (const i of [
    I.leftEyeInner,
    I.leftEye,
    I.leftEyeOuter,
    I.rightEyeInner,
    I.rightEye,
    I.rightEyeOuter,
    I.leftEar,
    I.rightEar,
    I.mouthLeft,
    I.mouthRight,
  ]) {
    if (p[i] === undefined) out[i] = nose;
  }
  for (const [side, wrist, ankle] of [
    [0, I.leftWrist, I.leftAnkle],
    [1, I.rightWrist, I.rightAnkle],
  ] as const) {
    for (const i of [I.leftPinky, I.leftIndex, I.leftThumb]) {
      const j = i + side;
      if (p[j] === undefined) out[j] = out[wrist]!;
    }
    for (const i of [I.leftHeel, I.leftFootIndex]) {
      const j = i + side;
      if (p[j] === undefined) out[j] = out[ankle]!;
    }
  }
  return out.map((pt): Tuple4 => [round(pt[0]), round(pt[1]), round(pt[2]), 0.99]);
}

/** Point at distance `len` from `from`, in the direction `deg` degrees from +x towards +y (screen coordinates). */
function polar(from: Pt, len: number, deg: number): Pt {
  return [from[0] + len * Math.cos(deg * DEG), from[1] + len * Math.sin(deg * DEG), from[2]];
}

/** Rig for the side-on poses: the right side copies the left side with a depth offset. */
function mirrorDepth(left: Pose, dz: number): Pose {
  const out: Pose = { ...left };
  const pairs: [number, number][] = [
    [I.leftShoulder, I.rightShoulder],
    [I.leftElbow, I.rightElbow],
    [I.leftWrist, I.rightWrist],
    [I.leftHip, I.rightHip],
    [I.leftKnee, I.rightKnee],
    [I.leftAnkle, I.rightAnkle],
  ];
  for (const [l, r] of pairs) if (left[l] !== undefined && left[r] === undefined) out[r] = add(left[l]!, 0, 0, dz);
  return out;
}

// ---------------------------------------------------------------- squat (front on)

const SQUAT_LEG = 0.22;
const SQUAT_TORSO = 0.35;
const SQUAT_FLOOR = 0.92;

/** `knee` is the knee angle in degrees, `cave` moves both knees towards each other. */
function squatPose(knee: number, cave: number): Landmarks {
  const d = 2 * SQUAT_LEG * Math.sin((knee / 2) * DEG);
  const depth = -SQUAT_LEG * Math.cos((knee / 2) * DEG);
  const hipY = SQUAT_FLOOR - d;
  const shoulderY = hipY - SQUAT_TORSO;
  const kneeY = SQUAT_FLOOR - d / 2;
  return build({
    [I.nose]: [0.5, shoulderY - 0.1, 0],
    [I.leftShoulder]: [0.4, shoulderY, 0],
    [I.rightShoulder]: [0.6, shoulderY, 0],
    [I.leftElbow]: [0.33, shoulderY + 0.15, 0],
    [I.rightElbow]: [0.67, shoulderY + 0.15, 0],
    [I.leftWrist]: [0.33, shoulderY + 0.3, 0],
    [I.rightWrist]: [0.67, shoulderY + 0.3, 0],
    [I.leftHip]: [0.4, hipY, 0],
    [I.rightHip]: [0.6, hipY, 0],
    [I.leftKnee]: [0.4 + cave, kneeY, depth],
    [I.rightKnee]: [0.6 - cave, kneeY, depth],
    [I.leftAnkle]: [0.4, SQUAT_FLOOR, 0],
    [I.rightAnkle]: [0.6, SQUAT_FLOOR, 0],
  });
}

function squatFixture(): Fixture {
  const CYCLE = 3500;
  // Reps 0 to 2 clean, rep 3 knees caving, reps 4 and 5 shallow (bottom about 105 degrees).
  const bottomOf = (c: number): number => (c >= 4 ? 105 : 75);
  const knee = track(
    cycles(500, CYCLE, 6, (c) => [
      [0, 170],
      [500, 170],
      [1400, bottomOf(c)],
      [2100, bottomOf(c)],
      [3000, 170],
      [3500, 170],
    ]),
  );
  const cave = track(
    cycles(500, CYCLE, 6, (c) => [
      [0, 0],
      [1400, 0],
      [1800, c === 3 ? 0.06 : 0],
      [2100, c === 3 ? 0.06 : 0],
      [2500, 0],
    ]),
  );
  return render(
    'squat',
    'Synthetic squats: 3 clean, 1 with knees caving, 2 shallow (generated by scripts/make-fixtures.ts)',
    500 + 6 * CYCLE + 500,
    (ms) => squatPose(knee(ms), cave(ms)),
  );
}

// ---------------------------------------------------------------- push-up (side on)

const FLOOR = 0.85;
const ARM = 0.14;

/** `elbow` is the elbow angle in degrees, `sag` lowers the hips (positive) in image units. */
function pushUpPose(elbow: number, sag: number): Landmarks {
  const wrist: Pt = [0.68, FLOOR, 0];
  const d = 2 * ARM * Math.sin((elbow / 2) * DEG);
  const shoulder: Pt = [wrist[0] - 0.02, FLOOR - Math.sqrt(d * d - 0.02 * 0.02), 0];
  const ankle: Pt = [0.12, FLOOR, 0];
  // Elbow: midpoint of shoulder and wrist, pushed backwards by the bend.
  const dirX = (wrist[0] - shoulder[0]) / d;
  const dirY = (wrist[1] - shoulder[1]) / d;
  const h = ARM * Math.cos((elbow / 2) * DEG);
  const mid = lerpPt(shoulder, wrist, 0.5);
  const elbowPt: Pt = [mid[0] - dirY * h, mid[1] + dirX * h, 0];
  const hip = add(lerpPt(ankle, shoulder, 0.55), 0, sag);
  const knee = add(lerpPt(ankle, shoulder, 0.25), 0, sag * 0.4);
  return build(
    mirrorDepth(
      {
        [I.nose]: add(shoulder, 0.1, -0.03),
        [I.leftShoulder]: shoulder,
        [I.leftElbow]: elbowPt,
        [I.leftWrist]: wrist,
        [I.leftHip]: hip,
        [I.leftKnee]: knee,
        [I.leftAnkle]: ankle,
      },
      0.1,
    ),
  );
}

function pushUpFixture(): Fixture {
  const CYCLE = 3500;
  // Reps 0 to 2 clean, rep 3 sagging hips, reps 4 and 5 shallow (bottom about 100 degrees).
  const bottomOf = (c: number): number => (c >= 4 ? 100 : 65);
  const elbow = track(
    cycles(500, CYCLE, 6, (c) => [
      [0, 170],
      [500, 170],
      [1300, bottomOf(c)],
      [1800, bottomOf(c)],
      [2700, 170],
      [3500, 170],
    ]),
  );
  const sag = track(
    cycles(500, CYCLE, 6, (c) => [
      [0, 0],
      [1200, 0],
      [1500, c === 3 ? 0.07 : 0],
      [2200, c === 3 ? 0.07 : 0],
      [2600, 0],
    ]),
  );
  return render(
    'push-up',
    'Synthetic push-ups: 3 clean, 1 with sagging hips, 2 shallow (generated by scripts/make-fixtures.ts)',
    500 + 6 * CYCLE + 500,
    (ms) => pushUpPose(elbow(ms), sag(ms)),
  );
}

// ---------------------------------------------------------------- lunge (side on, left foot forward, facing right)

const LUNGE_LEG = 0.22;
const LUNGE_TORSO = 0.35;
const LUNGE_FLOOR = 0.92;

/**
 * `knee` is the front knee angle, `shin` the forward tilt of the front shin from vertical, and
 * `lean` the forward tilt of the torso from vertical, all in degrees.
 */
function lungePose(knee: number, shin: number, lean: number): Landmarks {
  const ankle: Pt = [0.5, LUNGE_FLOOR, 0];
  const kneePt = polar(ankle, LUNGE_LEG, -90 + shin);
  const hip = polar(kneePt, LUNGE_LEG, 90 + shin + knee);
  const shoulder: Pt = [hip[0] + LUNGE_TORSO * Math.sin(lean * DEG), hip[1] - LUNGE_TORSO * Math.cos(lean * DEG), 0];
  // The back leg is kept straight where it can reach the floor.
  const dy = LUNGE_FLOOR - hip[1];
  const dx = Math.max(0.05, Math.sqrt(Math.max(0, 4 * LUNGE_LEG * LUNGE_LEG - dy * dy)));
  const backAnkle: Pt = [hip[0] - dx, LUNGE_FLOOR, 0];
  const backKnee = add(lerpPt(hip, backAnkle, 0.5), 0, 0.01);
  const elbow = add(shoulder, 0.02, 0.15);
  const wrist = add(shoulder, 0.03, 0.3);
  return build(
    mirrorDepth(
      {
        [I.nose]: add(shoulder, 0.04, -0.1),
        [I.leftShoulder]: shoulder,
        [I.leftElbow]: elbow,
        [I.leftWrist]: wrist,
        [I.leftHip]: hip,
        [I.leftKnee]: kneePt,
        [I.leftAnkle]: ankle,
        [I.rightKnee]: add(backKnee, 0, 0, 0.1),
        [I.rightAnkle]: add(backAnkle, 0, 0, 0.1),
      },
      0.1,
    ),
  );
}

function lungeFixture(): Fixture {
  const CYCLE = 4000;
  const FAULT = 2;
  const kneeAngle = track(
    cycles(500, CYCLE, 5, () => [
      [0, 172],
      [600, 172],
      [1700, 80],
      [2500, 80],
      [3300, 172],
      [4000, 172],
    ]),
  );
  // Rep 2: the knee drifts past the ankle during the hold at the bottom.
  const shin = track(
    cycles(500, CYCLE, 5, (c) => [
      [0, 3],
      [600, 3],
      [1700, 12],
      [1900, c === FAULT ? 40 : 12],
      [2400, c === FAULT ? 40 : 12],
      [2700, 12],
      [3300, 3],
    ]),
  );
  return render(
    'lunge',
    'Synthetic lunges, left foot forward: 4 clean, 1 with the knee past the ankle (generated by scripts/make-fixtures.ts)',
    500 + 5 * CYCLE + 500,
    (ms) => lungePose(kneeAngle(ms), shin(ms), 5),
  );
}

// ---------------------------------------------------------------- jumping jack (front on)

const JACK_TORSO = 0.35;
const JACK_ARM = 0.3;

type Side = Record<'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle', Pt>;

/** `half` is half the distance between the ankles, `arm` the arm angle from straight down in degrees. */
function jackPose(half: number, arm: number): Landmarks {
  const shoulderY = 0.27;
  const hipY = shoulderY + JACK_TORSO;
  const ankleY = 0.95;
  const side = (shoulderX: number, hipX: number, ankleX: number, sign: 1 | -1): Side => {
    const shoulder: Pt = [shoulderX, shoulderY, 0];
    const wrist: Pt = [
      shoulder[0] + sign * JACK_ARM * Math.sin(arm * DEG),
      shoulder[1] + JACK_ARM * Math.cos(arm * DEG),
      0,
    ];
    return {
      shoulder,
      elbow: lerpPt(shoulder, wrist, 0.5),
      wrist,
      hip: [hipX, hipY, 0],
      knee: [(hipX + ankleX) / 2, (hipY + ankleY) / 2, 0],
      ankle: [ankleX, ankleY, 0],
    };
  };
  const l = side(0.4, 0.43, 0.5 - half, -1);
  const r = side(0.6, 0.57, 0.5 + half, 1);
  return build({
    [I.nose]: [0.5, shoulderY - 0.1, 0],
    [I.leftShoulder]: l.shoulder,
    [I.leftElbow]: l.elbow,
    [I.leftWrist]: l.wrist,
    [I.leftHip]: l.hip,
    [I.leftKnee]: l.knee,
    [I.leftAnkle]: l.ankle,
    [I.rightShoulder]: r.shoulder,
    [I.rightElbow]: r.elbow,
    [I.rightWrist]: r.wrist,
    [I.rightHip]: r.hip,
    [I.rightKnee]: r.knee,
    [I.rightAnkle]: r.ankle,
  });
}

function jumpingJackFixture(): Fixture {
  const CYCLE = 2200;
  const LOW_ARMS = 4;
  const half = track(
    cycles(1000, CYCLE, 8, () => [
      [0, 0.05],
      [300, 0.05],
      [600, 0.275],
      [1500, 0.275],
      [1800, 0.05],
      [2200, 0.05],
    ]),
  );
  // Rep 4: the arms only rise to about 100 degrees.
  const arm = track(
    cycles(1000, CYCLE, 8, (c) => [
      [0, 0],
      [200, 0],
      [500, c === LOW_ARMS ? 100 : 180],
      [1500, c === LOW_ARMS ? 100 : 180],
      [1800, 0],
      [2200, 0],
    ]),
  );
  return render(
    'jumping-jack',
    'Synthetic jumping jacks: 8 reps, 1 with low arms (generated by scripts/make-fixtures.ts)',
    1000 + 8 * CYCLE + 600,
    (ms) => jackPose(half(ms), arm(ms)),
  );
}

// ---------------------------------------------------------------- plank (side on, on the forearms)

/** `hip` moves the hips down (positive, sag) or up (negative, pike) from a straight line. */
function plankPose(hip: number): Landmarks {
  const ankle: Pt = [0.12, FLOOR, 0];
  const shoulder: Pt = [0.62, 0.7, 0];
  const elbow: Pt = [0.62, FLOOR, 0];
  const wrist: Pt = [0.75, FLOOR, 0];
  return build(
    mirrorDepth(
      {
        [I.nose]: add(shoulder, 0.09, 0.0),
        [I.leftShoulder]: shoulder,
        [I.leftElbow]: elbow,
        [I.leftWrist]: wrist,
        [I.leftHip]: add(lerpPt(ankle, shoulder, 0.55), 0, hip),
        [I.leftKnee]: add(lerpPt(ankle, shoulder, 0.25), 0, hip * 0.4),
        [I.leftAnkle]: ankle,
      },
      0.1,
    ),
  );
}

function plankFixture(): Fixture {
  // Hips piked while getting into position, then a straight hold with a brief sag at about 12 s.
  const hip = track([
    [0, -0.25],
    [1000, -0.25],
    [1800, 0],
    [11500, 0],
    [11900, 0.04],
    [12700, 0.04],
    [13100, 0],
    [21000, 0],
    [21800, -0.25],
    [23000, -0.25],
  ]);
  return render(
    'plank',
    'Synthetic plank: a 20 s hold with a brief sag at about 12 s (generated by scripts/make-fixtures.ts)',
    23000,
    (ms) => plankPose(hip(ms)),
  );
}

// ---------------------------------------------------------------- output

function render(id: string, description: string, totalMs: number, poseAt: (ms: number) => Landmarks): Fixture {
  const frames: Fixture['frames'] = [];
  for (let i = 0; i * FRAME_MS <= totalMs; i++) {
    const t = i * FRAME_MS;
    frames.push({ t, l: poseAt(t) });
  }
  return { version: 1, id, description, fps: FPS, landmarkCount: 33, frames };
}

/** One fixture per movement id. */
export function generateFixtures(): Record<string, Fixture> {
  return {
    squat: squatFixture(),
    'push-up': pushUpFixture(),
    lunge: lungeFixture(),
    'jumping-jack': jumpingJackFixture(),
    plank: plankFixture(),
  };
}

/** Compact JSON: one line per frame. */
export function serializeFixture(fx: Fixture): string {
  const head = JSON.stringify({ ...fx, frames: undefined }).slice(0, -1);
  const rows = fx.frames.map((f) => `    ${JSON.stringify(f)}`).join(',\n');
  return `${head},"frames":[\n${rows}\n  ]}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../src/fixtures/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const [id, fx] of Object.entries(generateFixtures())) {
    const out = `${dir}${id}.json`;
    writeFileSync(out, serializeFixture(fx));
    console.log(`wrote ${out}`);
  }
}
