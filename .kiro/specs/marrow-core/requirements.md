# Requirements: marrow-core

## Introduction

This spec covers the Marrow skeleton: the `packages/marrow-core` library, the npm-workspaces monorepo scaffold, and a thin "hello skeleton" stub in each of `apps/rattle-reps` and `apps/steady`. The stubs only render a live or demo skeleton overlay from the core. The real apps get their own specs later.

The core turns pose landmarks (live webcam or recorded fixture) into typed events, driven by a JSON movement spec. All processing is on-device. Nothing is uploaded.

Terms:

- **Landmark**: one normalised 3D point with a visibility score. MediaPipe Pose Landmarker produces 33 per frame.
- **Frame**: a timestamp in milliseconds plus the landmark array.
- **Metric**: a number derived from a frame (a joint angle, a normalised distance, or a normalised offset).
- **Phase**: a named band of one metric's values. A movement is an ordered list of phases.
- **Hysteresis**: a margin (in the metric's units) that a value must cross beyond a phase boundary before the engine changes phase.
- **Engine**: the deterministic finite state machine that runs a movement spec.

Out of scope for this spec: real app UIs, persistence, sound, PDF reports, accounts, servers.

## Requirements

### R1. Monorepo scaffold

**User story:** As a contributor, I want one repo with a shared toolchain, so that the core and both apps build and test together.

Acceptance criteria:

1. The repository SHALL be an npm workspaces monorepo whose workspaces are `packages/*` and `apps/*`.
2. The root `package.json` SHALL define `typecheck`, `test` and `build` scripts that run the matching script in every workspace.
3. All workspaces SHALL use TypeScript with `strict` enabled, extending one shared base tsconfig.
4. WHEN `npm run typecheck`, `npm test` and `npm run build` are run at the repo root on Node 22, THEN each SHALL exit with code 0.
5. The CI workflow in `.github/workflows/ci.yml` SHALL pass without modification to its command list.
6. Apps SHALL import the core only through the package name `marrow-core`, never through deep paths.
7. The repository SHALL contain no secrets and SHALL keep `/.kiro` committed.

### R2. Pose source interface

**User story:** As an app developer, I want live and recorded input behind one interface, so that the same pipeline runs with or without a camera.

Acceptance criteria:

1. The core SHALL export a `PoseSource` interface with `start()`, `stop()` and a subscription method that delivers `Frame` objects to a listener.
2. WHEN `start()` is called on a stopped source, THEN the source SHALL begin delivering frames.
3. WHEN `stop()` is called, THEN the source SHALL deliver no further frames and SHALL release its resources (camera tracks, timers, landmarker).
4. WHEN `start()` is called on a source that is already started, THEN the call SHALL be a no-op.
5. The listener unsubscribe function SHALL stop delivery to that listener only.
6. Every delivered frame SHALL carry a monotonically non-decreasing `t` in milliseconds.

#### R2a. MediaPipe webcam source

1. WHEN started, THEN the MediaPipe source SHALL request the camera with `getUserMedia`, load the Pose Landmarker from `@mediapipe/tasks-vision`, and run detection on each video frame.
2. IF camera permission is denied or no camera exists, THEN the source SHALL report a typed error (`camera-denied` or `camera-unavailable`) through an error channel and SHALL NOT throw from `start()`.
3. IF the model or WASM assets fail to load, THEN the source SHALL report a typed `model-load-failed` error.
4. WHEN no pose is detected in a video frame, THEN the source SHALL deliver no frame for it (it SHALL NOT deliver an empty landmark array).
5. The source SHALL NOT send video or landmarks over the network. The only network requests permitted are for the model and WASM assets.
6. The MediaPipe source SHALL be loaded lazily so that code paths that only use fixtures do not import `@mediapipe/tasks-vision`.

#### R2b. Fixture player source

1. The fixture player SHALL accept a validated fixture (see design, "Fixture format") and implement `PoseSource`.
2. WHEN started, THEN the player SHALL deliver the fixture's frames in order, each with the fixture's recorded `t` (offset by the start time if looping).
3. The player SHALL support `speed` (a positive multiplier) and `loop` options.
4. The player SHALL accept an injectable clock and scheduler, so that tests run it without real timers.
5. WHEN a fixture is invalid (schema mismatch, non-increasing timestamps, wrong landmark count), THEN loading SHALL fail with a descriptive error naming the offending field and frame index.
6. The player SHALL provide a synchronous `replay(fixture)` iterator for tests and for offline analysis that yields frames without timers.

### R3. Geometry

**User story:** As a rule author, I want reliable angle and distance metrics, so that thresholds mean the same thing for every body size and camera distance.

Acceptance criteria:

1. The core SHALL export `angleAt(a, b, c)` returning the angle at vertex `b` in degrees, in the closed range [0, 180].
2. WHEN `a` or `c` coincides with `b` (zero-length segment), THEN `angleAt` SHALL return `NaN` and SHALL NOT throw.
3. `angleAt(a, b, c)` SHALL equal `angleAt(c, b, a)`.
4. `angleAt` SHALL be invariant under translation, uniform scaling by a positive factor, and rotation of all three points.
5. WHEN `a`, `b`, `c` are collinear with `b` between them, THEN `angleAt` SHALL return 180 within 1e-6 degrees. WHEN `a` and `c` lie on the same ray from `b`, THEN it SHALL return 0 within 1e-6 degrees.
6. The core SHALL support 2D and 3D angle computation, selectable per metric (`plane: "xy" | "xyz"`).
7. The core SHALL export `distance(a, b)` and a `bodyScale(frame)` function that returns the torso length (mid-shoulder to mid-hip distance).
8. WHEN a metric is of kind `distance` or `offset`, THEN the engine SHALL divide it by `bodyScale(frame)` so that the result is independent of the subject's distance from the camera.
9. IF any landmark used by a metric has `visibility` below the spec's `minVisibility` (default 0.5), THEN the metric SHALL evaluate to `NaN` for that frame.
10. The core SHALL export a named-landmark index map (for example `LM.leftKnee`) so that specs refer to landmarks by name, not by number.

### R4. One-Euro smoothing

**User story:** As an app developer, I want jitter removed without noticeable lag, so that the overlay and the thresholds behave steadily.

Acceptance criteria:

1. The core SHALL export a `OneEuroFilter` configured by `minCutoff`, `beta`, `dCutoff` (derivative cutoff) with documented defaults.
2. WHEN a filter receives its first sample, THEN it SHALL return that sample unchanged.
3. WHEN the input is constant, THEN the output SHALL equal that constant.
4. The filter SHALL be deterministic: the same sequence of `(value, t)` inputs SHALL always produce the same outputs.
5. WHEN two consecutive samples have `t` not greater than the previous `t`, THEN the filter SHALL return the previous output and SHALL NOT produce `NaN` or `Infinity`.
6. WHEN the input is `NaN`, THEN the filter SHALL return `NaN` and SHALL keep its previous state.
7. The core SHALL export a `LandmarkSmoother` that applies one filter per landmark per axis, and whose output frames keep the input `t` and `visibility`.
8. The smoother SHALL be optional in the pipeline and configurable per pipeline, including a pass-through mode.

### R5. Movement spec schema

**User story:** As a rule author, I want to describe a movement as JSON and get clear errors when I get it wrong.

Acceptance criteria:

1. The core SHALL export a zod schema `MovementSpecSchema` and the inferred type `MovementSpec`.
2. The core SHALL export `parseMovementSpec(json: unknown)` that returns a typed result: either the validated spec or a list of issues, each with a JSON path and message. It SHALL NOT throw for invalid input.
3. A spec SHALL contain `version` (literal `1`), `id`, `name`, `metrics`, `phases`, and MAY contain `hysteresis`, `minVisibility`, `holds`, `formRules`, `rom`.
4. A metric SHALL be one of: `angle` (three named landmarks, optional `plane`), `distance` (two named landmarks), or `offset` (two named landmarks and an `axis` of `x` or `y`).
5. Landmark names SHALL be checked against the landmark name list. An unknown name SHALL be a validation issue.
6. A phase SHALL name one metric and a `min` and `max` bound. `min` SHALL be less than or equal to `max`.
7. Phase ids SHALL be unique. Every `holds`, `formRules` and `rom` reference to a metric or phase SHALL resolve, otherwise a validation issue SHALL be reported.
8. `hysteresis` SHALL be a non-negative number. A spec SHALL be rejected when hysteresis is greater than half of the narrowest phase width (it would make that phase unreachable).
9. Unknown top-level keys SHALL be rejected (strict objects) so that typos are caught.
10. Parsing then serialising then parsing a valid spec SHALL give an equal spec.
11. The core SHALL ship 1 or 2 example specs in `packages/marrow-core/specs/*.json`, and tests SHALL validate every file in that folder against the schema.
12. The core source SHALL contain no exercise-specific or app-specific names or logic outside of examples and fixtures.

### R6. Rules engine

**User story:** As an app developer, I want a deterministic engine that turns metrics into events, so that I only render UI and react.

Acceptance criteria:

1. The core SHALL export `createEngine(spec)` returning an engine with `push(frame)` that returns the events produced by that frame, and `reset()`.
2. The engine SHALL be a pure, deterministic state machine: its state and output SHALL depend only on the spec and the ordered sequence of frames pushed since the last `reset()`. It SHALL NOT read wall-clock time or random numbers.
3. The engine SHALL emit only the typed events listed in the design ("Event types"): `rep`, `phase`, `hold:start`, `hold:tick`, `hold:end`, `form:warning`, `rom:sample`.

#### R6a. Phases and hysteresis

1. WHEN the engine receives its first frame with a valid metric value, THEN it SHALL select the phase whose range contains the value and emit a `phase` event with `from: null`. IF no phase contains the value, THEN it SHALL stay in the `unknown` state and emit nothing.
2. WHILE in phase P, the engine SHALL remain in P as long as the value is within P's range widened by the hysteresis on both ends.
3. WHEN the value enters the range of a different phase Q shrunk by the hysteresis on both ends, THEN the engine SHALL transition to Q and emit one `phase` event with `from: P`, `to: Q`.
4. WHEN the metric is `NaN` (low visibility), THEN the engine SHALL hold its current state and SHALL emit nothing for that frame.
5. The engine SHALL emit at most one `phase` event per frame.

#### R6b. Reps

1. A spec's `phases` array SHALL define the rep cycle in order. WHEN the engine has visited every phase in array order and then returns to the first phase, THEN it SHALL emit one `rep` event and increment the rep count by one.
2. IF a transition skips a phase or goes against the array order (other than the return from the last phase to the first), THEN the engine SHALL discard the partial cycle and SHALL NOT emit `rep`.
3. A `rep` event SHALL carry the 1-based rep `count`, the cycle `durationMs`, and per-phase `entryT` timestamps.
4. The rep count SHALL never decrease except through `reset()`.
5. The spec MAY set `minRepMs`. WHEN a cycle completes faster than `minRepMs`, THEN the engine SHALL discard it as not a rep.

#### R6c. Holds

1. A `hold` definition SHALL name a phase (or a metric range) to be held, a `minMs`, and a `tickMs`.
2. WHEN the engine has been continuously in the hold condition for `minMs`, THEN it SHALL emit `hold:start` once, with the `t` at which the condition began.
3. WHILE a hold is active, the engine SHALL emit `hold:tick` every `tickMs` with `elapsedMs`, and no more than one tick per frame.
4. WHEN the hold condition stops being true (beyond hysteresis), THEN the engine SHALL emit `hold:end` with the total `durationMs` and a `reason` of `released` or `lost-pose`.
5. WHEN no valid frame arrives for longer than the spec's `holdGapMs` (default 500 ms), THEN an active hold SHALL end with reason `lost-pose`.
6. WHEN the condition is true for less than `minMs`, THEN no hold events SHALL be emitted.

#### R6d. Form warnings

1. A `formRule` SHALL have an `id`, a `message`, a metric condition (`min` and/or `max`), an optional list of phases in which it applies, and a `debounceMs`.
2. WHEN a rule's condition is violated for at least `debounceMs` while in an applicable phase, THEN the engine SHALL emit one `form:warning` carrying the rule `id`, `message`, the offending `value` and the `t`.
3. The engine SHALL NOT emit the same rule again until the condition has been satisfied (beyond hysteresis) and then violated again. A rule SHALL NOT repeat on every frame.
4. WHEN a metric is `NaN`, THEN form rules using it SHALL be neither raised nor cleared for that frame.

#### R6e. ROM sampling

1. A `rom` definition SHALL name a metric and a `sampleOn` mode of `rep`, `hold:end` or `phase:<id>`.
2. WHEN the sample trigger occurs, THEN the engine SHALL emit one `rom:sample` carrying the metric name, the `min` and `max` values observed since the previous trigger, and the `t`.
3. Observed extremes SHALL ignore `NaN` values.
4. Reset SHALL clear the observed extremes.

### R7. Pipeline wiring

**User story:** As an app developer, I want one call that wires source, smoothing and engine.

Acceptance criteria:

1. The core SHALL export `createPipeline({ source, spec, smoothing })` that subscribes to the source, smooths landmarks, pushes frames to the engine and dispatches events to typed listeners (`on('rep', fn)` and so on).
2. The pipeline SHALL also expose each processed frame (smoothed landmarks plus current metric values) to a frame listener, so that an app can draw the overlay.
3. The pipeline SHALL work identically for the MediaPipe source and the fixture player.
4. `pipeline.stop()` SHALL stop the source and remove all listeners.

### R8. Skeleton overlay helper

**User story:** As an app developer, I want a ready connection list and a canvas draw helper so that both apps can show the skeleton.

Acceptance criteria:

1. The core SHALL export `POSE_CONNECTIONS` (pairs of landmark indices) and a framework-agnostic `drawSkeleton(ctx, frame, style)` helper that draws onto a `CanvasRenderingContext2D`.
2. `drawSkeleton` SHALL skip landmarks below `minVisibility` and SHALL NOT throw when given an empty frame.
3. Style (colours, line width, joint radius) SHALL be passed in by the caller. The core SHALL NOT hard-code app themes.

### R9. Hello skeleton stubs

**User story:** As a judge, I want to open each app and see the skeleton move, with or without a camera.

Acceptance criteria:

1. `apps/rattle-reps` and `apps/steady` SHALL each be a Vite + React 18 + TypeScript app that builds to a static site and honours `VITE_BASE`.
2. Each stub SHALL render a canvas that draws the skeleton overlay using `marrow-core`.
3. Each stub SHALL offer a "demo clip" mode that replays a core fixture through the pipeline without a camera, and a "camera" mode that uses the MediaPipe source.
4. The default mode on first load SHALL be the demo clip, so that the page works with no camera and no permission prompt.
5. Each stub SHALL show the text that processing happens on-device and that no video is uploaded.
6. Each stub SHALL respect `prefers-reduced-motion` (no autoplay loop animation beyond the demo clip's own playback, and an explicit play control).
7. Each stub SHALL include an accessible name for the canvas and keyboard-operable mode controls.
8. The stubs SHALL contain no workout or physio logic. Their theme SHALL differ only by a minimal token set, to be replaced in the real app specs.

### R10. Correctness properties (fast-check)

Property-based tests SHALL be written with `fast-check` and run under Vitest. Each property below SHALL be a test with at least 100 runs, and the seed of a failing run SHALL be printed by the runner.

**Angle math**

- **P1 (range):** for any finite points where `a` and `c` differ from `b`, `angleAt` is in [0, 180].
- **P2 (symmetry):** `angleAt(a, b, c) = angleAt(c, b, a)`.
- **P3 (rigid and scale invariance):** `angleAt` is unchanged (within 1e-6) by translation, rotation about any axis, and positive uniform scaling.
- **P4 (collinear anchors):** opposite-side collinear points give 180, same-side give 0, and perpendicular segments give 90 (each within 1e-6).
- **P5 (normalisation):** a normalised distance metric is unchanged by uniform scaling of the whole frame.

**Smoothing**

- **P6 (constant fixed point):** a constant input gives the same constant output for any valid configuration.
- **P7 (boundedness):** for any finite input sequence with increasing `t`, every output lies within the [min, max] of the inputs so far.
- **P8 (finite):** for any input sequence, including repeated or decreasing `t`, no output is `Infinity` (and no output is `NaN` unless the input was).
- **P9 (jitter reduction):** for a constant signal plus zero-mean bounded noise, the output's peak-to-peak range is not larger than the input's.
- **P10 (determinism):** running the same sequence through two fresh filters gives identical output.

**Rules engine**

- **P11 (rep monotonic):** for any generated frame sequence, the `count` in successive `rep` events is strictly 1, 2, 3, ... and the engine's rep count never decreases between pushes.
- **P12 (phase order):** for any generated sequence, between two consecutive `rep` events the `phase` events visit every phase in array order. Equivalently, a sequence that never visits some phase yields zero reps.
- **P13 (sub-hysteresis noise):** starting in a phase with the base value at least `hysteresis` inside the phase range, any noise of amplitude strictly less than `hysteresis` produces zero `phase` events after the first and zero `rep` events.
- **P14 (full cycles):** a generated sequence of N clean cycles (each phase's midpoint value held for several frames, at a pace above `minRepMs`) yields exactly N `rep` events, regardless of frame rate and of added sub-hysteresis noise.
- **P15 (deterministic replay):** replaying one fixture twice through fresh engines, and once through the fixture player and once through `replay()`, gives deeply equal event lists.
- **P16 (reset):** after `reset()`, replaying a sequence gives the same events as on a fresh engine.
- **P17 (NaN neutrality):** inserting frames whose metrics are `NaN` anywhere in a sequence does not change the rep count.
- **P18 (hold bounds):** every `hold:end.durationMs` is at least `minMs`, ticks are spaced at least `tickMs` apart, and every `hold:start` is matched by at most one `hold:end`.
- **P19 (form debounce):** a violation shorter than `debounceMs` never produces `form:warning`, and a continuous violation produces exactly one.

**Schema**

- **P20 (round trip):** for any generated valid spec, `parse(serialise(parse(spec)))` equals `parse(spec)`.
- **P21 (no throw):** `parseMovementSpec` never throws for arbitrary JSON values.
