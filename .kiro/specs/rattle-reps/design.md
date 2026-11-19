# Design: rattle-reps

Requirement numbers (R) and property numbers (P) refer to `requirements.md`.

## 1. Overview

Rattle Reps is a Vite + React 18 + TypeScript single-page app. All app logic that can be pure is pure (summary, streak, circuits, screen reducer, storage codec), so it is tested with fast-check and Vitest without a DOM. React components are thin. The pose pipeline comes from `marrow-core` and is reached only through the `marrow-core` entry (R4.5, R20.2).

```
 picker -> mode -> session -> summary -> (picker | again | next)
    |                 ^  |
    v                 |  v
 history        circuit rest   circuit summary
```

```
PoseSource (fixture player | MediaPipe)
   -> createPipeline(spec)  -> events (rep, phase, hold:*, form:warning)
        |                         |
        | onFrame                 v
        v                   session controller (event log + live view state)
   canvas overlay                 |             |
   (drawSkeleton + rattle)        v             v
                           HUD / cues      summarize(events) -> SetResult -> storage
```

The core already provides the pipeline, engine, fixture player and skeleton drawing. The app adds: movement specs and presentation data, demo fixtures and their generator, summary math, streak math, circuit sequencing, storage, and the UI.

## 2. Module layout

All paths are under `apps/rattle-reps/`.

```
scripts/make-fixtures.ts        generates src/fixtures/*.json (synthetic poses)
src/
  main.tsx, App.tsx             mount, screen switch, providers
  movements/
    squat.json push-up.json lunge.json jumping-jack.json plank.json
    registry.ts                 the only importer of the JSON files; parse + WorkoutDef table
    workouts.ts                 presentation data per movement (cues, voice lines, targets)
    movements.test.ts           every spec parses, rules present, ids match file names
  fixtures/
    squat.json ... plank.json   committed demo clips (generated)
    index.ts                    the only importer of the fixture JSON; parseFixture on load
    fixtures.test.ts            committed == generated; replay expectations per movement
  circuits/
    presets.ts                  preset circuits (data)
    sequencer.ts                pure reducer: circuit state machine
    sequencer.test.ts
  summary/
    summarize.ts                pure: events -> SetSummary
    summarize.test.ts           examples + P1 to P11
  streak/
    dayKey.ts                   pure: epoch + offset -> day key; weekStart(dayKey)
    streak.ts                   pure: entries + today -> { current, longest, ... }
    streak.test.ts              examples + P12 to P22
  storage/
    codec.ts                    pure: encode/decode/validate versioned records, capHistory
    store.ts                    idb-keyval wrapper with in-memory fallback
    storage.test.ts             P32, P33, with fake-indexeddb
  session/
    screenReducer.ts            pure: screen state machine (R14)
    useSession.ts               hook: pipeline wiring, event log, live view state
    sourceFactory.ts            demo vs camera PoseSource creation (lazy camera)
    cues.ts                     pure: MarrowEvent -> UI cue (text, kind, ttl)
    pausableSource.ts           camera pause: PoseSource wrapper that drops frames while paused and shifts t
    pausableClock.ts            demo pause: Clock for createFixturePlayer that suspends and resumes its timer
    depthCheck.ts               pure: rom:sample -> per-rep shallow-depth warning (section 3)
  ui/
    Picker.tsx Mode.tsx Session.tsx Summary.tsx CircuitSummary.tsx History.tsx
    SkeletonCanvas.tsx Counter.tsx CueBar.tsx Effects.tsx Toggles.tsx
    *.module.css
  audio/
    sound.ts                    WebAudio bone-rattle synth, created on first explicit unmute
    voice.ts                    speechSynthesis wrapper
  theme/
    tokens.ts                   token values for contrast tests
    useReducedMotion.ts
  global.css                    CSS custom properties, base styles
```

Dependency direction: `ui` depends on `session`, `summary`, `streak`, `storage`, `circuits`, `movements`. The pure modules (`summary`, `streak`, `circuits`, `storage/codec`, `session/screenReducer`, `session/cues`) import nothing from React or the DOM. Only `types` from `marrow-core` are imported by pure modules.

## 3. Movement specs (R1)

Specs are plain `MovementSpec` JSON (see `docs/movement-spec.md`). Landmark names and metric kinds are those of the core. The camera is assumed to be roughly front-on for squat, jumping jack and plank-from-the-side as noted below. The thresholds below are starting values. The implementation task tunes them against the synthetic fixtures and checks them for sanity, and the spec test only requires that files parse and contain the required rules.

Core facts used: a rule applies when a metric is outside `[min, max]`, only in the listed phases, for `debounceMs`, and then warns once until the value is compliant by `hysteresis`. Phases are ordered and a rep is one pass through them back to the first. Angle metrics are in degrees, `distance` and `offset` metrics in torso units. The sign convention of `offset` (first point minus second, or the reverse) is checked against `engine/metrics.ts` in the movement task and recorded in the file comment of the test.

