# Design: marrow-core

## Overview

Marrow is a literal skeleton: pose landmarks go in, typed events come out, and the rules are JSON. `packages/marrow-core` is plain TypeScript with no UI framework. Apps render and react.

```
PoseSource ──Frame──▶ LandmarkSmoother ──Frame──▶ Engine(spec) ──Event──▶ app listeners
 (MediaPipe |                                 │
  FixturePlayer)                              └─ metrics ──▶ frame listener (overlay)
```

Everything after the source is synchronous and deterministic. The only nondeterminism (camera, timers) lives inside sources. Time reaches the engine only as timestamps: on frames (`push`), and on pose-lost notifications from the source (`advance`), so the engine can end a hold when the pose disappears without reading a clock.

## Repository layout

```
package.json  tsconfig.base.json  package-lock.json
packages/marrow-core/
  package.json  tsconfig.json  README.md
  src/
    index.ts                 public entry (the only import path for apps)
    types.ts                 Landmark, Frame, Vec3
    landmarks.ts             LM name map, LANDMARK_NAMES
    geometry.ts              angleAt, distance, bodyScale
    smoothing/oneEuro.ts     OneEuroFilter
    smoothing/landmarkSmoother.ts
    spec/schema.ts           zod schemas, MovementSpec
    spec/parse.ts            parseMovementSpec
    engine/metrics.ts        evaluateMetrics(spec, frame)
    engine/engine.ts         createEngine
    engine/events.ts         event types
    sources/types.ts         PoseSource
    sources/fixturePlayer.ts
    sources/mediapipeSource.ts
    fixtures/schema.ts       Fixture schema, parseFixture
    pipeline.ts              createPipeline
    draw/connections.ts      POSE_CONNECTIONS
    draw/drawSkeleton.ts
    testing/sequences.ts     generators for tests (not exported from index)
  specs/        1 to 2 example movement specs (JSON)
  fixtures/     recorded or synthetic landmark clips (JSON)
  scripts/      fixture generator
apps/rattle-reps/  apps/steady/   Vite + React stubs
docs/              movement-spec.md, architecture.md
```

Apps depend on `marrow-core` through the workspace and import only from its entry. The core `exports` map exposes `.` (the library) and `./fixtures/*` and `./specs/*` as data files so that apps can load clips without deep source imports.

The core source contains no exercise names. Example specs and fixtures are the only places that name a movement.

## Data models

```ts
type Landmark = { x: number; y: number; z: number; visibility: number }; // x,y in [0,1] image space, z relative depth
type Frame = { t: number; landmarks: Landmark[] };                        // t in ms, 33 landmarks
```

`LM` maps names to MediaPipe indices (`nose: 0`, `leftShoulder: 11`, `rightShoulder: 12`, `leftElbow: 13`, `leftWrist: 15`, `leftHip: 23`, `leftKnee: 25`, `leftAnkle: 27`, and so on for all 33).

## Public API

```ts
// geometry
angleAt(a: Vec3, b: Vec3, c: Vec3): number            // degrees in [0,180], NaN if degenerate
distance(a: Vec3, b: Vec3): number
bodyScale(frame: Frame): number                       // mid-shoulder to mid-hip length

// smoothing
class OneEuroFilter { constructor(opts?: { minCutoff?: number; beta?: number; dCutoff?: number });
                      filter(value: number, tMs: number): number; reset(): void }
class LandmarkSmoother { constructor(opts?: OneEuroOptions); smooth(frame: Frame): Frame; reset(): void }

// spec
const MovementSpecSchema: z.ZodType<MovementSpec>
parseMovementSpec(json: unknown): { ok: true; spec: MovementSpec } | { ok: false; issues: { path: string; message: string }[] }

// engine
createEngine(spec: MovementSpec): Engine
interface Engine { push(frame: Frame): MarrowEvent[]; advance(t: number): MarrowEvent[]; reset(): void; readonly repCount: number; readonly phase: string | null }

// sources
interface PoseSource {
  start(): Promise<void>; stop(): void;
  onFrame(fn: (f: Frame) => void): () => void;          // returns unsubscribe
  onPoseLost(fn: (t: number) => void): () => void;      // no pose in a video frame at time t; no Frame is delivered
  onError(fn: (e: SourceError) => void): () => void;
}
createFixturePlayer(fixture: Fixture, opts?: { speed?: number; loop?: boolean; clock?: Clock }): PoseSource
replay(fixture: Fixture): Iterable<Frame>                // synchronous, for tests
createMediaPipeSource(opts?: { modelUrl?: string; wasmUrl?: string; video?: HTMLVideoElement; camera?: MediaStreamConstraints }): PoseSource
parseFixture(json: unknown): Fixture                      // throws FixtureError with field + frame index

// pipeline
createPipeline(opts: { source: PoseSource; spec: MovementSpec; smoothing?: OneEuroOptions | false }): Pipeline
interface Pipeline {
  start(): Promise<void>; stop(): void;
  on<K extends MarrowEvent['type']>(type: K, fn: (e: Extract<MarrowEvent, { type: K }>) => void): () => void;
  onFrame(fn: (f: ProcessedFrame) => void): () => void;  // { frame, metrics, phase }
}

// drawing
POSE_CONNECTIONS: readonly (readonly [number, number])[]
drawSkeleton(ctx: CanvasRenderingContext2D, frame: Frame, style: SkeletonStyle): void
```

