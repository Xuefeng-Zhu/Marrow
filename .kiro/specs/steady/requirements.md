# Requirements: steady

## Introduction

This spec covers App 2, Steady, in `apps/steady`. It replaces the "hello skeleton" stub from the marrow-core spec (task 13) with a real app: a calm, clinical-feeling range-of-motion (ROM) and balance check for older adults and people in physio rehab.

Steady is a Vite + React 18 + TypeScript static site. It uses `marrow-core` only through its public entry (`marrow-core`, plus the data exports `marrow-core/specs/*` and `marrow-core/fixtures/*` if needed). The core is not modified by this spec. All movement rules are JSON specs in `apps/steady/src/movements/`. All processing is on-device.

Steady must feel clearly different from Rattle Reps (energetic game) while sharing the same core: light and calm, large type, one task per screen, spoken guidance, no sound effects and no game scoring.

Terms:

- **Test**: one guided check the user can run. The tests are: shoulder flexion ROM (left, right), knee flexion ROM (left, right), 30-second chair stand, single-leg stance (left, right).
- **Side**: `left` or `right`. Each ROM and stance test is run per side. The chair stand has no side.
- **Result**: the outcome of one run: a peak angle in degrees (ROM), a count (chair stand) or a duration in seconds (stance).
- **Demo clip**: a committed landmark fixture replayed through the same pipeline as the camera.
- **Prompt**: one instruction shown as large on-screen text and spoken with speech synthesis.
- **Reference context**: short, general, sourced information shown next to a result. It is never a diagnosis.
- **Asymmetry**: the percentage difference between the left and right results of one test.
- **Trend**: the per-day best result of a test over time.

Out of scope: accounts, servers, uploading video or landmarks, medical diagnosis or scoring against clinical norms as a verdict, changes to `packages/marrow-core`, sound effects, push notifications, multi-user profiles, export formats other than the browser's print and save as PDF.

## Requirements

### R1. Test catalogue and movement specs

**User story:** As a developer, I want every test defined as a JSON movement spec, so that adding a test means adding data, not engine code.

Acceptance criteria:

1. The app SHALL define seven tests, each with a JSON movement spec in `apps/steady/src/movements/`: `shoulder-flexion-left`, `shoulder-flexion-right`, `knee-flexion-left`, `knee-flexion-right`, `chair-stand`, `single-leg-stance-left`, `single-leg-stance-right`.
2. Every spec file SHALL pass `parseMovementSpec` from `marrow-core`. A unit test SHALL validate every `*.json` file in the folder.
3. The shoulder flexion specs SHALL measure the angle hip, shoulder, elbow of the chosen side in the image plane (the `shoulderAngle` metric sets `"plane": "xy"` explicitly, and a test checks it). A raised arm gives a larger angle. The app SHALL report that angle as the flexion in degrees.
4. The knee flexion specs SHALL measure the angle hip, knee, ankle of the chosen side. The app SHALL report flexion as `180 - angle`, so a straight leg is 0 degrees.
5. The chair stand spec SHALL use the knee or hip angle of one leg with the ordered phases `seated` then `standing`, so that one engine `rep` is one full sit, stand and sit cycle.
6. The single-leg stance specs SHALL define a `lifted` phase (the raised foot is clearly off the floor, measured as an ankle height offset in torso units), a `grounded` phase, a hold in `lifted`, and a form rule on the standing leg's horizontal hip-to-ankle offset for sway.
7. A static test catalogue (`apps/steady/src/tests.ts`) SHALL map each test id to its spec, side, result kind (`rom-peak`, `count` or `seconds`), unit, time limit, fixture and prompt script. The UI SHALL be generated from this catalogue.
8. The app SHALL NOT import from deep paths of `marrow-core` (for example `marrow-core/src/...`).

### R2. Choose a test

**User story:** As an older adult or a carer, I want a plain list of tests, so that I can pick one without help.

Acceptance criteria:

