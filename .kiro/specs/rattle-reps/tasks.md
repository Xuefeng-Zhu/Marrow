# Tasks: rattle-reps

Each task leaves `npm run typecheck`, `npm test` and `npm run build` green at the repo root (Node 22, as in CI). Each task is one small commit. Tests are written in the same task as the code they cover. Requirement and property numbers refer to `requirements.md`. Only `apps/rattle-reps` changes (plus `package-lock.json`, README and docs where a task says so). No task edits `packages/marrow-core` or `apps/steady`.

- [x] 1. Movement specs and registry
  - Add `src/movements/{squat,push-up,lunge,jumping-jack,plank}.json` with the metrics, phases, holds and form rules from the design, including the `rom` entry sampled on `rep` for the squat and push-up depth metric.
  - Add `src/movements/registry.ts` (parse with `parseMovementSpec`, export `WORKOUTS` and `getWorkout`) and `src/movements/workouts.ts` (targets, phase cues, voice lines, blurbs, camera tips).
  - Confirm the `offset` sign convention in `packages/marrow-core/src/engine/metrics.ts` (read only) and note it in the test file.
  - Tests: every JSON in the folder parses, ids equal file names, each spec has the required rules and messages of at most 40 characters, squat and push-up declare the `rep` rom entry, the plank has a hold, the registry is the only importer of the JSON.
  - Keeps typecheck, test and build green. Requirements: R1.1 to R1.13.

- [x] 2. Hygiene tests for core imports
  - Add a test that scans `src/` and `scripts/` and fails on any import of a `marrow-core/` sub-path.
  - The stub `App.tsx` still has two deep imports at this point, so in the same task make the stub import nothing from `marrow-core/fixtures` or `marrow-core/specs`: render from the registry spec and a tiny inline stub frame source, keeping the stub's existing test passing (or update that test).
  - Keeps typecheck, test and build green. Requirements: R4.5, R4.6, R20.2.

- [x] 3. Fixture generator and committed fixtures
  - Add `scripts/make-fixtures.ts` (synthetic kinematic rig, local MediaPipe indices, type-only import of `Fixture` from `marrow-core`, Node-only otherwise) and the `make-fixtures` npm script.
  - Generate and commit `src/fixtures/{squat,push-up,lunge,jumping-jack,plank}.json` and add `src/fixtures/index.ts` (`parseFixture` on load, `getFixture`).
  - Tests: committed equals generated (byte for byte), `parseFixture` accepts each file, replay through `createEngine` gives the expected reps or hold and warning rule ids for every movement, replay twice is deeply equal and equals the fixture-player result (P35).
  - The squat and push-up clips include two consecutive shallow reps (design section 4). The replay test asserts both the raw core output (one `shallow-depth`) and the merged output after `depthCheck` (two). Because `depthCheck` lands in task 8, task 3 asserts the raw core output and the rep counts, and the merged assertion is added in task 8.
  - Tune spec thresholds from task 1 where the replay shows a mismatch, in the same task.
  - Keeps typecheck, test and build green. Requirements: R3.4, R3.5, R4.1 to R4.4, R1.6 to R1.10; property P35.

- [x] 4. Summary math
  - Add `src/summary/summarize.ts` with types `SummaryInput`, `SetSummary`, `WarningTally`.
  - Implement rep windows, clean reps and clean percentage, TUT for reps and holds (including an open hold closed at stop), hold clean share, and warning grouping.
  - Tests: worked examples (including a warning at the set start, at a rep time, after the last rep, and a `lost-pose` hold: start 0, `hold:end` at `t = 2000` with `durationMs = 1200`, warning at 1000, expecting `cleanPct` 83 and not 17, plus a warning after `start + durationMs` adding no dirty time) plus fast-check P1 to P11 and P9b with an independent naive oracle.
  - Keeps typecheck, test and build green. Requirements: R9.1 to R9.9; properties P1 to P11 and P9b.

