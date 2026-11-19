# Design: steady

## Overview

Steady is a guided, one-task-per-screen app. The user picks a test, reads setup and safety guidance, counts down, follows spoken and large prompts, sees a result card, saves it locally and can print a progress report.

It is a thin layer on `marrow-core`:

```
PoseSource (camera | demo clip) -> createPipeline(spec) -> events + frame metrics
                                                              |
                         logic/* (pure functions, no React) <-+
                                                              |
                         session controller (hook) -> React screens -> history (IndexedDB)
```

The rules live in seven JSON specs. The app logic that turns engine events into a result (peak ROM, chair stand count, stance timer, asymmetry, trend) lives in pure TypeScript modules under `src/logic/`, so it can be tested with fast-check without a browser, a camera or React. React only renders and wires.

The core is not changed. If a need appears that the core cannot meet, the task stops and the gap is recorded in the PR, not patched in the core.

## Repository layout (apps/steady)

```
apps/steady/
  index.html  package.json  vite.config.ts  vercel.json  tsconfig.json  README.md
  scripts/make-clips.ts            generator for the demo fixtures (run with node strip-types)
  src/
    main.tsx  App.tsx  App.module.css  global.css  print.css  vite-env.d.ts
    tests.ts                       catalogue: TestDef for each test id
    reference.ts                   reference-context data with sources
    movements/*.json               7 movement specs (the only place rules live)
    clips/*.json                   7 demo fixtures (marrow-core fixture format)
    logic/                         pure modules, each with a colocated *.test.ts
      rom.ts                       selectPeak, kneeFlexion, shoulderFlexion, isValidAngle
      asymmetry.ts                 asymmetryPct, describeAsymmetry
      chairStand.ts                createChairStandCounter
      stance.ts                    createStanceTimer
      trend.ts                     aggregateByDay, summarize
      readiness.ts                 isReady (landmark visibility over one second)
      prompts.ts                   prompt scheduling and de-duplication
    data/
      history.ts                   idb-keyval store, record schema, CRUD
      prefs.ts                     voice, age band, acknowledgement (localStorage)
    services/
      speech.ts                    speechSynthesis wrapper, injectable
      source.ts                    createSource(mode, test): camera or fixture player
    session/
      useSession.ts                hook: wires source, pipeline, logic, timers
      machine.ts                   screen/session state reducer
    ui/                            Home, About, Setup, Countdown, Run, ResultCard,
                                   History, TrendChart, Report, Footer, SkeletonMark
```

Dependencies added to `apps/steady`: `idb-keyval` (runtime), `fake-indexeddb` and `axe-core` (dev). `fast-check` and `vitest` come from the root.

## Test catalogue

```ts
type Side = 'left' | 'right';
type ResultKind = 'rom-peak' | 'count' | 'seconds';

interface TestDef {
  id: 'shoulder-flexion-left' | 'shoulder-flexion-right' | 'knee-flexion-left' | 'knee-flexion-right'
    | 'chair-stand' | 'single-leg-stance-left' | 'single-leg-stance-right';
  family: 'shoulder-flexion' | 'knee-flexion' | 'chair-stand' | 'single-leg-stance';
  side?: Side;
  title: string;            // "Shoulder flexion, left arm"
  summary: string;          // one plain sentence for the home screen
  kind: ResultKind;
  unit: string;             // "degrees", "stands in 30 seconds", "seconds"
  metric: string;           // spec metric name the app reads (for example "shoulderAngle")
  spec: unknown;            // imported JSON, parsed once with parseMovementSpec
  clip: unknown;            // imported fixture JSON, parsed with parseFixture
  limitMs: number;          // 60000 ROM, 30000 chair stand, 30000 stance cap
  requiredLandmarks: LandmarkName[];   // for the readiness check
  setup: string[];          // setup steps (camera, chair, clothing)
  script: PromptScript;     // text for each stage
}
```