1. The home screen SHALL list the four test types (shoulder flexion, knee flexion, 30-second chair stand, single-leg stance). For ROM and stance tests it SHALL offer a left and right choice.
2. Every test choice SHALL show a one-line plain-language description and, where known, the date and value of the last result.
3. The home screen SHALL show the "not a medical device" disclaimer (R12) and a link to history.
4. WHEN a test is chosen, THEN the app SHALL go to the setup screen for that test.
5. The home screen SHALL offer a source choice, "Use camera" or "Try a demo clip". The camera permission prompt SHALL NOT appear before the user starts a camera test.

### R3. Setup guidance

**User story:** As a user, I want clear setup steps and safety advice, so that I can do the test safely.

Acceptance criteria:

1. The setup screen SHALL show, for the chosen test, step-by-step guidance on camera placement (distance, height, which side faces the camera), chair placement (chair stand: sturdy chair against a wall, arms crossed) and clothing and lighting.
2. The setup screen SHALL show a safety notice before any test: "Have someone nearby and hold a support (a sturdy chair or counter). Stop if you feel pain, dizziness or unsteadiness." The notice SHALL be visible without scrolling on a 1280 by 720 viewport.
3. The user SHALL confirm the safety notice with a checkbox or button before the countdown can start. The "Start" control SHALL stay disabled until then.
4. WHERE the source is camera, the setup screen SHALL show a live skeleton preview and a "Ready" indicator once all landmarks the test needs have visibility at or above the spec's `minVisibility` for one continuous second. The user MAY still start without the indicator.
5. WHERE the source is camera, IF permission is denied, no camera exists or the model fails to load, THEN the app SHALL show a plain-language message with the typed error and SHALL offer the demo clip instead.
6. The setup screen SHALL provide a "Back" control that returns to the home screen and stops the camera.

### R4. Countdown and guided run

**User story:** As a user, I want a countdown and clear spoken and large-text prompts, so that I always know what to do next.

Acceptance criteria:

1. WHEN the user starts a test, THEN the app SHALL show a 5-second countdown, one large number per second, each also spoken.
2. WHEN the countdown ends, THEN the app SHALL start the pipeline timeline and show the first prompt of the test's script.
3. Each prompt SHALL be shown as large on-screen text (at least 32px) in an element with `role="status"` and `aria-live="polite"`, and SHALL be spoken when voice is on.
4. The run screen SHALL show the live skeleton overlay, the elapsed or remaining time, and a large "Stop" control that is reachable by keyboard and ends the test at any moment.
5. WHEN the engine emits events relevant to the test (phase change, `rep`, `hold:start`, `form:warning`, `rom:sample`), THEN the app SHALL update the prompt or the live value from the catalogue's script. Prompts SHALL NOT repeat the same text more often than every 4 seconds.
6. WHEN the pose is lost for more than 2 seconds during a run, THEN the app SHALL prompt "I can't see you. Step back into view.". For the stance test the engine's `lost-pose` hold end SHALL stop the test.
7. WHEN a run ends, THEN the app SHALL stop the pipeline and release the camera.
8. The app SHALL NOT use sound effects. Only speech and text.

### R5. ROM tests: shoulder and knee flexion

**User story:** As a person in rehab, I want my best range of motion measured on a chosen side, so that I can track my progress.

Acceptance criteria:

1. A ROM run SHALL end when the user has completed three engine `rep` events, when the user presses "Done" or "Stop", or after 60 seconds, whichever comes first. The 60 seconds SHALL be enforced by a timer as well as by frame timestamps, so the run ends even if no more frames arrive.
2. The result SHALL be the peak flexion in degrees: the largest valid flexion among the `rom:sample` events and the largest valid flexion seen in the frames since the last sample (so that a raise held at the end is not lost).
3. A flexion value SHALL be valid when it is a finite number in the range 0 to 180 degrees inclusive. Invalid values SHALL be ignored.
4. IF no valid value exists, THEN the run SHALL end with a "No movement detected" outcome and SHALL NOT be saved.
5. The result SHALL be shown in whole degrees (rounded to the nearest degree).

### R6. Left and right asymmetry

**User story:** As a user and as a therapist, I want to see the difference between the left and right sides, so that I can spot imbalance over time.

Acceptance criteria:

