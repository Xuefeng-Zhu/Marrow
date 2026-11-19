# Steady

Simple range-of-motion and balance checks for older adults, guided step by step, with a printable progress report. Built on [`marrow-core`](../../packages/marrow-core/README.md).

Tests: shoulder flexion and knee flexion (left and right), the 30-second chair stand, and single-leg stance (left and right).

**Steady is not a medical device. It does not diagnose or treat any condition.** Results are for you to share with your physical therapist or doctor.

## Run it

Requires Node 22. From the repo root:

```bash
npm ci
npm run dev -w apps/steady        # development server
npm test -w apps/steady           # unit, property and accessibility tests
npm run build -w apps/steady      # output in apps/steady/dist
```

## Demo mode

The home screen starts in **Try a demo clip**. Each test has a recorded, synthetic pose clip, so the whole flow (setup, countdown, run, result, history, report) works with no camera and no model download. Demo results are always labelled "Demo" and can be hidden from history and the report. Choose **Use camera** to run a test live. The browser asks for camera permission only then.

Regenerate the clips with `npm run make-clips -w apps/steady`. A test checks that the committed clips match the generator.

## Add a test

1. Add a movement spec JSON in `src/movements/` (see [the movement spec reference](../../docs/movement-spec.md)). `src/movements/specs.test.ts` checks every spec.
2. Add a demo clip for it in `scripts/make-clips.ts`, run `npm run make-clips -w apps/steady`, and add the expected outcome in `src/clips/outcomes.ts`.
3. Add an entry to the catalogue in `src/tests.ts` (id, title, kind, unit, spec, clip, setup steps, prompt script) and, if it is a new family, a group in `src/ui/Home.tsx`.
4. Add reference text for it in `src/reference.ts` if there is a published source.

## Privacy

Everything runs on your device. No video is uploaded and no landmarks leave your browser. Results are stored only in this browser (IndexedDB), and you can delete them from the History screen. There are no analytics, third-party scripts or web fonts. The only network requests are for the MediaPipe model and WASM files, and only when you choose the camera. The MediaPipe library is loaded lazily, so the demo path never fetches it.

## Accessibility

Body text is 1.125rem or larger, colour pairs meet WCAG AAA (checked by `src/contrast.test.ts`), controls are at least 48px, focus moves to each screen heading, and there is a skip link. `src/a11y.test.tsx` runs axe-core on every screen. Animations stop when the system asks for reduced motion.

On the result screen the heading takes focus so screen reader users hear where they are, and **Save result** is the first Tab stop.

## Deploy to Vercel

Set the project root to `apps/steady`, or build from the repo root and publish `apps/steady/dist`. `vercel.json` sets the output directory to `dist` and rewrites every path to `/index.html`. To serve from a sub-path, build with `VITE_BASE`, for example `VITE_BASE=/steady/ npm run build -w apps/steady`.

The main bundle is about 1.2 MB because the demo clips are bundled so that demo mode works offline. MediaPipe is a separate chunk that loads only when the camera starts.
