# Tasks: steady

Each task leaves `npm run typecheck`, `npm test` and `npm run build` green at the repo root (Node 22, as in CI), and is one small commit. Tests are written in the same task as the code they cover. Requirement and property numbers refer to `requirements.md`. Do not edit `packages/marrow-core`. Import the core only as `marrow-core` (plus the `marrow-core/specs/*` and `marrow-core/fixtures/*` data exports if needed).

When a task adds a dependency, update `package-lock.json` in the same commit (`npm install` at the repo root) so `npm ci` in CI passes.

- [x] 1. Theme tokens, app shell and disclaimer
  - Add dev dependencies to `apps/steady/package.json`: `fake-indexeddb`, `axe-core`; runtime: `idb-keyval`. Commit the updated `package-lock.json`.
  - Rewrite `src/global.css` with the design tokens (calm light palette, `--font-size: 1.125rem`, focus ring, reduced-motion block, `.btn` with `min-height: 3rem`). Add `src/print.css` placeholder imported from `main.tsx`.
  - Replace the stub `src/App.tsx` with a shell: skip link, header with the inline skeleton mark, `<main id="content">`, persistent footer with the disclaimer and privacy text (R12.1). Keep a single placeholder "Choose a test" heading for now. Remove the stub's camera and clip code.
  - Tests: update `src/App.test.tsx` (footer text present, skip link first in tab order, main landmark). Add `src/contrast.test.ts` that parses `global.css` tokens and checks the 7:1 and 4.5:1 pairs (R15.2).
  - Requirements: R12.1, R15.1, R15.2, R15.4, R16.

- [x] 2. Movement specs and test catalogue
  - Add the seven JSON specs in `src/movements/` (design, "Movement specs").
  - Add `src/tests.ts` with `TestDef` and the catalogue (specs, titles, summaries, units, limits, required landmarks, setup steps, prompt scripts). Clips are added in task 3, so use a typed `clip` field that is filled in then (keep the build green by adding the field in task 3).
  - Tests: `src/movements/specs.test.ts` runs `parseMovementSpec` on every `*.json` in the folder (via `import.meta.glob`) and checks that each catalogue entry maps to a valid spec and that catalogue ids equal the file names (R1.1, R1.2, R1.7). Add a test that no source file in `apps/steady/src` imports a deep `marrow-core` path (R1.8).
  - Requirements: R1.

- [x] 3. Demo clip generator and clips
  - Add `scripts/make-clips.ts` (pattern: `packages/marrow-core/scripts/make-fixture.ts`) that writes seven fixtures to `src/clips/`, with the designed outcomes from the design table exported from a small shared module the tests import. Add an npm script `make-clips`.
  - Commit the generated clips. Add the `clip` field to the catalogue entries.
  - Tests: every clip passes `parseFixture`; regenerating reproduces the committed files; replaying each clip through `createEngine` or `replay()` with the matching spec gives the designed events (rep counts, hold start and end times, sway warning time, `rom:sample` extremes), so the specs are tuned against the clips (R13.1, R13.2, R13.4).
  - Requirements: R13.1, R13.2, R13.4, R13.5.

- [x] 4. ROM and asymmetry logic with properties
  - `src/logic/rom.ts` (`isValidAngle`, `kneeFlexion`, `selectPeak`) and `src/logic/asymmetry.ts` (`asymmetryPct`, `describeAsymmetry`).
  - Tests: unit cases (empty input, NaN only, equal sides, zero sides) plus fast-check P1 to P8.
  - Requirements: R5.2 to R5.5, R6. Properties: P1 to P8.

- [x] 5. Chair stand counter and stance timer with properties
  - `src/logic/chairStand.ts` (`createChairStandCounter`) and `src/logic/stance.ts` (`createStanceTimer`) as in the design.
  - Tests: unit cases including the +1 standing rule, late events, sway before hold start, `lost-pose`, the 30-second cap and `stopByUser`; fast-check P9 to P16 with generators for event sequences with non-decreasing `t`.
  - Add tests that feed the events produced by replaying the task 3 clips through the counter and the timer and match the designed outcome (R7, R8, R13.4).
  - Requirements: R7, R8. Properties: P9 to P16.

- [x] 6. Trend aggregation with properties
  - `src/logic/trend.ts` (`aggregateByDay`, `summarize`) with an injectable time-zone offset.
  - Tests: unit cases (one record, same-day records, midnight boundary, empty) plus fast-check P17 to P20.
  - Requirements: R10.4, R10.5. Properties: P17 to P20.

- [x] 7. History storage and preferences
  - `src/data/history.ts` (`saveRecord`, `listRecords`, `deleteRecord`, `clearAll`, `isHistoryRecord`, `StorageUnavailableError`) with `idb-keyval` `createStore('steady', 'history')`. `src/data/prefs.ts` for voice, age band and acknowledgement.
  - Tests with `fake-indexeddb/auto`: round trip, delete, clear, corrupt entries skipped, storage failure maps to `StorageUnavailableError`; fast-check P21 for the record guard and round trip.
  - Requirements: R10.1, R10.2, R10.7 (data side), R10.8 (data side). Property: P21.

- [x] 8. Reference context and result model
  - `src/reference.ts` with sourced entries, verified against the cited sources (omit any number that cannot be verified). `src/logic/result.ts` builds a view model from a finished run (value, unit, stop reason text, "Stopped early", source label, reference lines, the fixed non-diagnosis line).
  - Tests: no verdict words appear in any view model (R9.4); the non-diagnosis line is always present (R9.3); chair stand threshold depends on the age band (R9.5); `kneeFlexion` and rounding are applied (R5.5).
  - Requirements: R9.2 to R9.5.