1. WHEN both a left and a right result exist for the same test and the same day, THEN the result card and the report SHALL show the asymmetry as a percentage: `|L - R| / max(L, R) * 100`, rounded to one decimal.
2. IF both values are 0, THEN the asymmetry SHALL be 0.
3. The asymmetry SHALL be the same when left and right are swapped, SHALL be between 0 and 100 inclusive for non-negative inputs, and SHALL be 0 when the two values are equal.
4. The app SHALL name the stronger or larger side in plain words (for example "Right is 12.5% larger") and SHALL NOT label either side as abnormal.
5. Asymmetry SHALL apply to the ROM tests and to the stance test (seconds). It SHALL NOT apply to the chair stand.

### R7. 30-second chair stand

**User story:** As an older adult, I want my sit-to-stand count in 30 seconds, so that I can track a recognised fall-risk screen.

Acceptance criteria:

1. A chair stand run SHALL last exactly 30 seconds of pipeline time, measured from the first frame timestamp after the countdown, and SHALL show the remaining seconds. The end of the window SHALL be enforced by a timer as well as by frame timestamps, so the run ends and the final count is fixed even if no more frames arrive.
2. The final count SHALL equal the number of engine `rep` events with timestamps inside the 30-second window, plus one if, at the end of the window, the engine phase is `standing` (the user is up and not yet seated again, which the standard test counts when the stand is more than halfway complete). The extra one SHALL be added only when the window closes and SHALL NOT be shown while the window is open. Cycles the engine discards as faster than the spec's `minRepMs` produce no `rep` and no bonus.
3. Events with a timestamp after the 30-second window SHALL NOT be counted.
4. The count SHALL never decrease during a run (including when the window closes and after a discarded fast cycle) and SHALL never exceed the number of in-window `rep` events plus one.
5. WHEN the user presses "Stop" early, THEN the run SHALL be saved only if the user confirms, and the result card SHALL say "Stopped early".
6. The result card SHALL show the count and the unit "stands in 30 seconds".

### R8. Single-leg stance timer

**User story:** As a user, I want my balance time measured on one leg, so that I can track my balance.

Acceptance criteria:

1. WHEN the engine emits `hold:start` for the stance hold, THEN the timer SHALL start from the hold's start time (the time the lifted condition began, as given by the event).
2. The test SHALL stop at the first of these conditions: (a) `hold:end` with reason `released` (foot down); (b) `form:warning` for the sway rule (sway beyond the threshold); (c) `hold:end` with reason `lost-pose`; (d) the timer reaches the 30-second cap, which a timer SHALL enforce even if no more frames arrive; (e) the user presses "Stop". A `form:warning` for the sway rule that arrives before `hold:start` but with a timestamp at or after the hold's start time SHALL count as a sway stop at that warning's time. A warning timestamped before the hold's start time SHALL be ignored.
3. The result in seconds SHALL be the time from the hold start to the stop condition, never negative and never more than 30, rounded down to one decimal.
4. IF the test ends before any `hold:start` was emitted, THEN the result SHALL be "Foot was not lifted" and SHALL NOT be saved.
5. The result card SHALL say why the test stopped in plain words (for example "Your foot touched down", "You swayed past the limit", "You reached 30 seconds").
6. The result SHALL NOT change after the stop condition, even if later events arrive.

### R9. Result card and reference context

**User story:** As a user, I want a clear result with simple context, so that I understand it without being told I have a condition.

Acceptance criteria:

1. WHEN a run ends with a valid result, THEN the app SHALL show a result card with the test name, side, the value with unit in large type, the date and time, and the source (camera or demo clip).
2. The card SHALL show reference context from a data module (`apps/steady/src/reference.ts`): typical ROM ranges for shoulder flexion and knee flexion; the CDC STEADI below-average chair stand scores by age band; and general single-leg stance time guidance. Each entry SHALL carry its source name and a short note.
3. The reference text SHALL use the words "typical", "usually" or "for comparison" and SHALL always be followed by the line "This is not a diagnosis. Talk to your physical therapist or doctor about your results."
4. The app SHALL NOT output a pass, fail, risk level, "normal" or "abnormal" verdict.
5. WHERE the user has chosen an age band (optional, stored locally), the chair stand card SHALL show the reference threshold for that band. IF no age band is chosen, THEN the card SHALL show the general range only.
6. The card SHALL offer "Save result" (default focus), "Try again" and "Back to tests". Saving SHALL write one history record (R10) and confirm in text.
7. WHERE the source is a demo clip, the card SHALL label the result "Demo clip" and the saved record SHALL carry `source: "demo"`.