| Movement | Kind | Phases (metric) | Form rules |
| --- | --- | --- | --- |
| squat | reps | `standing` knee angle 150 to 180, `bottom` knee angle 40 to 115 (`leftHip`,`leftKnee`,`leftAnkle`) | `knees-caving`: knee distance (`leftKnee`,`rightKnee`) min about 0.35 in `bottom`, "Push your knees out". `shallow-depth`: knee angle max 100 in `bottom`, "Sink a little deeper". |
| push-up | reps | `up` elbow angle 150 to 180, `down` elbow angle 40 to 110 (`leftShoulder`,`leftElbow`,`leftWrist`) | `hips-sagging`: body line angle (`leftShoulder`,`leftHip`,`leftAnkle`) min about 165 in both phases, "Lift your hips". `shallow-depth`: elbow angle max 90 in `down`, "Go a bit lower". |
| lunge | reps | `standing` front knee angle 150 to 180, `bottom` front knee angle 60 to 115 (`leftHip`,`leftKnee`,`leftAnkle`) | `knee-past-ankle`: x offset (`leftKnee`,`leftAnkle`) max about 0.25 in `bottom`, "Keep knee over ankle". `torso-lean`: x offset (`leftShoulder`,`leftHip`) max about 0.3 in `bottom`, "Stay tall". |
| jumping jack | reps | `closed` feet distance (`leftAnkle`,`rightAnkle`) 0 to 0.7, `open` feet distance 1.3 to 3 | `arms-low`: y offset (`leftWrist`,`leftShoulder`) bound in `open`, "Reach overhead". `feet-narrow`: feet distance min about 1.4 in `open`, "Jump wider". |
| plank | hold | `off` body line angle 0 to 150, `plank` body line angle 160 to 180 (`leftShoulder`,`leftHip`,`leftAnkle`); hold `plank-hold` in `plank`, `minMs` 1000, `tickMs` 500 | `hips-sagging`: y offset (`leftHip`,`leftShoulder`) max in `plank`, "Lift your hips". `hips-piking`: the same offset, min bound, "Lower your hips". |

Notes:

- The lunge spec tracks the left leg as the front leg. The UI says "left foot forward" and the demo clip uses it. Alternating legs are out of scope.
- The plank is filmed from the side. The `off` and `plank` phases exist because a spec needs at least two phases. Reps of the plank spec are ignored by the app. The app reads `hold:*` events only.
- Each spec uses `minRepMs` (for example 700 ms for squats) to drop bounces, `minVisibility` 0.5, and `debounceMs` of 250 to 400 ms on rules so that fast passes through a depth do not warn.
- Rules for shallow depth rely on the `bottom` phase band being wider than the "good depth" bound. A shallow rep still counts as a rep, and is flagged, which is what the clean-rep percentage measures.
- Shallow depth across repeated reps. The core latches a warning and clears it only when the metric is compliant by the hysteresis. Leaving the rule's phase does not clear it. For consecutive shallow squats that alternate between about 105 degrees at the bottom and 170 degrees standing, the value never reaches `max - hysteresis` (about 95), so the core emits `shallow-depth` for the first shallow rep only. The core cannot be changed in this feature, so the app adds a per-rep depth check. The squat and push-up specs declare `rom: [{ "metric": <depth metric>, "sampleOn": "rep" }]`. At each `rep` the core emits a `rom:sample` (same `t` as the `rep`) whose `min` is the smallest angle reached during that rep. `session/depthCheck.ts` holds the per-workout bound (squat 100, push-up 90, the same numbers as the rules, which stay in the JSON so the first shallow rep still gets an immediate cue). For each `rom:sample` of a depth metric with `min` greater than the bound, if no `form:warning` with the rule id `shallow-depth` has `t` in the current rep window `(previous rep t, this t]`, the app synthesizes `{ type: 'form:warning', t: sample.t, ruleId: 'shallow-depth', message, value: min }`. The synthesized event goes through the same path as core events (event log, cue, voice, summary). Result: every shallow rep has exactly one `shallow-depth` warning in its window, whether the core emitted it or the app did. A synthesized warning is emitted at the end of the rep, so its cue arrives slightly later than a core one. The same function is applied in replay tests so that fixtures and live sessions agree.
- The 2D pose is only an approximation. The thresholds are about "obviously bad" form, not coaching precision. The UI says "form hints, not medical advice" on the mode screen.

`movements/registry.ts` reads each JSON through `parseMovementSpec` and throws at startup in tests (and logs in production) if one fails. It exports `WORKOUTS: readonly WorkoutDef[]` and `getWorkout(id)`.

### Data models

```ts
type Target = { kind: 'reps'; reps: number } | { kind: 'hold'; seconds: number };

interface WorkoutDef {
  id: string;                    // equals spec.id and the file name
  name: string;
  kind: 'reps' | 'hold';
  spec: MovementSpec;            // from parseMovementSpec
  defaultTarget: Target;
  holdId?: string;               // hold workouts: id of the hold in the spec
  phaseCues: Record<string, string>;  // phase id -> cue text ("Down", "Stand tall")
  ruleVoice?: Record<string, string>; // rule id -> spoken line, falls back to the rule message
  fixtureId: string;
  blurb: string;
}

interface CircuitStep { movementId: string; target: Target; restSec: number }
interface Circuit { id: string; name: string; blurb: string; steps: CircuitStep[] }

interface WarningTally { ruleId: string; message: string; count: number }
interface SetSummary {
  movementId: string;
  kind: 'reps' | 'hold';
  reps: number;               // 0 for hold workouts
  cleanReps: number;
  cleanPct: number;           // integer 0..100; 0 when nothing to measure
  holdMs: number;             // 0 for rep workouts
  tutMs: number;
  warnings: WarningTally[];
}

interface HistoryEntry extends SetSummary {
  id: string;                 // crypto.randomUUID or time-based fallback
  circuitId?: string;
  mode: 'camera' | 'demo';
  startedAt: number;          // epoch ms
  day: string;                // day key YYYY-MM-DD, local
}
```

