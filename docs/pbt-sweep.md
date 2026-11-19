# PBT sweep

Done by following the `property-hunter` agent prompt (`.kiro/agents/property-hunter.json`) by hand, because custom agents cannot be launched as sub-agents in this environment. Specs: `.kiro/specs/{marrow-core,steady,rattle-reps}`. Property numbers come from each spec's `requirements.md`.

Result: every numbered property is covered by a P-tagged test. All are `fc.assert` properties except the three listed under "Justified example tests". No existing test was weakened; this PR only adds tests.

## marrow-core (P1..P24)

| P | Test |
|---|---|
| P1-P4 | `src/geometry.test.ts` |
| P5 | `src/geometry.test.ts`, `src/engine/metrics.test.ts` |
| P6-P10 | `src/smoothing/oneEuro.test.ts` |
| P11-P14, P16-P19, P22-P24 | `src/engine/engine.test.ts` (P24 rejection side in `src/spec/parse.test.ts`) |
| P15 | `src/sources/fixturePlayer.test.ts` (example test, see below) |
| P20, P21 | `src/spec/parse.test.ts` |

## steady (P1..P21)

| P | Test |
|---|---|
| P1-P5 | `apps/steady/src/logic/rom.test.ts` |
| P6-P8 | `apps/steady/src/logic/asymmetry.test.ts` |
| P9-P12 | `apps/steady/src/logic/chairStand.test.ts` |
| P13-P16 | `apps/steady/src/logic/stance.test.ts` |
| P17-P20 | `apps/steady/src/logic/trend.test.ts` |
| P21 | `apps/steady/src/data/history.test.ts` |

## rattle-reps (P1..P35)

| P | Test |
|---|---|
| P1-P11 | `apps/rattle-reps/src/summary/summarize.test.ts` |
| P12-P22, P34 | `apps/rattle-reps/src/streak/streak.test.ts` (P13 holds by construction: only day keys are used) |
| P23-P29 | `apps/rattle-reps/src/circuits/sequencer.test.ts` |
| P30 | `apps/rattle-reps/src/circuits/sequencer.test.ts` (example test, see below) |
| P31 | `apps/rattle-reps/src/session/screenReducer.test.ts` |
| P32, P33 | `apps/rattle-reps/src/storage/storage.test.ts` |
| P35 | `apps/rattle-reps/src/fixtures/fixtures.test.ts` (example test, see below) |

### Justified example tests

- core P15, rattle-reps P35: the claim is about the committed fixtures, a finite set, so each fixture is replayed and compared. The generic determinism of `replay` and the engine is covered by core P16 and P11-P14 properties.
- rattle-reps P30: the claim is about the finite list of preset circuits, so every preset is checked.

## Open review findings

| Finding | Tests added (this PR) | Existing tests | Status |
|---|---|---|---|
| Steady: sway warning before the hold starts | `logic/stance.test.ts` "early sway warning properties" (any lift time, any set of warnings, result is the earliest warning at or after the lift, earlier ones dropped, cap applied) | unit cases and P13/P16 | already handled, passes |
| Steady: chair/ROM deadlines when frames stop | `session/controller.test.ts` "deadline property" (chair stand, shoulder, knee; any frame cut-off; exactly one outcome, none before the deadline, with `window` or `timeout`) | example tests with fake timers | already handled, passes |
| Steady: shoulder projection plane | `movements/specs.test.ts` property: `shoulderAngle` is bit-identical when z is changed, for both sides | plane `xy` example test | already handled, passes |
| Rattle Reps: paused demo playhead | `session/pausableClock.test.ts` property (a timer fires after exactly its delay of running time under any pause pattern, never early, never late) | `sessionController.test.ts` frame-for-frame property for any pause pattern | already handled, passes |
| Rattle Reps: latched warnings | `session/depthCheck.test.ts` property through the real core engine: any mix of shallow and deep squats gives exactly one `shallow-depth` warning per shallow rep window and `cleanReps` equals the deep reps | synthetic depthCheck property | already handled, passes |
| Rattle Reps: camera hold termination | `session/pausableSource.test.ts` property: a pause at any point in a hold, of any length, ends it exactly once with `lost-pose` at `last t + holdGapMs + 1`, duration excludes paused time, `t` strictly increases | two example cases | already handled, passes |
| Rattle Reps: terminal ROM sample | `session/sessionController.test.ts` property for squat and push-up with any rep target: exactly one `rom:sample` at the last rep time, one `shallow-depth` warning in the final window when shallow, no event after the last rep, `summary.reps = target` | final shallow rep example | already handled, passes |

Lunge and jumping jack have no `rom` entry sampled on `rep`, so the terminal-sample property covers squat and push-up only.

## Counterexamples found and fixed

None. Every new property passed against the unchanged source. Two failures during development were mistakes in the new tests, not code bugs, and were fixed in the tests:

- shallow squat generator used angles up to 112, but the core only enters a phase when the value is at least `hysteresis` inside its range (110), so those reps never happened;
- a ROM run legitimately ends after three reps (R5.1), so the deadline property cuts frames before the third rep.

No change was made to `packages/marrow-core/src` or to any non-test file under `apps/*/src`.