`SourceError = { code: 'camera-denied' | 'camera-unavailable' | 'model-load-failed' | 'fixture-invalid'; message: string }`.

## Event types

```ts
type MarrowEvent =
  | { type: 'phase';        t: number; from: string | null; to: string }
  | { type: 'rep';          t: number; count: number; durationMs: number; phaseEntries: Record<string, number> }
  | { type: 'hold:start';   t: number; holdId: string }
  | { type: 'hold:tick';    t: number; holdId: string; elapsedMs: number }
  | { type: 'hold:end';     t: number; holdId: string; durationMs: number; reason: 'released' | 'lost-pose' }
  | { type: 'form:warning'; t: number; ruleId: string; message: string; value: number }
  | { type: 'rom:sample';   t: number; metric: string; min: number; max: number; trigger: string };
```

`t` is the frame timestamp that caused the event (for `hold:start`, the time the condition began).

## Movement spec format

Top level fields (all objects strict):

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | literal |
| `id`, `name` | string | `id` is a slug |
| `minVisibility` | number 0..1 | default 0.5 |
| `hysteresis` | number >= 0 | default 5, degrees. Applies to `angle` metrics |
| `normHysteresis` | number >= 0 | default 0.05, fraction of torso length. Applies to `distance` and `offset` metrics |
| `minRepMs` | number >= 0 | default 0 |
| `holdGapMs` | number > 0 | default 500 |
| `metrics` | record name to metric | `angle`, `distance` or `offset` |
| `phases` | array, at least 2 | ordered rep cycle: `{ id, metric, min, max }` |
| `holds` | array, optional | `{ id, phase, minMs, tickMs }` |
| `formRules` | array, optional | `{ id, metric, min?, max?, hysteresis?, phases?, debounceMs, message }` (`hysteresis` is in the metric's unit and overrides the spec default) |
| `rom` | array, optional | `{ metric, sampleOn }` where `sampleOn` is `rep`, `hold:end` or `phase:<id>` |

Metric kinds:

```json
{ "kind": "angle",    "points": ["leftShoulder", "leftElbow", "leftWrist"], "plane": "xy" }
{ "kind": "distance", "points": ["leftWrist", "leftHip"] }
{ "kind": "offset",   "points": ["leftElbow", "leftHip"], "axis": "x" }
```

`angle` is in degrees. `distance` and `offset` are divided by `bodyScale`. `offset` is the signed difference `points[0] - points[1]` along the axis.

### Worked example: `specs/elbow-cycle.json`

A generic bend-and-extend cycle of one arm. It counts reps, times a hold in the bent position, warns when the elbow drifts from the body, and samples range of motion per rep.

```json
{
  "version": 1,
  "id": "elbow-cycle",
  "name": "Elbow bend and extend",
  "minVisibility": 0.5,
  "hysteresis": 8,
  "minRepMs": 600,
  "metrics": {
    "elbowAngle": { "kind": "angle", "points": ["leftShoulder", "leftElbow", "leftWrist"] },
    "elbowDrift": { "kind": "offset", "points": ["leftElbow", "leftHip"], "axis": "x" }
  },
  "phases": [
    { "id": "extended", "metric": "elbowAngle", "min": 150, "max": 180 },
    { "id": "bent",     "metric": "elbowAngle", "min": 30,  "max": 70 }
  ],
  "holds": [
    { "id": "bent-hold", "phase": "bent", "minMs": 1000, "tickMs": 500 }
  ],
  "formRules": [
    { "id": "elbow-drift", "metric": "elbowDrift", "max": 0.25, "phases": ["bent"],
      "debounceMs": 300, "message": "Keep your elbow close to your side" }
  ],
  "rom": [
    { "metric": "elbowAngle", "sampleOn": "rep" }
  ]
}
```

Reading it: the narrowest phase is 30 wide, so hysteresis 8 is valid (limit is 15). The two phases share a metric, and `bent`'s entry band [38, 62] lies outside `extended`'s retention band [142, 188] (and the reverse), so both are reachable. The `elbow-drift` rule is in torso units, so it uses `normHysteresis` (default 0.05) and not the 8 degrees: it clears when the offset is at or below 0.20. From `extended`, the engine stays put until the angle is inside `bent` shrunk by 8, that is 38 to 62. Between 70 and 150 the engine keeps the last phase, which is how a path crosses a gap without a phase of its own. After `extended` then `bent` then `extended` again, one `rep` fires.

### Engine semantics

- **Phase selection.** `current` is the phase the engine is in. `h` is the hysteresis for the phase's metric kind (`hysteresis` for angles, `normHysteresis` otherwise). A candidate phase Q is entered when the value lies in `[Q.min + h, Q.max - h]` and the value is outside the current phase's retention band. The current phase is kept while the value lies in `[P.min - h, P.max + h]`, and this retention wins when both apply. With several candidates, the first in array order is entered. The schema rejects specs where, for some phase Q and another phase P on one metric, Q's entry band minus P's retention band minus the entry bands of phases before Q (other than P) is empty, since Q could never be selected from P. It applies the same test with no current phase (initial selection). This accounts for first-match shadowing, which a pairwise band check alone would miss. Leaving the current band without entering another keeps the current phase (gaps are neutral).
- **Cycle tracking.** The engine keeps an index of the next expected phase. Entering the expected phase advances the index and records `entryT`. Entering the first phase when the index has reached the end completes the cycle and emits `rep` (unless it took less than `minRepMs`, when it is discarded). Entering any other phase restarts the cycle at that phase if it is the first phase, and otherwise discards the partial cycle.
- **Holds.** A hold condition is "current phase equals `hold.phase`". Condition time accumulates from the frame where it began. At `minMs` the engine emits `hold:start`, then `hold:tick` each `tickMs`. Leaving the phase emits `hold:end` with `released`. A gap in valid frames longer than `holdGapMs` emits it with `lost-pose`. The engine detects the gap from timestamps only: `advance(t)` (called by the pipeline when the source reports pose loss) and the first `push` after the gap both compare their `t` with the last valid frame's `t`. Whichever comes first emits the event once, with that `t` and a `durationMs` measured to the last valid frame. `advance(t)` changes nothing else (phase, reps, latches). Its only ROM effect is the trigger and reset caused by the `hold:end` it emits, when a `rom` definition uses `sampleOn: "hold:end"` and is ignored when `t` is not newer than the latest seen `t`. NaN frames are not valid frames, so a run of them also ends the hold through the next `push`.
- **Form rules.** A rule is violated when its metric is above `max` or below `min`. The violation timer starts on the first violating frame in an applicable phase. After `debounceMs` one warning is emitted and the rule is latched. The latch clears when the value is back inside bounds by the rule's hysteresis margin, in the metric's own unit: the rule's `hysteresis` if set, else `hysteresis` for angle metrics or `normHysteresis` for distance and offset. It clears at `value <= max - h` and `value >= min + h`. The schema rejects a rule whose margin leaves no clearable value.
- **ROM.** The engine tracks min and max of the metric since the last trigger. Triggers emit `rom:sample` and clear the extremes. This includes a `hold:end` emitted by `advance(t)` on pose loss.
- **NaN.** A `NaN` metric changes no state and clears nothing, except that the time gap counts toward `holdGapMs`.

## Fixture format

A fixture is a recorded or synthetic landmark clip. It is validated by a zod schema and is used by tests and by the apps' demo clip mode.

```json
{
  "version": 1,
  "id": "elbow-cycle-3reps",
  "description": "Synthetic left arm, 3 bend and extend cycles",
  "fps": 30,
  "landmarkCount": 33,
  "frames": [
    { "t": 0,  "l": [[0.5, 0.2, 0.0, 0.99], [0.52, 0.3, 0.0, 0.99]] },
    { "t": 33, "l": [[0.5, 0.2, 0.0, 0.99], [0.52, 0.3, 0.0, 0.99]] }
  ]
}
```

(The arrays above are shortened for display. Real frames hold all 33 `[x, y, z, visibility]` tuples.)

Rules: `t` is strictly increasing and starts at 0; every frame has exactly `landmarkCount` tuples; values are finite; visibility is in [0, 1]. Tuples keep the files small. The first committed fixture is generated by `scripts/make-fixture.ts` from synthetic poses, so no personal video or imagery is stored. Any later recorded fixture contains landmarks only, never pixels.

## Testing strategy

- **Runner.** Vitest, test files colocated as `*.test.ts`. `fast-check` for properties P1 to P24 in `requirements.md`, at 100 runs minimum.
- **Generators.** `src/testing/sequences.ts` builds value sequences for a spec: clean cycles (midpoint of each phase held several frames), noise bounded below `min(h, min over phases of (width / 2 - h))` so noisy midpoint samples stay in each phase's entry band, random walks, and `NaN` insertions. Engine properties run on metric values through synthetic frames built by a helper that places landmarks to produce a target angle, so the geometry layer is exercised as well.
- **Time.** Fixture player and engine take timestamps from frames, pose-lost notifications and an injected clock. No test uses real timers or `Date.now()`.
- **Golden test.** The committed fixture plus `elbow-cycle.json` must produce a fixed event list (3 reps, expected holds, ROM samples). It is stored inline in the test.
- **MediaPipe.** Tested with a mocked module and mocked `getUserMedia`. No model download happens in CI.
- **Apps.** Vitest + Testing Library smoke tests for the stubs (canvas has an accessible name, default demo mode, privacy text, keyboard-operable mode toggle).
- **Root scripts.** `npm run typecheck`, `npm test` and `npm run build` run each across all workspaces and are what CI executes.

## How an app plugs in

```ts
import { createPipeline, createFixturePlayer, createMediaPipeSource,
         parseMovementSpec, parseFixture, drawSkeleton } from 'marrow-core';
import specJson from './movements/my-movement.json';       // app-owned spec
import clipJson from 'marrow-core/fixtures/elbow-cycle-3reps.json';

const parsed = parseMovementSpec(specJson);
if (!parsed.ok) throw new Error(parsed.issues.map(i => `${i.path}: ${i.message}`).join('\n'));

const source = mode === 'demo'
  ? createFixturePlayer(parseFixture(clipJson), { loop: true })
  : createMediaPipeSource();

const pipeline = createPipeline({ source, spec: parsed.spec });
pipeline.on('rep', e => setReps(e.count));
pipeline.on('form:warning', e => showTip(e.message));
pipeline.onFrame(({ frame }) => drawSkeleton(ctx, frame, myStyle));
await pipeline.start();
```

An app adds a movement by adding a JSON spec in `apps/<app>/src/movements/`. It adds no engine code. The overlay, sounds, copy and theme belong to the app.

### Hello skeleton stubs

Both stubs are one screen: a canvas, a mode toggle (demo clip default, camera), a play/pause control, and the on-device privacy line. They call `createPipeline` with the core example spec and fixture and draw with `drawSkeleton`. They differ only by a small token set (colours, type size) in a CSS module, so the later specs can restyle them freely. The camera mode requests permission only after the user selects it.

## Decisions and trade-offs

- **Gaps between phases are neutral.** This keeps hysteresis simple and lets a movement cross a band without defining a phase for it. The cost is that a spec author must pick bands that the movement actually reaches.
- **Phases are an ordered cycle, not a graph.** A graph would be more general but harder to validate and to test. A linear cycle covers the planned movements (reps and holds).
- **Tuple fixtures.** Less readable than named objects but about 4 times smaller, which matters for files committed to the repo and shipped to the browser.
- **Lazy MediaPipe import.** Keeps the fixture-only path small and keeps tests free of WASM.
- **zod in core.** Required by the stack. It also gives path-based issues for free.