- [x] 9. Speech service and prompt gate
  - `src/services/speech.ts` (injectable `speak`, `cancel`, `available`) and `src/logic/prompts.ts` (`createPromptGate`). Voice preference hook in `src/data/prefs.ts`.
  - Tests with a fake `speechSynthesis`: cancel before speak, cancel on stop, unavailable case hides the control and still returns the text, same text is not repeated within 4 s.
  - Requirements: R4.3, R4.5, R14.

- [ ] 10. Session machine and controller
  - `src/session/machine.ts` (pure reducer for screens and run states), `src/services/source.ts` (`createSource(mode, test)`; the camera source is created only on request), `src/logic/readiness.ts`, and `src/session/useSession.ts` that wires the pipeline, the logic modules, the 5-second countdown and the end-of-run rules for ROM, chair stand and stance.
  - Tests: reducer cannot reach `running` except from `countdown` and cannot start before the safety confirmation (R3.3); readiness needs one continuous second (R3.4); a headless controller test runs every demo clip to its result with a fake clock and checks the result equals the designed outcome; ROM run ends after 3 reps, on Done, or at 60 s (R5.1); camera errors surface typed messages and offer the demo (R3.5); `stop` releases the source (R4.7).
  - Requirements: R3.4 to R3.6, R4, R5.1, R7.1, R8.2.

- [ ] 11. Home, About and Setup screens
  - `src/ui/Home.tsx` (grouped tests, left/right choices, last result, source choice, voice toggle, history link), `src/ui/About.tsx` (first-launch acknowledgement, R12.2), `src/ui/Setup.tsx` (guidance, safety notice with confirm, camera preview with skeleton and "Ready" indicator, error and demo fallback). Focus moves to each `<h1>`.
  - Tests with Testing Library: choose a test, Start stays disabled until the safety confirmation, keyboard-only flow, demo needs no permission prompt (the camera source factory is not called), first-launch About appears once.
  - Requirements: R2, R3, R12.2, R13.7, R15.4.

- [ ] 12. Countdown, Run and Result screens
  - `src/ui/Countdown.tsx`, `src/ui/Run.tsx` (canvas overlay via `drawSkeleton`, large `aria-live` prompt, live value, time, Stop and Done, Pause and Play for the demo preview), `src/ui/ResultCard.tsx` (value, context, asymmetry when the other side exists for the day, Save, Try again, Back). Wire saving to `data/history.ts`.
  - Tests: demo flow for every test from Home to a saved result using the committed clips and fake timers (R13.3); prompts are `role="status"`; Stop is reachable by keyboard; speech cancelled on leaving; reduced-motion removes countdown animation; "Foot was not lifted" and "No movement detected" are not saved; a storage failure shows the message and keeps the card printable.
  - Requirements: R4, R5, R7, R8, R9.1, R9.6, R9.7, R13.3, R13.6.

- [ ] 13. History and trend chart
  - `src/ui/History.tsx` (per test and side lists, delete one with confirmation, delete all with confirmation, empty state, "Include demo clips" toggle) and `src/ui/TrendChart.tsx` (inline SVG with title, desc, table alternative, shape markers).
  - Tests: shows newest first; chart points equal `aggregateByDay` output; table matches the points; deleting asks for confirmation; empty state text; demo toggle filters records and labels demo rows.
  - Requirements: R10.3, R10.6, R10.7, R10.9, R15.8.

- [ ] 14. Printable progress report
  - `src/ui/Report.tsx` (date range, per test summary, asymmetry, chart and table, sources, disclaimer and privacy) and the full `src/print.css`. "Print or save as PDF" calls `window.print()`.
  - Tests: summaries match `summarize`; asymmetry shown only for same-day left and right pairs; no records message with print still available; `window.print` is called on click; `print.css` contains the hide, `break-inside: avoid` and black-on-white rules (lint-style check).
  - Requirements: R11, R12.3.

- [ ] 15. Accessibility pass
  - Run `axe-core` on every screen in jsdom (colour-contrast rule off, covered by the token test). Fix findings. Check 48px target rules, 200% zoom layout (no fixed pixel widths), focus order, skip link and `lang` on `index.html`.
  - Tests: `src/a11y.test.tsx` with an axe helper over all screens; tab-order test for Home, Setup, Run and Result; CSS lint test for the reduced-motion block and the target size rule.
  - Requirements: R15, R16.

- [ ] 16. Docs and production build ready for Vercel
  - Write `apps/steady/README.md` (what it is, run, demo mode, how to add a test, disclaimer, privacy, deploy). Add a Steady section to the root `README.md` if the structure expects one. Keep `vercel.json` (output `dist`, SPA rewrite) and confirm `VITE_BASE` is honoured.
  - Verify: `npm ci`, `npm run typecheck`, `npm test` and `npm run build` at the root all exit 0; `apps/steady/dist` exists with `index.html`, hashed assets and the clips bundled; a test or script check shows the demo path does not fetch `@mediapipe/tasks-vision` or any network URL (the MediaPipe import stays dynamic and out of the entry chunk); no `console.error` output in tests; no files outside `apps/steady`, `README.md` and the lockfile changed.
  - Mark all tasks above as done in this file.
  - Requirements: R17, R12.4.