`cleanPct` is always a number. `summarize` returns 0 when there is nothing to measure (R9.4), and the UI shows "n/a" when `reps === 0 && holdMs === 0`.

## 4. Demo fixtures (R3, R4)

`scripts/make-fixtures.ts` follows `packages/marrow-core/scripts/make-fixture.ts`:

- Runs under plain Node type stripping (`node scripts/make-fixtures.ts`), with MediaPipe indices kept local.
- Imports only the type `Fixture` from `marrow-core` (a type import, erased at runtime) and Node built-ins. It never imports from `marrow-core/` sub-paths and never reads recorded video.
- Builds a 33-point rig for each movement from joint angles over time (a small kinematic model: torso, hips, knees, ankles, shoulders, elbows, wrists), rounds to 4 decimals, and writes compact JSON with one frame per line. It exports `generateFixtures(): Record<string, Fixture>` and `serializeFixture(fx)`.
- Is exposed as `npm run make-fixtures -w apps/rattle-reps` (script `node scripts/make-fixtures.ts`).

Each clip is 15 to 30 s at 20 fps and tells a small story so that the demo shows the warning cue:

| Fixture | Content | Expected events (asserted) |
| --- | --- | --- |
| squat | 6 reps: 3 clean, 1 with knees caving, 2 consecutive shallow (bottom about 105 degrees, standing about 170 degrees) | 6 `rep`. Core events: `knees-caving` once, `shallow-depth` once (first shallow rep only, because of the latch). After `depthCheck`: `shallow-depth` twice, one in each shallow rep window, so `cleanReps` is 3 |
| push-up | 6 reps: 3 clean, 1 with sagging hips, 2 consecutive shallow (bottom about 100 degrees elbow) | 6 `rep`. Core: `hips-sagging` once, `shallow-depth` once. After `depthCheck`: `shallow-depth` twice, `cleanReps` is 3 |
| lunge | 5 reps: 4 clean, 1 with the knee past the ankle | 5 `rep`, warning `knee-past-ankle` |
| jumping-jack | 8 reps, 1 with low arms | 8 `rep`, warning `arms-low` |
| plank | 20 s hold with a brief sag at about 12 s | one `hold:start`, `hold:tick`s, one `hold:end` (`released`), warning `hips-sagging` |

Exact counts are fixed by the generator and asserted in `fixtures.test.ts`. If tuning changes them, the test constants change together with the generator in the same task.

`fixtures.test.ts` does three things for every movement: (1) the committed file equals `serializeFixture(generate(...))` byte for byte, (2) `parseFixture` accepts it, (3) `replay(fixture)` through `createEngine(spec)`, with the events passed through `depthCheck`, yields the expected rep or hold counts and warning rule ids and counts (including the consecutive shallow reps above), twice with deeply equal results (P35). The test also asserts the raw core output (one `shallow-depth`), so a future core change that re-arms rules is noticed.

`fixtures/index.ts` imports each JSON, validates with `parseFixture` once, and exports `getFixture(movementId)`. It is the only module that imports fixture JSON. A repo test greps `src/` and `scripts/` for the pattern `from 'marrow-core/` and for `marrow-core/(fixtures|specs)` and fails on any match (R4.6).

Why not reuse the core fixtures: the core ships only an elbow example, and the structure steering says apps import only the public entry. The app owns the clips that match its own specs.

## 5. Session controller (R3, R5 to R9, R14)

`useSession(options)` is the only place that touches the pipeline.

Inputs: `workout: WorkoutDef`, `mode: 'camera' | 'demo'`, `target: Target`, `video` and `canvas` refs.

Steps:

1. `sourceFactory.create(mode, workout)`:
   - demo: `createFixturePlayer(getFixture(workout.id), { loop: false })`. For a hold or rep clip that ends before the target is reached, the set ends at the clip end.
   - camera: dynamic `import()` of the module that calls `createMediaPipeSource({ video })`, so the camera path is a separate chunk (R21.4). Secure-context and `navigator.mediaDevices` are checked first (R21.6).