### R10. Local history and trend

**User story:** As a user, I want my results saved on my device and shown over time, so that I can see my trend.

Acceptance criteria:

1. History SHALL be stored in IndexedDB through `idb-keyval`, in a dedicated store. No result data SHALL be sent over the network and none SHALL go to `localStorage` except the voice and age-band preferences.
2. A history record SHALL hold: `id`, `testId`, `kind`, `side` (or none), `value`, `unit`, `takenAt` (ISO 8601 timestamp), `source` (`camera` or `demo`) and `stoppedEarly` (boolean). Records read from storage SHALL be validated, and records that fail validation SHALL be skipped, not crash the app.
3. The history screen SHALL show, per test (and per side), a list of results (newest first) and a trend chart.
4. The trend SHALL aggregate results by local calendar day. For each day the trend point SHALL be the best result of that day: the largest value for all three result kinds. Points SHALL be sorted by day ascending, with one point per day.
5. The trend summary SHALL give the first value, the latest value, the change between them and the best value, computed from the aggregated points.
6. The trend chart SHALL be an inline SVG with a title and description, and SHALL have a text table alternative (date and value) that is available to screen readers and printable.
7. The history screen SHALL offer "Delete one result" and "Delete all history", each with a confirmation step. The empty state SHALL explain how to take a first test.
8. IF IndexedDB is unavailable or throws, THEN the app SHALL keep working for tests, SHALL tell the user that results cannot be saved on this device, and SHALL offer the printable result card.
9. A toggle "Include demo clips" SHALL control whether demo records are used in lists, trends and reports. Demo records SHALL always be labelled "Demo".

### R11. Printable progress report

**User story:** As a user, I want a report I can print or save as PDF, so that I can share it with my physical therapist.

Acceptance criteria:

1. A report screen SHALL show, for a chosen date range (last 30 days, last 90 days, all time), a summary per test and side: latest, best, change and number of results; left and right asymmetry where applicable; and the trend chart with its table.
2. The report SHALL include the report date, the app name, the disclaimer, the privacy note and the reference-context sources.
3. A "Print or save as PDF" control SHALL call `window.print()`. The report SHALL need no server or library.
4. A `@media print` stylesheet SHALL hide navigation, buttons and the camera, use black text on white, avoid page breaks inside a test section (`break-inside: avoid`), and show charts and tables in print. Colour SHALL NOT be the only way to read the chart.
5. The report SHALL not include any video, image of the user or landmark data.
6. WHERE no records exist in the range, THEN the report SHALL say so and the print control SHALL stay available.

### R12. Disclaimer and privacy

**User story:** As a user, I want to know what this app is and is not, and where my data goes.

Acceptance criteria:

1. The app SHALL show on every screen, in a persistent footer, the text "Steady is not a medical device. It does not diagnose or treat any condition." and "Everything runs on your device. No video or landmarks leave your browser."
2. The first launch SHALL show a plain "About Steady" screen with both statements and a single "I understand" control. The acknowledgement SHALL be stored locally. The user SHALL be able to reopen the screen from the footer.
3. The disclaimer and privacy text SHALL be present on the result card, the report and the print output.
4. The app SHALL make network requests only for the MediaPipe model and WASM assets when the camera is used. It SHALL NOT include analytics or third-party scripts or fonts (system fonts only).

### R13. Demo clip mode

**User story:** As a judge, I want to try every test without a camera, so that I can evaluate the app anywhere.

Acceptance criteria:

1. Every test SHALL have a committed demo fixture in `apps/steady/src/clips/` in the marrow-core fixture format, validated by `parseFixture`.
2. The fixtures SHALL be synthetic (generated by a script in `apps/steady/scripts/`, with a test that the committed files equal the script output) and SHALL contain no real person's data.
3. Demo mode SHALL run the exact same flow (setup, countdown, prompts, result, save) through `createFixturePlayer` and `createPipeline`, using the same spec and the same app logic as the camera.
4. Replaying each fixture through the engine in a test SHALL give the expected results: ROM peak within 2 degrees of the clip's designed peak; chair stand count equal to the designed count; stance seconds equal to the designed time within 0.1 s and the designed stop reason.
5. The stance fixtures SHALL cover at least one foot-down stop and one sway stop across the two sides.
6. WHERE `prefers-reduced-motion` is set, the demo skeleton SHALL still play (it carries the test) but all decorative animation SHALL be off, and a Pause and Play control SHALL be available in the preview.
7. Demo mode SHALL be selectable from the home screen without any permission prompt.

### R14. Voice prompts

**User story:** As a user with low vision or who cannot watch the screen, I want prompts spoken aloud.

Acceptance criteria:

1. The app SHALL speak prompts and countdown numbers with `speechSynthesis` when available. A "Voice on / off" control SHALL be on the home screen, setup screen and run screen, and the choice SHALL be saved locally.
2. WHEN a new prompt is spoken, THEN the app SHALL cancel any speech still in progress so prompts do not queue.
3. WHEN a run ends or the user leaves the run screen, THEN the app SHALL cancel speech.
4. IF `speechSynthesis` is unavailable, THEN the app SHALL hide the voice control, SHALL show a note once, and SHALL still show every prompt as text.
5. The speech module SHALL be injectable, so that tests run with a fake.

### R15. Accessibility

**User story:** As an older adult, I want an app I can read and operate comfortably.

Acceptance criteria:

1. Body text SHALL be at least 18px (CSS `1.125rem` or larger). Headings and the run prompts SHALL be larger. The app SHALL use relative units and SHALL remain usable at 200% zoom with no horizontal scroll at 1280px width.
2. All text and essential UI SHALL meet WCAG AAA contrast: at least 7:1 for normal text and 4.5:1 for large text and UI component boundaries. A unit test SHALL compute the contrast ratio of every foreground and background token pair in `global.css` and fail below these values.
3. Every interactive control SHALL have a hit area of at least 48 by 48 CSS pixels, with at least 8px between neighbouring controls.
4. The whole app SHALL be usable with the keyboard alone, in a logical order, with a visible focus indicator (at least 3px, AAA contrast). Focus SHALL move to the screen heading on each screen change. There SHALL be a "Skip to content" link.
5. The run screen SHALL be operable by keyboard: Space or Enter on "Stop" and "Done"; no pointer-only gestures anywhere.
6. The canvas SHALL have an accessible name and a text alternative. The live value and prompt SHALL be in `aria-live="polite"` regions. Errors SHALL use `role="alert"`.
7. WHERE `prefers-reduced-motion: reduce` is set, THEN all CSS transitions and animations SHALL be disabled, the countdown SHALL swap numbers without animation, and the app SHALL NOT autoplay anything other than the demo clip the user chose.
8. Information SHALL NOT depend on colour alone (the trend chart and the asymmetry text use labels and text).
9. An automated accessibility check (`axe-core` run in jsdom through Testing Library) SHALL pass with no violations on each screen.

### R16. Visual design

**User story:** As a judge, I want Steady to look and feel different from Rattle Reps.

Acceptance criteria:

1. Steady SHALL use a light, calm palette defined as CSS custom properties in `apps/steady/src/global.css` (a soft off-white background, deep teal accent, dark slate text), with no dark mode requirement.
2. The skeleton motif SHALL be gentle: a thin, rounded-line skeleton overlay in a calm colour, a small line-drawn skeleton mark in the header, and soft bone-shaped dividers. It SHALL NOT use spooky imagery, bone-rattle sounds, confetti, streaks, points or timers that flash.
3. Layout SHALL be one task per screen, one primary action per screen, generous spacing and rounded 8px corners.
4. All colours, sizes and spacing SHALL come from tokens in `global.css`, so a test can check them.