`PromptScript` holds the text for stages `intro`, `go`, `rep`, `hold`, `warn:<ruleId>`, `lost`, and `done`. The UI and the speech service read it. Adding a test means adding a spec, a clip, and one entry here.

## Movement specs

All specs use `minVisibility: 0.5`. Numbers below are starting values. The coder tunes them against the generated clips, and a spec test keeps them valid with `parseMovementSpec`.

### Shoulder flexion (left shown; right mirrors the landmark names)

`shoulderAngle` is the angle at the shoulder between hip and elbow, `["leftHip","leftShoulder","leftElbow"]`, with an explicit `"plane": "xy"` (the default is `xyz`, and the depth value from a single camera is too noisy for a side-on arm angle). An arm at the side reads near 0 and an arm overhead reads near 180. Because the camera sees the user from the side, the setup tells the user to turn so the tested arm faces the camera.

```json
{
  "version": 1, "id": "shoulder-flexion-left", "name": "Shoulder flexion, left arm",
  "hysteresis": 8, "minRepMs": 1500,
  "metrics": { "shoulderAngle": { "kind": "angle", "points": ["leftHip","leftShoulder","leftElbow"], "plane": "xy" } },
  "phases": [
    { "id": "down",   "metric": "shoulderAngle", "min": 0,  "max": 30 },
    { "id": "raised", "metric": "shoulderAngle", "min": 90, "max": 180 }
  ],
  "rom": [ { "metric": "shoulderAngle", "sampleOn": "phase:down" } ]
}
```

A rep is down, raised, down. `rom:sample` fires on return to `down` and carries the max seen since the last trigger. The app also keeps the running max from `onFrame` metrics, so a raise still held when the user presses "Done" is counted (R5.2).

### Knee flexion

`kneeAngle` is `["leftHip","leftKnee","leftAnkle"]`. A straight leg reads near 180, a bent knee less. Phases: `straight` 150 to 180, `bent` 20 to 120. The `rom` trigger is `phase:straight`, and the sample's **min** is the deepest bend. The app converts with `kneeFlexion(angle) = 180 - angle`, so it takes the sample's `min`, not `max`. The catalogue records which of `min` or `max` to read (`romEdge: 'max' | 'min'`).

### Chair stand

`legAngle` is `["leftHip","leftKnee","leftAnkle"]` (seen from the side). Phases in order: `seated` 60 to 120, `standing` 155 to 180. A `rep` is seated, standing, seated. `minRepMs: 800`, `hysteresis: 8`. There is no hold and no rom.

### Single-leg stance (left shown)

The side names the **standing** leg, so "left" means standing on the left leg. Metrics:

- `footLift`: `{ "kind": "offset", "points": ["rightAnkle","leftAnkle"], "axis": "y" }` for `single-leg-stance-left`. It is the raised ankle's height offset from the standing ankle in torso units (image y grows downward, so a lifted foot gives a negative value; the spec uses a `max` bound accordingly and the coder confirms the sign with the generator).
- `sway`: `{ "kind": "offset", "points": ["leftHip","leftAnkle"], "axis": "x" }`, the standing leg's hip over ankle drift.

Phases: `grounded` (footLift near 0) then `lifted` (footLift beyond the lift threshold, about 0.15 torso units). `holds`: `{ "id": "stance", "phase": "lifted", "minMs": 500, "tickMs": 250 }`. `formRules`: `{ "id": "sway-limit", "metric": "sway", "min": -0.25, "max": 0.25, "phases": ["lifted"], "debounceMs": 300, "message": "Steady yourself" }`.

The engine ends the hold with `released` when the foot goes down and with `lost-pose` when valid frames stop for more than `holdGapMs` (default 500, set to 1000 in these specs). The sway threshold is the one number the user may later want to change, so it lives only in the spec.

## Pure logic modules

All functions are total (no throws on any input) and have no React or DOM imports.