2. `createPipeline({ source, spec: workout.spec })`. Subscribe with `on('rep' | 'phase' | 'hold:start' | 'hold:tick' | 'hold:end' | 'form:warning')`, `onFrame` for drawing, and the source's `onError` for failures (R3.7).
3. Every event is appended to an event log (`MarrowEvent[]`) and mapped to a `Cue` by `cues.ts`. The log and the start and stop times feed `summarize`.
4. The set ends on: the target reached (R5.4), the fixture ending, or the user pressing Stop. The controller calls `pipeline.stop()`, and closes any open hold at the stop time (R9.5). The controller also subscribes to `rom:sample`, and passes it through `depthCheck` like every other event. The core's `enter` emits `rep` before the same-`t` `rom:sample`, and `pipeline.ts` looks up listeners per dispatched event, so calling `pipeline.stop()` from the rep handler would drop the `rom:sample` and lose the synthetic `shallow-depth` warning of a final shallow rep (R1.14). Therefore the target-reaching `rep` does not stop the pipeline. It records `pendingEnd = { t: rep.t }`, and the controller ends the set (stop the pipeline, set `stopT = rep.t`, call `summarize`) in the first of: (a) a `rom:sample` with `t >= pendingEnd.t` has been processed, so its synthesized warning is already in the event log, or (b) the end of the current synchronous frame dispatch (a `queueMicrotask` scheduled by the rep handler), for movements whose spec has no depth `rom` entry. Events that arrive between the rep and the end of the set are appended to the log as usual, and the rep counter and cues stop updating once `pendingEnd` is set. The Stop button and the fixture end need no deferral, because the controller stops them at a frame boundary.
5. Pause (R19.5): the core's fixture player rewinds on `stop()` and `pipeline.stop()` removes listeners, so pause cannot be stop and start. The two sources need different mechanisms, because a live camera keeps producing frames while a fixture player keeps advancing its own frame index and timer regardless of listeners. Dropping the demo player's frames would discard that part of the clip, and pausing through the remaining clip would consume the whole fixture.
   - Camera: `session/pausableSource.ts` wraps the `PoseSource` (public type only). While paused it drops frames. After resume it subtracts the paused time from every frame `t`, so timestamps stay increasing, and paused time never enters a `durationMs` or TUT. A pose-lost notification while paused is dropped. A rep in progress simply continues after resume. The wrapper takes `holdGapMs` (from `workout.spec`) and `isHoldActive(): boolean`, which the controller answers from its event log (a `hold:start` without a later `hold:end`). The core's `gapCheck` compares only the incoming `t` with the last valid frame `t` and does not read the wall clock, so removing the whole pause would leave a one-frame gap and the hold would continue. To make "Pause ends the current hold" true, `pause()` records `holdOpenAtPause = isHoldActive()`. On `resume()`, if `holdOpenAtPause` is true, the wrapper picks the offset for the first frame after resume so that its shifted `t` equals `lastDeliveredT + holdGapMs + 1`, where `lastDeliveredT` is the shifted `t` of the last frame passed on before the pause. The core then ends the hold with `lost-pose` on that frame (`gapCheck` sees a gap above `holdGapMs`, and the core's `durationMs` stops at the last valid frame before the pause). The offset applies to all later frames, so timestamps stay strictly increasing and the injected gap is the only paused time that remains visible, and it is never counted in a `durationMs` or TUT (R9.5, R9.6). If no hold was open at pause, the whole pause is subtracted. After the `lost-pose` end, a new hold can start on later valid frames as usual. The UI says "Pause ends the current hold" in camera mode.
   - Demo clip: the app does not wrap the demo source. `createFixturePlayer(fixture, { clock })` accepts an injectable `Clock` (exported type from `marrow-core`), so `session/pausableClock.ts` provides a `Clock` that can be suspended. On `pause()` it clears the pending timer and records the remaining delay (`due time - now`, never below 0). On `resume()` it schedules the same callback with the remaining delay. While suspended, `setTimeout` calls (none are expected, since the player schedules only after a delivery) are queued and started on resume. The player therefore stops advancing its frame index during the pause and continues from the next undelivered frame, so no part of the clip is lost. Frame `t` values are the recorded ones, with no shifting, and no frames are dropped. The clip cannot end while paused. A hold open at pause continues after resume without a `lost-pose`, because the next frame follows the last one by the normal recorded interval, so the "Pause ends the current hold" note is not shown in demo mode.
   - `useSession` holds a `pause()` and `resume()` pair chosen by `sourceFactory` for the mode (the wrapper's controls for camera, the clock's for demo) and sets `status` to `paused` and back. Circuit steps in demo mode create a new player and a new clock per step, so a pause never carries over to the next step.
6. Cleanup on unmount stops the pipeline, cancels the animation frame loop, cancels speech, and closes the audio context if one was created (R14.6).

Live view state (`useReducer`): `reps`, `holdElapsedMs`, `phase`, `cue`, `poseLost`, `status` (`starting | running | paused | ended | error`). The reducer is pure, driven by the same `MarrowEvent`s.

Pose-lost detection (R6.6): a timer compares the time since the last frame, and shows the cue after 2 s.

Camera video: the `<video>` element is passed to the source and hidden by default (R8.7). A "Show my video" toggle sets a CSS class that reveals it behind the canvas. Frames are never copied to canvas or storage.

## 6. Summary math (R9)

`summarize(input): SetSummary`, where

```ts
interface SummaryInput {
  workout: Pick<WorkoutDef, 'id' | 'kind'>;
  events: readonly MarrowEvent[];   // in arrival order
  startT: number;                   // timestamp of the first frame of the set
  stopT: number;                    // timestamp at which the set ended
}
```

All times are in the event timestamp domain (the `t` of the core), so the function needs no clock.