### R17. Quality, build and deployment

**User story:** As a maintainer, I want the app to build and test in CI and deploy to Vercel.

Acceptance criteria:

1. `npm run typecheck`, `npm test` and `npm run build` at the repo root SHALL pass on Node 22 after every task, without changing the CI command list.
2. `apps/steady` SHALL build to `apps/steady/dist` with `vite build`, honour `VITE_BASE`, and keep a working `vercel.json` (output directory `dist`, SPA rewrite to `/index.html`).
3. The production bundle SHALL NOT load `@mediapipe/tasks-vision` until the camera is used. The demo path SHALL work with the model never fetched.
4. The app SHALL NOT modify `packages/marrow-core` and SHALL NOT import `apps/rattle-reps`.
5. App-level logic SHALL be pure TypeScript modules in `apps/steady/src/logic/` with no React or DOM imports, and SHALL be covered by fast-check properties (100 runs minimum) in colocated `*.test.ts` files.
6. The `README.md` SHALL describe Steady, how to run it, how to add a test (add a JSON spec and a catalogue entry), and the disclaimer.

### R18. Correctness properties

The following properties SHALL be tested with fast-check in `apps/steady/src/logic/*.test.ts`, at 100 runs minimum. Properties refer to the pure functions defined in the design.

- **P1 (peak selection, upper bound).** For any list of numbers, the selected peak is either none (no valid value) or equals the maximum of the valid values, and is at least every valid value.
- **P2 (peak selection, invalid values ignored).** Adding NaN, infinite or out-of-range values to a list never changes the selected peak.
- **P3 (peak selection, order and duplicates).** The peak is the same for any permutation of the input and for the input with duplicates added.
- **P4 (peak selection, monotone).** Adding a valid value never lowers the peak.
- **P5 (knee conversion).** For any valid joint angle `a`, the knee flexion is `180 - a`, lies in 0 to 180, and flexion is strictly decreasing in `a`.
- **P6 (asymmetry, symmetric).** `asymmetry(a, b) = asymmetry(b, a)`.
- **P7 (asymmetry, range).** For non-negative finite `a` and `b`, the result is between 0 and 100 inclusive, and is 0 when `a = b`.
- **P8 (asymmetry, scale invariance).** `asymmetry(k*a, k*b)` equals `asymmetry(a, b)` for any `k > 0`, within floating point tolerance.
- **P9 (chair stand, count formula).** For any list of `rep` and `phase` events with non-decreasing timestamps, once the window is closed the count equals the number of reps inside the window plus one if the phase at the window end is `standing`.
- **P10 (chair stand, monotone).** Feeding events one by one and then closing the window, the running count never decreases.
- **P11 (chair stand, late events).** Events after the 30-second window never change the count.
- **P12 (chair stand, bound).** The count is at least 0 and at most the number of in-window reps plus one.
- **P13 (stance, stop is first).** For any event sequence, the result stops at the first stop condition in time order (including a sway warning that arrived before `hold:start` with `t` at or after the start), and events after it do not change the result or the stop reason.
- **P14 (stance, bounds).** The result seconds is between 0 and 30 inclusive.
- **P15 (stance, no hold).** A sequence with no `hold:start` never gives a result, whatever the other events.
- **P16 (stance, reason).** The stop reason equals the type of the first stop event, and `lost-pose`, `released`, `sway`, `cap` and `user` are the only reasons.
- **P17 (trend, one point per day).** The number of trend points equals the number of distinct local days in the input, and points are sorted by day ascending.
- **P18 (trend, best of day).** Each point's value equals the maximum value of that day's records, and is at least every record's value of that day.
- **P19 (trend, order independence).** Shuffling the input records does not change the trend.
- **P20 (trend, summary).** For a non-empty trend, `best` is the maximum of the point values, `change` equals `latest - first`, and `latest` is the value of the last day.
- **P21 (history validation).** For any record that passes the record schema, a write then a read returns an equal record. For any value that fails the schema, the read skips it and does not throw.