```ts
// rom.ts
isValidAngle(v: number): boolean                       // finite and 0..180
kneeFlexion(angle: number): number                     // 180 - angle
selectPeak(values: readonly number[]): number | null   // max of valid values, null if none

// asymmetry.ts
asymmetryPct(a: number, b: number): number             // |a-b| / max(a,b) * 100, 0 if max is 0
describeAsymmetry(left: number, right: number): { pct: number; larger: Side | 'equal'; text: string }

// chairStand.ts
interface ChairStandCounter {
  push(e: MarrowEvent): void       // counts `rep` with startT <= t <= startT + windowMs, tracks `phase` events; an event after the window closes it
  setPhase(phase: string | null, t: number): void   // same as a `phase` event
  finish(): void                   // closes the window (idempotent)
  result(): number                 // reps in window, plus 1 once closed if the phase at the window end was 'standing'
  readonly closed: boolean
}
createChairStandCounter(startT: number, windowMs?: number): ChairStandCounter  // windowMs default 30000
```

`t` in events is the pipeline timeline (fixture `t` or camera clock). `startT` is the `t` of the first frame after the countdown, so the window is `[startT, startT + windowMs]`.

Standing bonus rule (reconciles R7.2 with the monotone count R7.4): the engine already drops cycles shorter than `minRepMs`, so a fast stand and sit emits no `rep`. The bonus is therefore not a live value. `result()` returns only the in-window reps while the window is open, and the +1 is added once, when the window closes (`finish()` or the first event after the window), using the phase that was current at the window end. The count can only go up: reps only increase, the bonus is at most +1 and is fixed at close, and nothing changes afterwards. It cannot double count, because the `rep` of a stand still in progress at the window end has a `t` after the window and is ignored. A stand that was discarded as too fast leaves the phase at `seated`, so it earns no bonus and never makes a displayed count drop.

```ts
// stance.ts
type StanceStop = 'released' | 'sway' | 'lost-pose' | 'cap' | 'user';
interface StanceTimer {
  push(e: MarrowEvent): void                 // hold:start, hold:tick, hold:end, form:warning (ruleId 'sway-limit')
  stopByUser(t: number): void
  readonly state: { status: 'waiting' | 'running' | 'stopped'; startT: number | null; elapsedMs: number }
  result(): { seconds: number; reason: StanceStop } | null   // null until stopped with a hold:start
}
createStanceTimer(capMs?: number): StanceTimer // default 30000
```

Rules: `hold:start` sets `startT = e.t` once. The engine emits `hold:start` after the hold's `minMs` (500 ms), with the `t` the lift began, so a `form:warning` with `ruleId === 'sway-limit'` can arrive before `hold:start`. While waiting, the timer buffers those warnings. When `hold:start` arrives, the earliest buffered warning with `t >= startT` stops the timer at once with reason `sway`; warnings with `t < startT` (before the lift) are dropped. After the start, the first stop event with `t >= startT` wins: `hold:end` gives `released` or `lost-pose`, `form:warning` with `ruleId === 'sway-limit'` gives `sway`, and any event or stop with `t - startT >= capMs` gives `cap`. After stopping, `push` is a no-op. Seconds is `min(capMs, t_stop - startT) / 1000`, floored to one decimal and never below 0. The reason `user` comes from `stopByUser`. If `stopByUser` is called before `hold:start`, the timer stops with no result.

```ts
// trend.ts
interface HistoryPoint { day: string; value: number }          // day is local 'YYYY-MM-DD'
aggregateByDay(records: readonly {takenAt: string; value: number}[], tzOffset?: number | ((epochMs: number) => number)): HistoryPoint[]
summarize(points: readonly HistoryPoint[]): { first: number; latest: number; best: number; change: number } | null
```

Local day uses `Date` local fields so a result at 23:30 belongs to the user's day. `tzOffset` is an optional injected offset in minutes east of UTC (or a function from epoch ms to that offset) so tests are deterministic. Without it the runtime's local time zone is used. Records with an unparseable `takenAt` or a non-finite value are skipped.

