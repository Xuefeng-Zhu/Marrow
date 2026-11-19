# Requirements: rattle-reps

## Introduction

This spec covers App 1, **Rattle Reps**, in `apps/rattle-reps`. It replaces the "hello skeleton" stub from the marrow-core spec with a full product: an energetic, spooky-cute webcam home-workout coach. A friendly animated skeleton mirrors the user, and its bones rattle on each rep.

The user picks a workout or a preset circuit, chooses camera or demo-clip mode, does a set with a live rep counter and phase and form cues, sees a set summary, and keeps a local history and weekly streak. There are no accounts and no uploads. All pose inference runs on-device.

The app is built on `marrow-core` and imports it only through the `marrow-core` entry. Movements are JSON movement specs (see `docs/movement-spec.md`) that live in `apps/rattle-reps/src/movements/`. Adding a movement means adding a spec plus a small amount of presentation data, not engine code.

Terms:

- **Workout**: one movement (squat, push-up, lunge, jumping jack or plank) with a target.
- **Rep workout**: a workout counted in reps (squat, push-up, lunge, jumping jack).
- **Hold workout**: a workout counted in seconds held (plank).
- **Circuit**: an ordered list of workout steps with rest periods between them.
- **Set**: one run of one workout, from start to finish or stop.
- **Rep window**: for the n-th rep, the time interval after the previous `rep` event (or the set start for the first rep) up to and including the n-th `rep` event.
- **Clean rep**: a rep whose rep window contains no `form:warning` event.
- **Clean-rep percentage**: clean reps divided by total reps, as an integer percent.
- **Time under tension (TUT)**: the total time spent actively moving through reps or holding, defined in R9.
- **Demo clip**: a committed synthetic landmark fixture replayed through the same pipeline as the camera.
- **Streak week**: a calendar week that starts on Monday, in the user's local time, containing at least one qualifying set (R12).
- **Day key**: a local calendar date string `YYYY-MM-DD` captured when a set is saved.

Out of scope for this spec: accounts, servers, uploading video or landmarks, sync across devices, medical advice, user-authored movements in the UI, leaderboards, changes to `marrow-core`.

## Requirements

### R1. Movement specs as data

**User story:** As a contributor, I want each workout defined as a JSON movement spec, so that adding or tuning a movement does not need engine changes.

Acceptance criteria:

1. The app SHALL contain one JSON movement spec per movement in `apps/rattle-reps/src/movements/`: `squat.json`, `push-up.json`, `lunge.json`, `jumping-jack.json` and `plank.json`.
2. Every spec file SHALL be accepted by `parseMovementSpec` from `marrow-core`, and a test SHALL fail if any file in that folder is rejected.
3. The squat, push-up, lunge and jumping jack specs SHALL each define phases that make up a counted rep.
4. The plank spec SHALL define at least one entry in `holds`, and the app SHALL treat the plank as a hold workout.
5. Each spec SHALL define at least two `formRules`, each with a plain-language `message` of at most 40 characters.
6. The squat spec SHALL include a rule for knees caving in and a rule for shallow depth.
7. The push-up spec SHALL include a rule for hips sagging and a rule for shallow depth.
8. The lunge spec SHALL include a rule for the front knee travelling past the ankle and a rule for leaning the torso forward.
9. The jumping jack spec SHALL include a rule for arms not reaching overhead and a rule for feet not spreading wide enough.
10. The plank spec SHALL include a rule for hips sagging and a rule for hips piking up.
11. Every spec SHALL have an `id` equal to its file name without the extension.
12. The app SHALL load specs through a single registry module, and no other module SHALL import a movement JSON file directly.
13. The squat and push-up specs SHALL each declare a `rom` entry on the depth metric sampled on `rep`, so that the depth reached in every rep is available to the app.
14. WHEN a rep of a squat or push-up is shallower than the depth bound of its shallow-depth rule, THEN the rep window SHALL contain exactly one `shallow-depth` warning, including for consecutive shallow reps where the core's latched rule does not warn again, and such a rep SHALL NOT count as clean.

### R2. Workout and circuit picker

**User story:** As a user, I want to pick one workout or a ready-made circuit, so that I can start quickly without planning.

Acceptance criteria:

1. WHEN the app opens, THEN it SHALL show a picker listing the five workouts and the preset circuits.
2. The app SHALL ship at least three preset circuits, including one that uses every movement at least once.
3. Each picker entry SHALL show its name, its target (reps or seconds, or step count and estimated minutes for a circuit) and a short description.
4. WHEN the user activates a workout entry, THEN the app SHALL move to mode selection (R3) for that workout.
5. WHEN the user activates a circuit entry, THEN the app SHALL move to mode selection for the circuit, and the circuit SHALL run its steps in order (R10).
6. The picker SHALL show the current weekly streak and a link to history (R12, R13).
7. The picker SHALL state that video stays on the device (R15).

### R3. Camera mode and demo-clip mode

**User story:** As a judge or a user without a camera, I want to try every workout from a recorded demo clip, so that I can see the whole flow with no camera.

Acceptance criteria:

1. After choosing a workout or circuit, the app SHALL offer two modes: **Camera** and **Demo clip**.
2. WHEN the user chooses Demo clip, THEN the app SHALL replay a committed fixture through `createPipeline` using `createFixturePlayer`, with no camera permission request.
3. WHEN the user chooses Camera, THEN the app SHALL create a pose source with `createMediaPipeSource` and SHALL request camera permission only at that point.
4. The app SHALL ship one demo-clip fixture for each of the five movements.
5. Each demo clip SHALL include at least one clean rep (or one clean hold) and at least one form warning, so that the warning cue can be seen.
6. Camera mode and Demo clip mode SHALL use the same pipeline, the same event handling and the same UI. The only difference SHALL be the `PoseSource`.
7. IF camera access is denied, unavailable or fails to start, THEN the app SHALL show a plain-language message and a button to switch to Demo clip mode for the same workout.
8. WHEN a circuit runs in Demo clip mode, THEN each step SHALL replay the fixture for that step's movement.
9. WHILE a demo clip is playing, the UI SHALL show a visible "Demo clip" label so that it cannot be mistaken for the camera.
10. The user SHALL be able to stop a session at any time, and stopping SHALL stop the source and release the camera.

### R4. Demo fixtures are app-owned and committed

**User story:** As a maintainer, I want the demo clips to live in the app and be reproducible, so that the app does not depend on core internals.

Acceptance criteria:

1. The five fixtures SHALL be committed under `apps/rattle-reps/src/fixtures/` as JSON files that pass `parseFixture` from `marrow-core`.
2. The fixtures SHALL be generated by a script at `apps/rattle-reps/scripts/make-fixtures.ts` that uses only synthetic poses and the public types of `marrow-core`. No camera data or personal data SHALL be used.
3. A test SHALL fail if any committed fixture differs from the output of the generator.
4. For each movement, a test SHALL replay its fixture through its spec with `createEngine` and `replay`, and SHALL assert the expected number of reps (or holds) and the expected form warning rule ids.
5. The app SHALL NOT import `marrow-core/fixtures/*` or `marrow-core/specs/*`. The deep imports in the stub `App.tsx` SHALL be removed.
6. A test SHALL fail if any file under `apps/rattle-reps/src/` or `apps/rattle-reps/scripts/` imports from `marrow-core/` with a sub-path.

### R5. Live rep counter

**User story:** As a user mid-set, I want to see my rep count in big numbers, so that I can read it from a distance.

Acceptance criteria:

1. WHILE a rep workout is running, the UI SHALL show the current rep count as a large number, and the target if one is set.
2. WHEN a `rep` event arrives, THEN the displayed count SHALL equal the event's `count`.
3. WHEN the count changes, THEN the UI SHALL give a celebratory effect (R17) and SHALL rattle the skeleton bones (R8).
4. WHEN the count reaches the target of a rep workout, THEN the set SHALL end and the summary SHALL be shown (R9).
5. WHILE a hold workout is running and a hold is active, the UI SHALL show the elapsed hold time in seconds as a large number, updated on each `hold:tick`.
6. The rep counter SHALL NOT decrease during a set.
7. The count region SHALL be an `aria-live="polite"` region so that screen readers announce changes without interrupting.

### R6. Phase and form cues

**User story:** As a user, I want short cues on what to do and what to fix, so that I improve while I move.

Acceptance criteria:

1. WHEN a `phase` event arrives, THEN the UI SHALL show the cue text mapped to the new phase for that workout (for example "Down" or "Push up").
2. WHEN a `form:warning` event arrives, THEN the UI SHALL show the event's `message` as a visible warning cue and SHALL keep it visible for at least 2 seconds, unless replaced by a newer warning.
3. The warning cue SHALL NOT rely on color alone: it SHALL include an icon or text label.
4. WHEN a new warning arrives while another is visible, THEN the UI SHALL show the newest one and SHALL NOT stack more than one at a time.
5. The cue region SHALL be an `aria-live="assertive"` region for warnings and `polite` for phase cues.
6. IF no pose is detected for more than 2 seconds in camera mode, THEN the UI SHALL show a "Step back so I can see you" cue.

### R7. Voice and sound options

**User story:** As a user, I want optional spoken cues and optional bone-rattle sounds, so that I can follow without looking at the screen, without being startled.

Acceptance criteria:

1. The app SHALL offer a voice toggle that is off by default.
2. WHILE voice is on, WHEN a warning cue or a rep milestone (every 5th rep and the final rep) occurs, THEN the app SHALL speak it using `speechSynthesis`.
3. IF `speechSynthesis` is unavailable, THEN the voice toggle SHALL be disabled and SHALL say why.
4. The app SHALL offer a sound toggle that is **muted by default**.
5. WHILE sound is on, WHEN a rep completes, THEN the app SHALL play a short synthesized bone-rattle sound. The app SHALL ship no audio files.
6. The app SHALL NOT play any sound and SHALL NOT create an `AudioContext` until the user turns sound on by an explicit action.
7. WHILE voice is on, the app SHALL cancel pending speech when a set ends or is stopped, and SHALL NOT queue more than one warning utterance at a time.
8. The voice and sound choices SHALL be saved locally and restored on the next visit, but sound SHALL be reset to muted if the saved value cannot be read.

### R8. Animated skeleton

**User story:** As a user, I want a friendly skeleton that mirrors me and rattles when I rep, so that the app feels playful.

Acceptance criteria:

1. WHILE a session runs, the app SHALL draw the skeleton on a canvas overlay using `drawSkeleton` from `marrow-core`, from the processed frames of the pipeline.
2. The skeleton SHALL be drawn in the app's bone-white and neon style, using the `SkeletonStyle` option of `drawSkeleton`.
3. WHEN a `rep` event arrives, THEN the skeleton SHALL rattle: a short, decaying jitter of the drawn bones lasting no more than 600 ms.
4. WHEN a `form:warning` event arrives, THEN the skeleton SHALL be tinted with the warning color for no more than 1 second.
5. IF the user prefers reduced motion (R18), THEN the rattle SHALL be replaced by a non-moving flash.
6. WHEN the session ends, THEN the canvas loop SHALL stop and no animation frames SHALL remain scheduled.
7. In camera mode, the user's own video SHALL NOT be displayed unless the user turns on a "Show my video" toggle, which is off by default. The skeleton alone SHALL be shown otherwise.

### R9. Set summary

**User story:** As a user, I want a summary after each set, so that I know how I did.

Acceptance criteria:

1. WHEN a set ends, THEN the app SHALL show a summary with the movement name, rep count (or total hold seconds), clean-rep percentage, time under tension and the form warnings that occurred, grouped by rule with a count.
2. The rep count SHALL equal the `count` of the last `rep` event, or 0 if there was none.
3. A rep SHALL be a clean rep if and only if its rep window contains no `form:warning` event. Warnings after the last `rep` event SHALL belong to no rep window.
4. The clean-rep percentage SHALL be `round(100 * cleanReps / reps)` for `reps > 0`, and 0 for `reps = 0`. The UI SHALL show "n/a" instead of 0% when there are no reps.
5. Time under tension for a rep workout SHALL be the sum of the `durationMs` of its `rep` events. For a hold workout it SHALL be the sum of the `durationMs` of its `hold:end` events, and a hold still active when the set ends SHALL be closed at the stop time and counted.
6. For a hold workout, the clean percentage SHALL be the share of hold time that is not within 2000 ms after a `form:warning` event that occurred during that hold, rounded to an integer percent, and 100 if no warning occurred during a hold.
7. The summary SHALL be computed by pure functions of the event list, the set start and stop times, and the workout definition, with no access to the DOM, clock or storage.
8. WHEN the user stops a set early with at least one rep or hold, THEN the app SHALL still show a summary for what was done.
9. WHEN a set ends with zero reps and zero hold time, THEN the app SHALL show a friendly "No reps yet" state, SHALL NOT save the set to history, and SHALL offer to retry or return to the picker.
10. The summary SHALL offer "Again", "Next" (only inside a circuit) and "Home" actions, all reachable by keyboard.
11. WHEN a summary is shown for a set that is saved, THEN the app SHALL show whether the set extended the weekly streak.