- [x] 5. Day keys and weekly streak
  - Add `src/streak/dayKey.ts` (`toDayKey`, `dayNumber`, `weekIndex`, `weekStart`) and `src/streak/streak.ts` (`qualifies`, `computeStreak`, exported constants for the minimums).
  - Tests: examples across month, year and leap-day ends and a Sunday to Monday boundary, plus fast-check P12 to P22 with a day-by-day oracle, and a run under a changed `process.env.TZ`.
  - Keeps typecheck, test and build green. Requirements: R12.1 to R12.7, R12.9, R11.7 (day key); properties P12 to P22, P34.

- [x] 6. Circuit sequencing
  - Add `src/circuits/sequencer.ts` (`init`, `step`, types), `src/circuits/presets.ts` (at least three presets, one using all five movements) and `restSecondsLeft`.
  - Tests: examples plus fast-check P23 to P29 with generated circuits and random action sequences, and P30 for presets against the registry.
  - Keeps typecheck, test and build green. Requirements: R2.2, R10.1 to R10.7, R10.10; properties P23 to P30.

- [x] 7. Storage codec and store
  - Add `idb-keyval` as a dependency and `fake-indexeddb` as a dev dependency of `apps/rattle-reps`, and commit the updated `package-lock.json`.
  - Add `src/storage/codec.ts` (versioned records, hand-written validation, `appendHistory` with the 500 cap) and `src/storage/store.ts` (idb-keyval store, in-memory fallback, serialized writes, `clearAll`).
  - Tests: P32 and P33 as properties, store round trip with `fake-indexeddb`, fallback when idb throws, unknown version ignored but not overwritten, `clearAll`, settings default to muted.
  - Keeps typecheck, test and build green. Requirements: R11.1 to R11.8, R7.8, R20.3; properties P32, P33.

- [x] 8. Screen reducer and cues
  - Add `src/session/screenReducer.ts` (pure screen state machine with circuit state held in the run), and `src/session/cues.ts` (`cueFor`, `nextCue` with 2 s minimum visibility, `shouldEmit` rate limiter, milestone rule).
  - Add `src/session/depthCheck.ts` (pure `withDepthWarnings(events, workoutId)`: adds one `shallow-depth` warning per shallow rep window from `rom:sample`, skipping windows where the core already warned) and extend the fixture replay test with the merged assertions (consecutive shallow reps give two warnings, `cleanReps` excludes both).
  - Tests: reducer examples and P31 (including `again` and circuit `next` from `summary` into `session`, and no other way into `session`), depthCheck examples (consecutive shallow reps alternating 105 and 170 degrees, a shallow rep after a clean one, no duplicate when the core warned) and a property that each rep window has at most one `shallow-depth` warning after merging, cue mapping for every event type, warning replacement and expiry, rate limiter never exceeds 3 per second.
  - Keeps typecheck, test and build green. Requirements: R5.2, R6.1 to R6.5, R1.14, R14.1 to R14.3, R17.3; property P31.