```ts
// readiness.ts
isReady(samples: {t: number; visible: boolean}[], holdMs = 1000): boolean  // visible continuously for holdMs
// prompts.ts
createPromptGate(minGapMs = 4000): { offer(text: string, t: number): boolean }  // false if same text within gap
```

## Session controller

`useSession(test, mode)` builds the source (`createFixturePlayer(parseFixture(test.clip))` or `createMediaPipeSource()` imported dynamically), builds `createPipeline({ source, spec })`, and subscribes with `pipeline.on(...)` and `pipeline.onFrame(...)`. The controller owns a small state machine:

```
home -> setup -> countdown -> running -> result -> (home | setup)
home -> history | report | about
```

Rules:

- `machine.ts` is a pure reducer with its own tests (no state is reachable out of order, for example `running` only after `countdown`).
- The camera preview in `setup` uses a separate pipeline with the real spec, only to draw the skeleton and feed the readiness check. It is stopped when the screen changes.
- During `running`, ROM tests feed `selectPeak` from `rom:sample` and `onFrame` metrics, chair stand feeds `createChairStandCounter`, and stance feeds `createStanceTimer`. The end of a run is decided from event and frame timestamps first, so demo and test runs are deterministic. A deadline timer backs this up, because a stalled camera or a finished clip delivers no more frames and a frame-only rule would leave the run open. The controller takes an injectable scheduler (`now`, `setTimeout`, `clearTimeout`). It arms a deadline when the first frame of the run arrives (when the pipeline starts, if no frame ever arrives): chair stand ends at `windowMs` (30 s) with `counter.finish()` so the standing bonus is applied, and ROM ends at 60 s with the peak seen so far. For the stance test, `hold:start` arms a cap timer that stops the hold at 30 s after the lift, and a run in which the foot is never lifted ends after 60 s with no result. A frame or event that closes the run first cancels the timers. A separate timer prompts "I can't see you" after 2 s without frames. The on-screen clock is a `setInterval` in the hook and does not decide anything. Tests drive all of this with fake timers.
- On end the controller calls `pipeline.stop()`, which stops the source and releases the camera tracks (core behaviour), and cancels speech.
- The camera is mirrored in display only (CSS `transform: scaleX(-1)`), as in the stub.
- `@mediapipe/tasks-vision` is loaded by the core's lazy import inside `createMediaPipeSource`; the app never imports it directly, so the demo path never fetches it.

### Demo clips

`scripts/make-clips.ts` generates one clip per test with `Fixture` from `marrow-core`. Each clip is 20 fps synthetic landmarks built from a small stick figure (as in `packages/marrow-core/scripts/make-fixture.ts`), with a designed outcome recorded in a sidecar constant exported for tests:

| Clip | Designed outcome |
| --- | --- |
| shoulder-flexion-left / right | three raises with peaks 150, 158, 165 (left) and 140, 148, 152 (right), so asymmetry is visible |
| knee-flexion-left / right | three bends with deepest flexion 120 (left) and 105 (right) |
| chair-stand | 11 full stands in 30 s, ending seated (count 11). A test also builds an event sequence that ends in `standing` to check the +1 rule |
| single-leg-stance-left | foot lifted at 1.0 s, foot down at 14.5 s (stop reason `released`) |
| single-leg-stance-right | foot lifted at 1.0 s, sway beyond the limit at 9.0 s (stop reason `sway`) |

Tests replay each clip with `replay()` or the fixture player with a fake clock through the same logic modules and compare against the designed outcome. A test also checks that regenerating the clips reproduces the committed JSON. The movement-spec-guard hook in `.kiro/hooks` watches `apps/**/src/movements/*.json`; clips are kept in `src/clips/` so they are not mistaken for specs.

Clip files are small (long chair-stand and stance clips use 10 fps and 2 decimal places to keep each file under about 400 KB).

## Data and persistence