Definitions:

- `reps` = `count` of the last `rep` event, else 0 (rep workouts). Hold workouts: `reps = 0`.
- Rep windows: for the k-th rep event at time `t_k`, the window is `(t_{k-1}, t_k]` with `t_0 = startT`, but a warning whose time equals `startT` belongs to the first window, so the first window is `[startT, t_1]`. A warning at time `w` belongs to the window with the smallest `k` such that `w <= t_k`, if `w >= startT`. A warning with `w > t_last` belongs to no window.
- Warnings include the ones synthesized by `depthCheck` (section 3), so persistent shallow reps are not counted as clean. `summarize` takes the already merged event list and stays unaware of where a warning came from.
- `cleanReps` = number of windows with no warning. `cleanPct = reps > 0 ? round(100 * cleanReps / reps) : 0`.
- TUT, rep workouts = sum of `durationMs` over `rep` events. This counts only time actually spent moving through a rep and ignores pauses between reps. It is explained in the UI as "time under tension".
- TUT, hold workouts = sum of `hold:end.durationMs`, plus `stopT - start` for a `hold:start` without a matching `hold:end` (never below 0). `holdMs` equals this sum.
- Hold interval: a completed hold, from a `hold:start` at `s` and its `hold:end`, is `[s, s + durationMs]`, not `[s, end.t]`. For `lost-pose` the core's `hold:end.t` is the time the loss was detected, which can be later than the end of the measured hold (for example, a hold starting at 0 that emits its end at 2000 with `durationMs: 1200`, as in `engine.test.ts` lines 540 to 544). A hold with no `hold:end` is `[s, stopT]` (never empty or reversed: if `stopT < s` it is empty). The sum of the interval lengths equals `holdMs`.
- Hold clean share: the union of intervals `[w, w + 2000)` for each warning `w`, clipped to each hold interval. A warning whose time is outside every hold interval (including between `s + durationMs` and the end event time of a `lost-pose` hold) adds no dirty time, but is still counted in `warnings`. `cleanPct = round(100 * (holdMs - unionLength) / holdMs)` for `holdMs > 0`, else 0. Example: a hold starting at 0, ending with `lost-pose` at `t = 2000` with `durationMs = 1200`, and a warning at 1000. The hold interval is `[0, 1200]`, the dirty part is `[1000, 1200]` = 200 ms, and `cleanPct = round(100 * 1000 / 1200) = 83`. Clipping to `[0, 2000]` instead would give 1000 ms dirty and 17%, which is wrong.
- `warnings`: group `form:warning` events by `ruleId`, keep the first `message`, count them, sort by count descending then by `ruleId`. The sum of counts equals the number of warning events (P11).

The function does not mutate its inputs (P8). Rounding is `Math.round`, so exact halves round up; tests use integer results from the generator so that the expected value is computed independently with integer arithmetic.

Streak qualification (R12.1) lives in `streak/streak.ts` as `qualifies(entry)`: `mode === 'camera'` and (`kind === 'reps' ? reps >= 5 : holdMs >= 10000`). The constants are exported.

## 7. Streak (R12)

### Day keys and weeks

- `toDayKey(epochMs, offsetMinutes)` returns `YYYY-MM-DD` for the local date, where `offsetMinutes` is `-new Date(epochMs).getTimezoneOffset()` at runtime. The function is pure and tested with fixed offsets (P34). The runtime captures the day key once when the set is saved, so the entry keeps the local date it happened on even if the user travels or the timezone changes.
- A day key is converted to a day number with `Date.UTC(y, m - 1, d) / 86400000`. All calendar arithmetic uses this integer, which is independent of the host timezone and daylight saving (P13).
- `weekStart(day)`: the day minus `(weekday + 6) % 7` days, where `weekday` is `getUTCDay()` (0 = Sunday), returned as a day key. The week index is `Math.floor((dayNumber + 3) / 7)`. Day number 0 is Thursday 1970-01-01, so Monday is day 4 and the index increases on each Monday (day 3 is a Sunday with index 0, day 4 a Monday with index 1). Consecutive weeks have consecutive integer indexes, so "consecutive" means the index differs by 1. This avoids month and year boundary code (P22).
- Decision: **weeks start on Monday and use the local calendar date**. This is the ISO week convention and matches how most users think of a "week". It is not configurable in this spec.

### Algorithm

```
streak(entries, today):
  weeks = sorted distinct set of weekIndex(e.day) for e where qualifies(e) and e.day <= today
  cur   = weekIndex(today)
  anchor = weeks has cur ? cur : (weeks has cur - 1 ? cur - 1 : none)
  current = anchor none ? 0 : length of the run of consecutive weeks in `weeks` ending at anchor
  longest = longest run of consecutive indexes in `weeks`
  return { current, longest, thisWeekQualified: weeks has cur, weeksActive: weeks.size }
```

Day key strings compare correctly with `<=` because they are zero-padded `YYYY-MM-DD`. `today` is passed in, so the function is pure and tests control it. Entries with future day keys are dropped before the week set is built (R12.9, P21). Duplicates collapse because `weeks` is a set (P18).