### R10. Circuits

**User story:** As a user, I want to run a preset circuit that moves me through workouts with rests, so that I get a full session without touching the screen.

Acceptance criteria:

1. A circuit SHALL be an ordered, non-empty list of steps, each with a movement id, a target (reps or hold seconds), and a rest duration in seconds after the step.
2. Every circuit step SHALL reference a movement that exists in the registry, and a test SHALL fail otherwise.
3. WHEN a circuit starts, THEN the sequencer SHALL be at step 0 in the work state.
4. WHEN a step's set ends, THEN the sequencer SHALL move to the rest state (unless it was the last step, in which case it SHALL move to done).
5. WHEN a rest ends or the user skips the rest, THEN the sequencer SHALL move to the work state of the next step.
6. WHEN the user skips a step, THEN the sequencer SHALL move on as if the step had ended with no result, and SHALL NOT save a set for it.
7. The circuit SHALL visit every step exactly once, in order, and the done state SHALL be terminal.
8. WHILE resting, the UI SHALL show a countdown, the name of the next step, and a "Skip rest" button. The countdown SHALL be announced at start and end only, not every second.
9. WHEN a circuit is done, THEN the app SHALL show a circuit summary with the per-step results and the totals.
10. Each completed set in a circuit SHALL be saved to history individually, tagged with the circuit id.
11. WHEN the user leaves a circuit midway, THEN the sets completed so far SHALL stay in history.

### R11. Local storage

**User story:** As a user, I want my sets and settings kept on my device only, so that I own my data.

Acceptance criteria:

1. The app SHALL store history and settings in IndexedDB through `idb-keyval`, in a dedicated store.
2. The stored data SHALL carry a schema version, and the app SHALL ignore (not crash on) data with an unknown version or an invalid shape.
3. The history SHALL keep at most 500 entries, dropping the oldest first.
4. IF IndexedDB is unavailable or throws, THEN the app SHALL keep working with in-memory storage and SHALL show a notice that history will not be saved.
5. The app SHALL provide a "Clear all data" action with a confirmation step that deletes the history and settings.
6. The app SHALL NOT send any history or settings over the network, and SHALL NOT use cookies.
7. A saved entry SHALL contain the set summary values, the movement id, the circuit id if any, the mode (camera or demo), the start time as epoch milliseconds, and the day key. It SHALL NOT contain video, images or landmarks.
8. WHEN the set was run in Demo clip mode, THEN it SHALL be saved with `mode: "demo"` and SHALL NOT count toward the streak.

### R12. Weekly streak

**User story:** As a user, I want a weekly streak, so that I am motivated to come back each week.

Acceptance criteria:

1. A set SHALL qualify for the streak if it was run in camera mode, and had at least 5 reps (rep workout) or at least 10 seconds of hold time (hold workout).
2. A streak week SHALL start on Monday and end on Sunday, using the local calendar date recorded in the entry's day key.
3. The week of a day key SHALL be computed from the day key by calendar arithmetic that does not depend on the current timezone or on daylight saving changes.
4. The current streak SHALL be the number of consecutive streak weeks that ends at the current week. IF the current week has no qualifying set yet, THEN the streak SHALL be counted back from the previous week, and SHALL NOT be broken until the current week ends without one.
5. IF the previous week and the current week both lack a qualifying set, THEN the current streak SHALL be 0.
6. The app SHALL also compute the longest streak over the whole history.
7. The streak SHALL be a pure function of the list of entries and a "today" day key.
8. WHEN a set is saved that makes the current week a streak week for the first time, THEN the UI SHALL show a celebration (R17) and the new streak number.
9. Entries with a day key in the future relative to today SHALL be ignored by the streak, so that a wrong clock cannot inflate it.