- [x] 9. Session controller and sources
  - Add `src/session/sourceFactory.ts` (demo with `createFixturePlayer`, camera with a dynamic import and `createMediaPipeSource`, secure-context check), `src/session/pausableSource.ts` (camera pause), `src/session/pausableClock.ts` (demo pause through the injectable `Clock` of `createFixturePlayer`), `src/session/sessionController.ts` (the React-free controller), `src/session/cameraSource.ts` (the lazy camera chunk) and `src/session/useSession.ts` (pipeline wiring, every core event including `rom:sample` passes through `withDepthWarnings` before the event log and cues, event log, live view reducer, end on target only after the terminal frame's `rom:sample` is processed (design section 5 step 4), fixture end or stop, cleanup). `pausableSource` takes `holdGapMs` and `isHoldActive`.
  - Tests with a scripted fake `PoseSource`: counter equals the last `rep` count, set ends at the target, stop closes an open hold, unmount stops the pipeline and removes listeners, camera error exposes the demo fallback, camera pause drops frames and keeps `t` increasing (add a property: for any pause pattern, output `t` is strictly increasing and no `durationMs` includes paused time), a camera pause during an active hold with a real engine yields one `hold:end` with reason `lost-pose` on the first frame after resume even for a short pause and for normal frame spacing, with `durationMs` not including the pause, and a pause with no open hold leaves a one-frame gap and no `lost-pose`, a final shallow rep that reaches the target still gets its synthesized `shallow-depth` warning in the log and `cleanReps` excludes it (the set ends only after the `rom:sample`), demo pause with a fake clock delivers every fixture frame exactly once and in order, with the recorded `t`, for any pause pattern (including a pause longer than the remaining clip, which must not end the clip), and a demo hold open at pause continues after resume, demo mode never calls `getUserMedia`.
  - Keeps typecheck, test and build green. Requirements: R1.14, R3.2, R3.3, R3.6, R3.7, R3.10, R5.1 to R5.6, R9.5, R9.6, R14.6, R19.5.

- [x] 10. Theme tokens and base layout
  - Replace `global.css` with the Halloween tokens, big-number type scale, focus ring, 44 px targets and the reduced-motion media query. Add `src/theme/tokens.ts`, `src/theme/useReducedMotion.ts` and a shared `Layout` (header, main, one `h1`).
  - Tests: WCAG contrast ratios for every text, background and focus pair (4.5:1 text, 3:1 large text and focus), `useReducedMotion` follows a mocked `matchMedia` change.
  - Keeps typecheck, test and build green. Requirements: R16.1 to R16.7, R18.1, R18.3, R19.1 to R19.3, R19.9.

- [x] 11. Picker and mode screens
  - Add `ui/Picker.tsx` (workouts, preset circuits, streak badge placeholder, history link, privacy line) and `ui/Mode.tsx` (Camera and Demo clip, model download notice, camera placement tip, insecure-context handling, "not medical advice" line). Wire them into `App.tsx` with the screen reducer, focus management and document title.
  - Tests: lists all five workouts and the presets, activating an entry opens the mode screen, Demo clip does not touch `getUserMedia`, camera disabled with an explanation when `navigator.mediaDevices` is missing, focus moves to the `h1`.
  - Keeps typecheck, test and build green. Requirements: R2.1 to R2.7, R3.1, R14.4, R14.5, R15.1, R15.4, R21.6.

- [x] 12. Live session screen
  - Add `ui/Session.tsx`, `ui/Counter.tsx`, `ui/CueBar.tsx`, `ui/SkeletonCanvas.tsx` (rAF loop, `drawSkeleton`, tint, whole-figure rattle with a pure `rattleOffset`), the "Demo clip" label, the show-my-video toggle, Stop and Pause controls with Escape and Space shortcuts, and the pose-lost cue. Lazy-load the session screen with `React.lazy`.
  - Tests: counter and aria-live text, warning cue visibility and replacement, canvas `aria-hidden` with a text alternative, shortcuts work and are ignored in text inputs, rAF cancelled on unmount, `rattleOffset` is zero after 600 ms and always zero under reduced motion.
  - Keeps typecheck, test and build green. Requirements: R3.9, R5.1 to R5.7, R6.1 to R6.6, R8.1 to R8.7, R19.4 to R19.6, R21.4.

- [x] 13. Voice and sound
  - Add `audio/voice.ts` and `audio/sound.ts` and `ui/Toggles.tsx`. Voice off by default, sound muted by default, `AudioContext` created only on the explicit unmute click, at most one queued warning utterance, speech cancelled on end or stop, toggles disabled with a reason when unsupported. Persist both through the settings store.
  - Tests: no `AudioContext` before unmute, rep triggers the rattle only while sound is on, warnings and every 5th rep are spoken only while voice is on, cancel on stop, unsupported browsers disable the toggle, toggles have accessible names and pressed state.
  - Keeps typecheck, test and build green. Requirements: R7.1 to R7.8, R19.7.

- [x] 14. Celebratory effects and reduced motion
  - Add `ui/Effects.tsx` (SVG and CSS bones and pumpkins, at most 2 s life, no focus or pointer capture, rate-limited by `shouldEmit`), the milestone, clean-set and streak triggers, and the text fallbacks.
  - Under reduced motion use static or fade-only effects, no rattle, and text badges.
  - Tests: an effect cleans itself up within 2 s (fake timers), no more than 3 effects start within any second, effects are `aria-hidden` and `pointer-events: none`, reduced motion removes movement classes and the text badge remains.
  - Keeps typecheck, test and build green. Requirements: R5.3, R8.5, R17.1 to R17.5, R18.1 to R18.4.

- [x] 15. Set summary and circuit flow
  - Add `ui/Summary.tsx` and `ui/CircuitSummary.tsx`, the rest screen with countdown and "Skip rest", Again, Next and Home actions, the "No reps yet" state, and saving each completed set to history through the store with the streak before and after comparison. Wire `circuits/sequencer.ts` into the session flow.
  - Tests: summary values match `summarize`, zero-rep sets are not saved, demo sets are saved with `mode: "demo"` and do not extend the streak, a circuit runs all steps in order in demo mode with each step's own fixture, skip step and skip rest, leaving midway keeps completed sets, rest announcement happens at start and end only.
  - Keeps typecheck, test and build green. Requirements: R3.8, R9.1 to R9.11, R10.1 to R10.11, R11.8, R12.8.

- [x] 16. History and streak screen
  - Add `ui/History.tsx` (list newest first, demo label, current and longest streak, this week's totals, empty state, "Clear all data" with confirmation, no-persistence notice) and show the live streak on the picker.
  - Tests: ordering and labels, empty state, totals computed from entries with a fixed "today", clear requires confirmation and empties storage, the screen does not import the session chunk (checked by a module graph test or by lazy boundary test), works with the in-memory fallback.
  - Keeps typecheck, test and build green. Requirements: R2.6, R11.4, R11.5, R12.4 to R12.8, R13.1 to R13.6.

- [ ] 17. Accessibility pass and end-to-end keyboard tests
  - Audit and fix: landmarks, one `h1` per screen, focus order and focus on screen change, visible focus, 44 px targets (CSS check), live region politeness, no color-only information, `lang`, titles.
  - Add end-to-end style tests with `user-event` that drive picker, mode, a demo session (fake clock, scripted source), summary, history using only the keyboard.
  - Keeps typecheck, test and build green. Requirements: R14.4, R19.1 to R19.9, R6.3.

- [ ] 18. Remove the stub and update docs
  - Delete the remaining stub code in `App.tsx` and rewrite `App.test.tsx` to cover the app shell. Confirm there are no `marrow-core/fixtures` or `marrow-core/specs` imports left anywhere in the app.
  - Update the root `README.md` Rattle Reps section, add `apps/rattle-reps/README.md` (what it is, demo-clip mode, how to add a movement, how to regenerate fixtures with `npm run make-fixtures -w apps/rattle-reps`, privacy notes), and update `docs/architecture.md` with a pointer to this spec.
  - Keeps typecheck, test and build green. Requirements: R4.5, R20.1, R20.2, R20.5, R20.6.

- [ ] 19. Final: production build ready for Vercel
  - Run the full root checks from a clean install: `npm ci && npm run typecheck && npm test && npm run build`.
  - Verify `npm run build -w apps/rattle-reps` output in `apps/rattle-reps/dist` with `VITE_BASE` unset and with `VITE_BASE=/rattle-reps/`, served by `vite preview`, and check that assets resolve and demo mode runs for all five movements in both cases.
  - Confirm `vercel.json` keeps `outputDirectory: dist` and the SPA rewrite. Confirm the session and camera code are in separate lazy chunks from the picker and history, and record chunk sizes in the README.
  - Add Vercel deploy notes to the app README (root directory, install and build commands, `VITE_BASE`).
  - Check there are no uploads or network calls in demo mode other than the app's own assets, no `AudioContext` before unmute, no em dash characters in the app source, and `git status` is clean after the build (no generated files outside `dist`).
  - Manual smoke (not CI): camera mode on a real device over HTTPS, camera denied fallback, reduced-motion setting on and off, keyboard-only run.
  - Keeps typecheck, test and build green. Requirements: R20.4, R21.1 to R21.6, R15.3.