When a set is saved, the app computes the streak before and after adding it. If `before.thisWeekQualified` is false and `after.thisWeekQualified` is true, the summary shows the streak celebration (R12.8, R9.11).

## 8. Circuit sequencing (R10)

A pure reducer in `circuits/sequencer.ts`:

```ts
type SeqState =
  | { phase: 'work'; index: number; results: StepResult[] }
  | { phase: 'rest'; index: number; results: StepResult[] }   // index = step just finished
  | { phase: 'done'; results: StepResult[] };

type SeqAction =
  | { type: 'setEnded'; summary: SetSummary }  // work -> rest or done
  | { type: 'skipStep' }                        // work -> rest or done, no result summary
  | { type: 'restEnded' }                       // rest -> work(index + 1)
  | { type: 'skipRest' };                       // same as restEnded

type StepResult = { index: number; movementId: string; summary: SetSummary | null }; // null = skipped
```

`init(circuit)` returns `{ phase: 'work', index: 0, results: [] }`. `step(circuit, state, action)` is total: an action that does not apply returns the same state object (P27). After the last step, `setEnded` and `skipStep` go straight to `done`, so there is no rest after the last step (P25). The index only increases (P24) and `done` ignores every action (P26). The number of transitions to finish N steps is N work ends plus N-1 rest ends, which is `2N - 1` (P28).

Rest countdown: the UI owns a timer that dispatches `restEnded` when the countdown reaches zero. The reducer has no timers. A pure `restSecondsLeft(startedAt, now, restSec)` helper is used for the countdown display, and the aria-live text announces only "Rest, 20 seconds" at the start and "Next: Push-up" at the end (R10.8).

Presets (`presets.ts`): "Spooky Starter" (squat 10, push-up 5, plank 20 s, rest 20 s), "Graveyard Cardio" (jumping jack 20, lunge 8, jumping jack 20), and "Full Skeleton" (all five movements). Values are data and are validated by P30 and a registry-reference test.

## 9. Storage (R11)

- `idb-keyval` with `createStore('rattle-reps', 'kv')` (database `rattle-reps`, object store `kv`).
- Keys: `history` (a versioned record) and `settings` (a versioned record).
- Record shape: `{ v: 1, data: ... }`. `history.data` is `HistoryEntry[]` (oldest first). `settings.data` is `{ voice: boolean; sound: boolean; showVideo: boolean; lastMode?: 'camera' | 'demo' }`.
- `codec.ts` is pure: `decodeHistory(unknown): HistoryEntry[]` validates every entry by hand (types, ranges, `mode`, a `YYYY-MM-DD` day), drops invalid entries, and returns `[]` for unknown versions or shapes. `decodeSettings` returns defaults (all `false`) when anything is invalid, so sound is muted (R7.8). `appendHistory(list, entry)` applies the cap of 500 and keeps the newest (P32). `decodeHistory` never throws (P33). The app does not add `zod` as a dependency, to keep the app lean. The core's zod is not part of its public entry.
- `store.ts` exposes `loadHistory`, `addEntry`, `loadSettings`, `saveSettings`, `clearAll`. Each wraps idb-keyval in try/catch. On the first failure it switches to an in-memory backend and exposes `persistent: false`, which the UI shows as a notice (R11.4).
- Write path for `addEntry`: read, decode, append, cap, write. Calls are serialized through a promise chain so that two quick saves cannot overwrite each other.
- Migration: version 1 is the first version. A future version bumps `v` and adds a `migrate` step in `codec.ts`. An unknown higher version is ignored but not deleted, so a newer tab's data is not destroyed. The app only overwrites history when it successfully decoded or when none exists. If decoding found an unknown version, the app uses in-memory history for the session and shows the notice.
- Tests use `fake-indexeddb/auto` as a dev dependency in the storage tests only.

## 10. Screen flow (R14)

```ts
type Screen =
  | { name: 'picker' }
  | { name: 'mode'; choice: { kind: 'workout'; id: string } | { kind: 'circuit'; id: string } }
  | { name: 'session'; run: Run }          // run: { choice, mode, seq?: SeqState, target }
  | { name: 'summary'; run: Run; summary: SetSummary; saved: boolean; streakGain: boolean }
  | { name: 'circuitSummary'; run: Run }
  | { name: 'history' };
```

`screenReducer(state, action)` is pure. Actions: `pickWorkout`, `pickCircuit`, `chooseMode`, `setEnded`, `again`, `next`, `home`, `openHistory`, `back`. Invalid actions return the same state (P31). `again` is valid only from `summary` and enters `session` with the same run. `next` is valid only from `summary` of a circuit step and enters `session` for the next step. Starting a new run is only possible through `chooseMode` from `mode`. Circuit state is held inside `run.seq` and advanced with the sequencer.

`App.tsx` renders the screen. On every screen change an effect sets `document.title` and focuses the screen's `h1` (`tabIndex={-1}`) (R14.4). There is no router dependency. The session, mode and summary screens are not addressable by URL, which is acceptable because the flow is short and a refresh returns to the picker.

## 11. UI and cues

### Event to UI mapping

`cues.ts` has `cueFor(event, workout): Cue | null`:

| Event | Effect |
| --- | --- |
| `rep` | counter = `count`; rattle; celebration (milestone if `count % 5 === 0`); sound; voice on milestone and final rep |
| `phase` | polite cue `workout.phaseCues[to]` |
| `hold:start` | cue "Hold it!"; timer starts |
| `hold:tick` | timer = `elapsedMs` |
| `hold:end` | timer stops; cue "Nice hold" for `released`, "Lost you, get back in frame" for `lost-pose` |
| `form:warning` | assertive warning cue with `message` and icon, visible at least 2 s; skeleton tint; voice speaks the rule line |
| `rom:sample` | consumed by `depthCheck` (section 3) and by the end-of-set rule in section 5 step 4. It produces no cue of its own. |

The warning cue is held in state with an expiry. A newer warning replaces it (R6.4), and an expired one clears on the next tick. Pure `nextCue(current, incoming, now)` handles the expiry and is unit tested.

### Skeleton canvas (R8)

`SkeletonCanvas` draws on `requestAnimationFrame` using the latest processed frame (kept in a ref), via `drawSkeleton(ctx, frame, style)`. `style` comes from the theme tokens (bone-white bones, accent joints, warning color while tinted). Rattle: a decaying jitter, computed as a pure function `rattleOffset(elapsedMs, seed)` (amplitude `A * exp(-elapsed / 120)` with a deterministic pseudo-random direction), applied by translating the context per draw call before `drawSkeleton`. It ends after 600 ms. With reduced motion the offset is always 0 and a static flash class is used instead. The loop is cancelled in the effect cleanup (R8.6).

Since `drawSkeleton` draws a whole frame, the rattle is a jitter of the whole figure, applied as a canvas translation before the call. This reads as "rattling" and is cheap. Per-bone rattle would need a landmark transform in the core, so it is a known limitation and a possible follow-up, not a requirement.

### Counter and effects

`Counter` shows the number in a `font-size: clamp(6rem, 28vw, 14rem)` display, inside `aria-live="polite"` with a visually hidden sentence ("Rep 5 of 10"). `Effects` renders short-lived SVG and CSS particles (bones, pumpkins) positioned in a corner overlay with `pointer-events: none` and `aria-hidden`. Each effect has a lifetime of at most 2 s and removes itself on `animationend` or a timer (the timer is needed under reduced motion where no animation runs). A rate limiter drops effects when 3 already started in the last 1000 ms (R17.3). A pure `shouldEmit(timestamps, now)` function holds that rule and is unit tested.

### Voice and sound (R7)

- `voice.ts`: `isSupported()`, `speak(text)` (cancels pending speech first, so at most one warning utterance is queued), `cancel()`. Voice lines are short.
- `sound.ts`: `createRattle()` lazily creates the `AudioContext` on the first explicit unmute click. A rattle is 4 to 6 very short noise bursts through a band-pass filter with a fast gain decay, about 150 ms total. No audio files. `close()` on unmount.
- Both read settings from a context. Defaults are off and muted (R7.1, R7.4).

### Theme (R16)

Tokens in `global.css` as custom properties (and mirrored in `theme/tokens.ts` for contrast tests):

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0b0820` | midnight background |
| `--bg-raised` | `#171235` | cards |
| `--bone` | `#f4f1e6` | neon bone-white text and bones |
| `--muted` | `#b9b3d6` | secondary text |
| `--pumpkin` | `#ff8a1f` | primary action, rep flash |
| `--toxic` | `#7dff5a` | success, clean |
| `--ghost` | `#b58cff` | accents |
| `--warn` | `#ff4d6d` | form warning |
| `--focus` | `#ffe14d` | focus ring |

The final values are checked by `theme.test.ts`, which computes WCAG contrast ratios for each text and background pair (text at least 4.5:1, large text and focus ring at least 3:1) and fails if a token changes below the threshold (R19.2). Fonts are system fonts with a heavy weight and a rounded stack, so there are no network requests. Buttons are large, rounded, with a glow (`box-shadow`) in the accent color. Layout is a single column on phones and a two-column "skeleton and counter" layout from 900 px. This is deliberately unlike Steady (light theme, calm).

### Reduced motion (R18)

`useReducedMotion()` subscribes to `matchMedia('(prefers-reduced-motion: reduce)')` and updates on `change`. The same query is used in CSS: `@media (prefers-reduced-motion: reduce)` sets `animation: none` and `transition: none` for movement and scaling, and keeps opacity fades short. Effects switch to text badges ("Rep 5!") with a short fade. The hook is used by the canvas (no rattle) and by `Effects`.

### Accessibility (R19)

- One `h1` per screen, `header` and `main` landmarks, `lang="en"` in `index.html`.
- Focus moves to the `h1` on screen change. Buttons have at least `min-height: 44px; min-width: 44px`.
- Session shortcuts: a single `keydown` listener on `document` for Escape (stop) and Space (pause), ignored when the event target is an input, textarea, select or a button (so that Space on a focused button still activates it). Shortcuts are listed on screen.
- The canvas is `aria-hidden`. A visually hidden live text mirrors the count and the last cue.
- Toggles are `<button aria-pressed>` or checkboxes with labels.
- Tests use Testing Library with `user-event` for keyboard flows. Color-only information is avoided by adding icons and text labels.

