# Rattle Reps

A playful, spooky workout coach for people without a trainer. A friendly skeleton overlay mirrors you, counts your reps, rattles its bones on every rep and nags you about your form. It is the first of two apps built on the [Marrow](../../README.md) pose engine.

- Five movements: squat, push-up, lunge, jumping jack and plank hold.
- Three preset circuits with rests between steps.
- Set summary with clean-rep percentage, time under tension and form warnings.
- Weekly streak and history, stored on this device only.
- Optional voice and synthesized bone-rattle sound. Both are off until you turn them on. There is no licensed audio and no music.
- Respects `prefers-reduced-motion`, works with the keyboard alone (Space pauses, Esc stops) and has no color-only information.

Design, requirements and tasks: [`.kiro/specs/rattle-reps/`](../../.kiro/specs/rattle-reps/design.md).

## Demo clip mode

Choose **Demo clip** on the mode screen to run any movement with no camera. A committed landmark clip (`src/fixtures/*.json`) goes through the same pipeline as the webcam: smoothing, rules engine, cues, summary. Demo sets are saved with a "Demo" label and never count toward the streak.

## Run

From the repo root (Node 22):

```bash
npm ci
npm run dev -w apps/rattle-reps
```

## Add a movement

Rules are data, so a movement is mostly a JSON spec.

1. Add `src/movements/<id>.json` (see the [movement spec reference](../../docs/movement-spec.md)).
2. Register it in `src/movements/registry.ts` and add its presentation (target, cues, blurb, camera tip, fixture id) to `src/movements/workouts.ts`.
3. Add a clip for it in `scripts/make-fixtures.ts` and regenerate (below).
4. Run `npm test`. The movement tests check every spec, presentation and fixture.

## Regenerate the demo clips

```bash
npm run make-fixtures -w apps/rattle-reps
```

The clips are synthetic: they are built from joint angles with a small kinematic rig, so no camera or person is recorded. A test checks that the committed JSON equals the script output.

## Privacy

- Pose detection runs on this device. Video and body landmarks are never uploaded.
- Camera mode downloads the pose model (about 6 MB) once from Google storage and the MediaPipe code from the jsDelivr CDN. Demo clip mode downloads nothing beyond the app's own files.
- History and settings live in IndexedDB on this device (a store named `rattle-reps`). No cookies. If IndexedDB is not available the app keeps them in memory and says so.
- **Clear all data** on the history screen deletes both after a confirmation.
- Not medical advice.

## Deploy to Vercel

The app is a static site. Create a Vercel project from the repo with:

| Setting | Value |
| --- | --- |
| Root Directory | `apps/rattle-reps` (enable "Include source files outside of the Root Directory", because the app uses the `marrow-core` workspace) |
| Install Command | `cd ../.. && npm ci` |
| Build Command | `cd ../.. && npm run build -w apps/rattle-reps` |
| Output Directory | `dist` (also set in `vercel.json`) |
| Node | 22 |

`vercel.json` keeps `outputDirectory: dist` and rewrites every path to `index.html`, so the single-page app loads on a refresh. Set `VITE_BASE` (for example `/rattle-reps/`) at build time to serve from a sub-path. Leave it unset for a domain root. All asset paths follow the base.

Camera access needs HTTPS, which Vercel provides.

## Bundle size

`npm run build -w apps/rattle-reps` (gzip sizes in brackets):

| Chunk | Size |
| --- | --- |
| `index` (picker, mode, summary, history, storage, streak) | 247 kB (75 kB) |
| `Session` (live screen, pipeline, demo clips) | 1,285 kB (48 kB) |
| `vision_bundle` (MediaPipe, loaded only in camera mode) | 155 kB (46 kB) |
| `cameraSource` | 2.8 kB (1.4 kB) |

The session chunk is large because the five demo clips are inlined JSON. It compresses to 48 kB, loads only when a workout starts, and Vite warns about it during the build. The history screen does not load it, and the pose model is not part of any chunk.

## Manual smoke test (not run in CI)

- Camera mode on a real device over HTTPS, and the "camera denied" fallback to the demo clip.
- Reduced-motion setting on and off (OS setting).
- A keyboard-only run: Tab to a workout, Enter, choose Demo clip, Space to pause, Esc to stop, then history.