`data/history.ts` uses `createStore('steady', 'history')` and one key per record (`rec:<id>`), so deleting one result is one `del`.

```ts
interface HistoryRecord {
  id: string; testId: TestId; kind: ResultKind; side?: Side;
  value: number; unit: string; takenAt: string; source: 'camera' | 'demo'; stoppedEarly: boolean;
}
saveRecord(r), listRecords(): Promise<HistoryRecord[]>, deleteRecord(id), clearAll()
isHistoryRecord(v: unknown): v is HistoryRecord      // exported guard used by listRecords
```

`listRecords` reads all entries, keeps those passing `isHistoryRecord` and drops the rest. All functions catch IndexedDB errors and reject with a typed `StorageUnavailableError`, which the UI maps to the message in R10.8. Tests use `fake-indexeddb/auto`.

`data/prefs.ts` stores `voice` (boolean), `ageBand` and `acknowledged` in `localStorage` under a `steady:` prefix. These are not results.

## Reference context

`reference.ts` exports data entries `{ testFamily, text, source, url?, ageBands? }`. Initial content (the coder checks every number against the cited source before committing and leaves out any it cannot verify):

- Shoulder flexion: a full range is often described as about 180 degrees, with a lower range common with age or after injury (AAOS / standard goniometry texts).
- Knee flexion: about 135 to 150 degrees is a commonly cited typical range.
- Chair stand: CDC STEADI "30-Second Chair Stand" below-average scores by age and sex (for example, ages 60 to 64: fewer than 14 for men, fewer than 12 for women), shown as "scores below this are often a prompt to talk to a health professional". The card shows both columns, never a verdict.
- Single-leg stance: general guidance that holding for about 10 seconds or more is typical for many adults and that shorter times are worth discussing with a therapist (the coder cites a published source, for example Springer et al. 2007, or omits the numbers).

Every rendered reference is followed by the fixed line "This is not a diagnosis. Talk to your physical therapist or doctor about your results." A test asserts that no rendered card contains the words "pass", "fail", "normal", "abnormal" or "risk level" (case-insensitive, with an allow-list for the word "normal" inside source titles if needed).

## UI and design system

Tokens in `global.css` (starting values; the contrast test is the source of truth, and any token that fails is darkened):

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F6F9F9` | page |
| `--surface` | `#FFFFFF` | cards |
| `--text` | `#12232B` | body (above 7:1 on both) |
| `--muted` | `#34505C` | secondary text (above 7:1) |
| `--accent` | `#0A5560` | buttons, focus, chart line |
| `--accent-text` | `#FFFFFF` | text on accent |
| `--focus` | `#7A3E00` | 3px focus ring (above 4.5:1 on bg and surface) |
| `--bone` | `#3E6F7A` | skeleton lines in overlay and header mark |
| `--radius` | `8px` | corners |
| `--font-size` | `1.125rem` | body, with run prompts at `2rem` to `3rem` |

- The overlay uses `drawSkeleton` with a thin `lineWidth: 3`, round caps (set by the style) and `--bone` colour, on a pale `--surface` canvas background (not a dark video backdrop) for the demo, and over the mirrored video for the camera.
- Fonts: system stack only. No web fonts.
- `.btn` has `min-height: 3rem; min-width: 3rem; padding: 0.75rem 1.25rem`, controls are spaced with `gap: 0.75rem` (at least 8px).
- Focus: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`.
- `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important } }`.
- Navigation: a simple `useState` screen with `location.hash` sync (`#/history`, `#/report`) so the browser Back button works. The existing SPA rewrite in `vercel.json` stays.
- Focus management: each screen has an `<h1 tabIndex={-1}>` that receives focus when the screen mounts. A skip link jumps to `<main id="content">`.
- Persistent footer: disclaimer, privacy line and "About" button.
- Header: small inline-SVG skeleton mark (a rounded spine, ribs and skull outline), `aria-hidden`, so the identity differs from Rattle Reps.