## 12. Error handling

| Situation | Handling |
| --- | --- |
| Camera permission denied or no camera | `onError` from the source shows a message and a "Use demo clip" button for the same workout (R3.7) |
| Insecure context, no `mediaDevices` | Camera button disabled with an explanation, Demo clip stays enabled (R21.6) |
| Model or WASM download fails (offline) | Same as camera failure, message says the pose model could not load |
| No pose for 2 s | "Step back so I can see you" cue, hold ends with `lost-pose` per core |
| Fixture fails `parseFixture` | Caught at startup in tests and shown as a plain error screen with a reload button in production |
| IndexedDB unavailable or quota exceeded | In-memory fallback and a notice (R11.4) |
| Corrupt or unknown stored data | Ignored, defaults used, never thrown (P33) |
| `speechSynthesis` or `AudioContext` missing | Toggle disabled with a reason, no crash |
| Component unmount during start | A generation counter in `useSession` makes late callbacks no-ops |

## 13. Testing strategy

- **Pure modules, fast-check** (Vitest): `summarize` (P1 to P11), streak and day keys (P12 to P22, with `TZ` varied through the offset argument, and one test that runs under a changed `process.env.TZ`), sequencer (P23 to P29), presets (P30), screen reducer (P31), storage codec (P32 to P34), fixtures replay (P35). Generators build random event lists with increasing `t` and consistent rep counts, and random entry lists with day keys across month and year ends and leap days.
- **Independent oracles**: tests compute expected values by a simple, different method (for example a naive per-rep loop for rep windows, a day-by-day walk for weeks) and compare it with the production function.
- **Spec and fixture tests**: every movement spec parses and has its required rules, committed fixtures equal generated ones, replay yields expected events.
- **Component tests** (jsdom, Testing Library): picker lists movements and circuits, mode screen, demo session with a fake clock and a fake `PoseSource` that emits scripted events, summary values, history and streak display, keyboard operation, focus on screen change, live regions, reduced motion with a mocked `matchMedia`, mute defaults, camera denied fallback.
- **Storage tests** use `fake-indexeddb`. The fallback is tested by making the idb call throw.
- **Hygiene tests**: no sub-path imports of `marrow-core`, no em dash or external URLs in app source except the documented model URL owned by the core, no `AudioContext` created before unmute.
- **CI**: the root `typecheck`, `test` and `build` run the app's workspace scripts. No change to `ci.yml` is needed.
- Camera mode is not testable in CI. It is covered by the shared pipeline tests of the core, a fake `PoseSource` in app tests, and a manual smoke check listed in the final task.

## 14. Deployment (R21)

- `vite build` writes `dist/`. `base` is `process.env.VITE_BASE ?? '/'` (already set). The app uses no absolute asset paths, and `index.html` references assets through Vite so the base is applied.
- `vercel.json` already sets `outputDirectory: dist` and a catch-all rewrite to `index.html`.
- Code splitting: `React.lazy` for the session screen, so that the picker, mode and history screens do not load the pipeline or MediaPipe. `@mediapipe/tasks-vision` is already imported lazily by the core inside `start()`. The final task records chunk sizes.
- Vercel settings (documented in the README): root directory `apps/rattle-reps`, install command `cd ../.. && npm ci`, build command `cd ../.. && npm run build -w apps/rattle-reps`, output `dist`, and `VITE_BASE` unset for a root deployment.

## 15. Risks and decisions

| Risk or decision | Choice |
| --- | --- |
| Spec thresholds are guesses for real webcams | Thresholds target gross errors, are in JSON so tuning is cheap, and the UI says they are hints. The demo clips are deterministic, so tests remain stable if thresholds are tuned. |
| Rule sign conventions of `offset` | Verified against `engine/metrics.ts` in the first task and covered by fixture replay tests. |
| 2D pose cannot see depth (knee caving from the side) | The squat clip and spec assume a front-on camera. The mode screen shows a one-line camera placement tip per workout. |
| Whole-figure rattle rather than per-bone | Accepted. Simple and cheap. |
| Streak by week, not by day | The brief asks for a weekly streak. A single qualifying camera set per week keeps it forgiving. |
| Demo sets do not count toward the streak | Prevents gaming the streak without a camera, and keeps the demo usable for judges. They are still saved and shown with a label. |
| App-level zod avoided | Hand-written validators keep the dependency list short. The codec is covered by property tests. |
| Clock and timezone bugs | Day keys are strings captured at save time, and all week math uses UTC day numbers, so tests do not depend on the host timezone. |
| Hold pause semantics | Camera: pause is an app-side wrapper that drops frames and shifts later timestamps. A hold open at pause ends with `lost-pose` on the first frame after resume, because the wrapper leaves a gap of `holdGapMs + 1` before that frame (the core compares timestamps only). Documented in the UI as "Pause ends the current hold". Demo clip: pause suspends the fixture player's timer through an injected `Clock`, so no frames are dropped, the clip continues where it stopped, and a hold survives the pause. |
| Bundle size | Session screen lazy loaded, no icon or font libraries, inline SVG only. |
| Changes to core or Steady | None. If a core gap is found (for example no landmark transform for rattle), it is recorded as a follow-up, not fixed here. |