### R13. History screen

**User story:** As a user, I want to look back at what I did, so that I can see progress.

Acceptance criteria:

1. The history screen SHALL list saved sets, newest first, with the date, movement, result, and clean-rep percentage.
2. The history screen SHALL show the current streak, the longest streak and the totals for the current week (sets, reps, hold seconds).
3. IF there is no history, THEN the screen SHALL show a friendly empty state with a button to start a workout.
4. The history screen SHALL show demo-mode sets with a "Demo" label.
5. The history screen SHALL offer "Clear all data" (R11.5).
6. History SHALL be readable without a camera and without loading the pose model.

### R14. Screen flow and state

**User story:** As a user, I want a predictable flow, so that I always know what comes next.

Acceptance criteria:

1. The app SHALL have these screens: picker, mode, session (including circuit rest), summary, circuit summary and history.
2. The flow SHALL be picker, then mode, then session, then summary, then picker, "Again" or "Next". The history screen SHALL be reachable from the picker and SHALL return to it.
3. The screen state SHALL be a pure reducer over explicit actions, so that it can be tested without rendering.
4. WHEN the screen changes, THEN focus SHALL move to the new screen's heading, and the document title SHALL be updated.
5. The browser Back button SHALL NOT be required for any flow, and the app SHALL work as a single-page app with no router dependency.
6. WHEN the session screen unmounts for any reason, THEN the pipeline SHALL be stopped and listeners removed.

### R15. Privacy

**User story:** As a user, I want to know my video never leaves my device, so that I can use it at home with confidence.

Acceptance criteria:

1. The picker and mode screens SHALL state in plain language that pose detection runs on this device and that video and landmarks are never uploaded.
2. The app SHALL have no account, sign-in, analytics or tracking code.
3. The only network requests the app SHALL make are loading its own static assets and the MediaPipe model and WASM assets that `marrow-core` fetches when camera mode starts. Demo clip mode SHALL make no network request beyond the app's own assets.
4. The mode screen SHALL tell the user that camera mode downloads the pose model once (and from where), before the user chooses it.
5. The app SHALL NOT record, save or export video frames.

### R16. Halloween game look

**User story:** As a user, I want a bold, fun Halloween look that feels like a game, so that working out feels playful.

Acceptance criteria:

1. The app SHALL use a dark "midnight" background with neon bone-white as the main foreground color, and a small set of neon accents (for example pumpkin orange, toxic green, ghost purple), all defined as CSS custom properties in `global.css`.
2. The rep counter, hold timer and streak number SHALL be shown in a very large display size (at least 6rem for the live counter on a 360 px wide screen).
3. The look SHALL be clearly different from Steady: Steady is a light, calm, clinical theme, and Rattle Reps SHALL NOT reuse its tokens or layout.
4. The tone SHALL be spooky-cute (friendly skeleton, bones, pumpkins, ghosts) and SHALL NOT include gore or frightening imagery.
5. The UI SHALL use no third-party trademarks or brand names, and no external fonts or image assets that need a network request.
6. Decorative graphics SHALL be inline SVG or CSS, and SHALL be hidden from assistive technology (`aria-hidden`).
7. The layout SHALL work from 360 px wide phones to desktop, in portrait and landscape.

### R17. Celebratory effects

**User story:** As a user, I want small celebrations when I do well, so that effort feels rewarded.

Acceptance criteria:

1. WHEN a rep completes, a milestone is reached (every 5th rep), a set ends with at least 80% clean reps, or the streak increases, THEN the UI SHALL show a celebratory effect (for example bursting bones, pumpkin confetti or a pulsing glow).
2. Effects SHALL be built from CSS and SVG, with no external assets, and SHALL clean themselves up after at most 2 seconds.
3. Effects SHALL NOT flash more than 3 times in any one second.
4. Effects SHALL NOT cover the rep counter, the cue text or the controls, and SHALL NOT take focus or intercept pointer events.
5. IF the user prefers reduced motion (R18), THEN the effects SHALL use a static or fade-only form with no movement.

### R18. Reduced motion

**User story:** As a user sensitive to motion, I want the app to calm down, so that it does not make me uncomfortable.

Acceptance criteria:

1. WHILE `prefers-reduced-motion: reduce` matches, the app SHALL turn off CSS animations and transitions that involve movement, scaling or flashing.
2. WHILE `prefers-reduced-motion: reduce` matches, the canvas skeleton SHALL NOT rattle (R8.5) and SHALL still follow the pose.
3. The app SHALL react to a change of the media query during use, without a reload.
4. Information conveyed by an effect SHALL also be available as text (for example "Rep 5!" and "Streak: 3 weeks").

### R19. Accessibility and keyboard use

**User story:** As a keyboard or screen-reader user, I want to use every part of the app, so that I am not blocked.

Acceptance criteria:

1. Every control SHALL be reachable and operable with the keyboard, with a visible focus indicator that has a contrast ratio of at least 3:1 against its surroundings.
2. Text SHALL have a contrast ratio of at least 4.5:1 against its background, and large text at least 3:1 (WCAG AA), and a test of the theme tokens SHALL check this.
3. Interactive targets SHALL be at least 44 by 44 CSS pixels.
4. The session screen SHALL provide keyboard shortcuts for "Stop" (Escape) and "Pause" (Space) that are shown on the screen, and SHALL NOT trigger a shortcut while a text field has focus.
5. Pausing SHALL stop frame processing and SHALL stop the time-under-tension and hold clocks. Resuming SHALL continue from the paused state. In Demo clip mode, WHILE paused, the demo clip SHALL NOT advance, and no frame of the clip SHALL be skipped or consumed, so that resuming continues from the first undelivered frame.
6. Live regions SHALL follow R5.7 and R6.5, and the canvas SHALL have `aria-hidden="true"` and an adjacent text alternative (current rep count and last cue).
7. Toggles (voice, sound, show my video) SHALL be real buttons or checkboxes with an accessible name and a pressed or checked state.
8. No information SHALL be conveyed by color alone (R6.3).
9. The app SHALL set `lang` on the document and SHALL use semantic landmarks (`header`, `main`) and one `h1` per screen.

### R20. Replace the stub and keep the repo green

**User story:** As a maintainer, I want the real app to replace the stub cleanly, so that the repo stays healthy.

Acceptance criteria:

1. The stub in `apps/rattle-reps/src/App.tsx` SHALL be replaced, and `App.test.tsx` SHALL be rewritten to test the new app.
2. The app SHALL import `marrow-core` only through the package entry (R4.5, R4.6).
3. The app SHALL add `idb-keyval` as a dependency, and any test-only packages (for example `fake-indexeddb`) as dev dependencies, and SHALL commit the updated `package-lock.json`.
4. WHEN `npm run typecheck`, `npm test` and `npm run build` are run at the repo root on Node 22, THEN each SHALL exit with code 0, after every task in `tasks.md`.
5. The app SHALL NOT change `packages/marrow-core` or `apps/steady`.
6. The README SHALL describe the app, the demo-clip mode and how to regenerate fixtures.

### R21. Static deployment

**User story:** As a maintainer, I want to deploy the app as a static site on Vercel, so that judges can open a link.

Acceptance criteria:

1. `npm run build -w apps/rattle-reps` SHALL produce a static site in `apps/rattle-reps/dist`.
2. The app SHALL honor `VITE_BASE` for its base path, and all of its asset and fetch paths SHALL be relative to that base.
3. `apps/rattle-reps/vercel.json` SHALL keep the output directory `dist` and the single-page-app rewrite.
4. The camera and pose code SHALL be loaded lazily, so that the picker and history screens load without it.
5. The built site SHALL work when served from the base path and from the root, in demo-clip mode, with no server code.
6. The camera needs a secure context; the app SHALL detect an insecure context and offer Demo clip mode with an explanation.

## Correctness properties

Properties are tested with fast-check (Vitest). The pure modules they cover are in `design.md`.

**Summary math**