### Trend chart

`TrendChart` renders an inline SVG: x axis days, y axis the value with unit, a polyline with round markers, `<title>` and `<desc>`, and a `<table>` of the points below it (visually visible, and printed). No chart library. Axis labels are text, so the chart works in print and in greyscale (markers differ by shape for left and right).

### Report and print

The report screen is a normal React screen. `print.css` (imported once) applies `@media print`:

- hide `.no-print` (header nav, buttons, camera, footer controls), keep the disclaimer and privacy line
- `body { background: #fff; color: #000; font-size: 12pt }`
- `.report-section { break-inside: avoid }`
- show link URLs for sources (`a[href]::after`) only inside the references list

"Print or save as PDF" calls `window.print()`. Tests check that the print stylesheet exists, that `window.print` is called on click (spied), and that the print-only text includes the disclaimer.

## Accessibility test strategy

- `axe-core` runs against each rendered screen (home, about, setup, countdown, run, result, history, report) in jsdom, with `color-contrast` disabled (jsdom has no layout) and the separate token contrast test covering colour.
- `logic/contrast.test.ts` (or `src/contrast.test.ts`) parses `global.css` custom properties and checks each foreground and background pair, with the WCAG relative luminance formula.
- Testing Library tests tab through each screen with `userEvent.tab()` and check that all actions are reachable and that Enter and Space activate the main controls.
- A CSS test reads `App.module.css` and `global.css` and checks the `prefers-reduced-motion` block and the `min-height: 3rem` button rule. This is a lint-style check, noted as such.

## Testing strategy

- **Vitest** with `environment: 'jsdom'` (already set in `vite.config.ts`). Logic tests need no DOM.
- **fast-check** properties P1 to P21 from `requirements.md` (R18), 100 runs minimum, next to the modules they cover. Generators: arbitrary event sequences with non-decreasing `t`; arbitrary records with ISO timestamps in a fixed time zone; arbitrary numbers including NaN and infinities for the peak tests.
- **Clip tests**: replay each committed clip through `createPipeline` with the fixture player and a fake clock, and compare the result to the designed outcome in R13.4.
- **UI tests**: Testing Library flows for the happy path in demo mode (choose test, accept safety notice, countdown with fake timers, run to the end, result card, save, history shows the record, report prints). A fake speech service is injected to check cancel-before-speak and the unavailable case.
- **Mocks**: no network, no camera. `createMediaPipeSource` is replaced by a stub only in tests that check the error paths in R3.5.

## Decisions and trade-offs

- **Pure logic outside React.** More files than inline hooks, but every correctness property is testable with fast-check without rendering.
- **Peak from both `rom:sample` and frame metrics.** `rom:sample` only fires on a trigger, so a raise still held when the user stops would be lost. Taking the max over both fixes this without changing the core.
- **Chair stand "+1 if standing".** Follows the usual scoring rule that a stand more than halfway counts. It is a documented app rule, applied once when the window closes (see the chair stand rule above) and covered by P9 and P10.
- **Stance side names the standing leg.** It matches how a therapist records "left leg stance" and keeps the metric names simple.
- **Sway ends the test.** The user asked for end on foot-down or sway beyond a threshold. The threshold is data in the spec, not code.
- **Per-day best, not average.** For ROM, count and time, the best of the day reflects capacity and is less affected by a tired second attempt. The report also lists the number of results per day range.
- **Demo records are saved and labelled.** Judges can see a trend and a report immediately. A toggle excludes them.
- **No chart or PDF library.** Inline SVG and `window.print()` keep the bundle small and work offline.
- **No router library.** Eight screens and hash sync are enough.
- **Reference numbers are data with sources.** They can be corrected without code changes, and the app never produces a verdict.
- **Open question (not blocking).** Pose from a single side-on webcam is an approximation of goniometer angles. The result card says "estimated by the camera" and the setup page says angles are approximate. The report repeats it.