- **P1 (rep count):** for any generated event list, `summary.reps` equals the `count` of the last `rep` event (0 if none), and every `rep` count is strictly increasing by 1.
- **P2 (clean bounds):** `0 <= cleanReps <= reps`, and `cleanPct` is an integer in `[0, 100]`.
- **P3 (no warnings, all clean):** with no `form:warning` events, `cleanReps = reps` and `cleanPct = 100` when `reps > 0`.
- **P4 (warning monotonic):** adding a `form:warning` event never increases `cleanReps` and never increases `cleanPct`.
- **P5 (window attribution):** a warning at time `t` removes at most one clean rep: the rep whose window contains `t`. A warning after the last rep changes nothing.
- **P6 (all dirty):** if every rep window contains a warning, then `cleanReps = 0`.
- **P7 (TUT additive):** `tut` equals the sum of `durationMs` of rep events (rep workouts) or of hold durations (hold workouts), is at least 0, and does not depend on the order of the `form:warning` events.
- **P8 (summary is pure):** computing the summary twice from the same inputs gives deeply equal results, and the input arrays are not mutated.
- **P9 (hold clean share):** for a hold workout, `cleanPct` is in `[0, 100]`, equals 100 with no warnings, and is not increased by adding a warning.
- **P10 (open hold closed at stop):** a `hold:start` without a `hold:end` before the stop time contributes `stop - start` to TUT, and never a negative value.
- **P11 (grouping):** the per-rule warning counts in the summary add up to the number of `form:warning` events in the input.

**Streak calculation**

- **P12 (week of day):** for any valid day key, `weekStart(day)` is a Monday, is not after `day`, and is less than 7 days before it. All seven days of a Monday-to-Sunday span map to the same week start.
- **P13 (timezone independence):** `weekStart` and the streak give the same result whatever the `TZ` environment value, because they use only day keys.
- **P14 (consecutive weeks):** for a generated set of N consecutive qualifying weeks ending at the current week, the current streak is N.
- **P15 (gap breaks):** removing any week that is not the current week from such a run makes the current streak equal the number of consecutive weeks after the gap.
- **P16 (grace for the current week):** if the current week has no qualifying set, the streak equals the run that ends at the previous week, and adding one qualifying set in the current week increases it by exactly 1.
- **P17 (stale is zero):** if neither the current nor the previous week has a qualifying set, the streak is 0.
- **P18 (order independence):** shuffling the entries gives the same streak, and duplicate entries give the same streak as one copy.
- **P19 (non-qualifying ignored):** adding demo-mode sets or sets below the minimum never changes the streak.
- **P20 (bounds):** `0 <= current <= longest <= number of distinct qualifying weeks`.
- **P21 (future ignored):** adding entries with a day key after today never changes the streak.
- **P22 (Sunday-Monday boundary):** a qualifying set on a Sunday and one on the next day (Monday) fall in two different consecutive weeks, including across month ends, year ends and leap days.

**Circuit sequencing**

- **P23 (order):** driving a circuit of N steps with any sequence of "set ended", "rest ended", "skip step" and "skip rest" actions until done visits the step indexes `0, 1, ..., N - 1` in order, each exactly once in the work state.
- **P24 (index bounds):** the step index is always in `[0, N - 1]`, and never decreases.
- **P25 (rest placement):** a rest state occurs after every step except the last, and never before the first step.
- **P26 (done is terminal):** once done, every further action leaves the state unchanged.
- **P27 (irrelevant actions ignored):** an action that does not apply to the current state (for example "rest ended" while working) leaves the state unchanged.
- **P28 (termination):** any action sequence that ends every work state and every rest state reaches done in at most `2N - 1` transitions.
- **P29 (results alignment):** the recorded results list has one entry per step reached, in step order, and a skipped step has no saved set.
- **P30 (all presets valid):** every preset circuit has at least one step, every step references a registry movement, targets are positive, and rest durations are non-negative.

**Screen flow and storage**

- **P31 (screen reducer):** for any action sequence, the screen state is always one of the defined screens. A new run starts only from "mode" through `chooseMode`. "session" is otherwise entered only from "summary" through `again` (same run) or, for a circuit with steps left, `next` (next step), as required by R14.2. No other transition into "session" exists.
- **P32 (history cap):** appending any number of entries to a history of any size keeps at most 500 entries, keeps the newest, and preserves order.
- **P33 (storage decode):** decoding arbitrary JSON never throws, and returns either a valid versioned history or an empty one.
- **P34 (day key round trip):** for any epoch time and any timezone offset used in the tests, the day key is a valid `YYYY-MM-DD` string whose parts are the local calendar date.

**Movements**

- **P35 (replay determinism):** replaying any demo fixture twice through fresh engines, and through the fixture player and `replay()`, gives deeply equal event lists.
