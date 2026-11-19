# Marrow 🦴

**A literal skeleton for the browser.** Marrow is a lean pose-tracking skeleton: write a movement as data (joint angles, holds, reps) and it runs on-device in any web page. No video ever leaves the device.

Kiroween 2026 · Skeleton Crew entry · built with [Kiro](https://kiro.dev).

## The skeleton and two apps

| Folder | What it is |
| --- | --- |
| `packages/marrow-core` | The skeleton: pose source (webcam or recorded clip), joint-angle math, smoothing, and a JSON movement-rules engine that emits rep / hold / form events. |
| `apps/rattle-reps` | **Rattle Reps**: a webcam home-workout coach that counts reps and calls out form. |
| `apps/steady` | **Steady**: physio range-of-motion and balance checks for older adults, with a printable progress report. |

Rattle Reps is a playful rattling-skeleton coach: pick a workout or a preset circuit, and the skeleton overlay counts reps, flags form, rattles on every rep (synthesized sounds, off until you unmute) and saves sets and a weekly streak on your device. See [`apps/rattle-reps/README.md`](apps/rattle-reps/README.md).

Both apps also ship a **demo clip mode**, so you can try them with no webcam.

## Quick start

Requires Node 22.

```bash
npm ci                            # install all workspaces
npm run dev -w apps/rattle-reps   # or: npm run dev -w apps/steady
npm run typecheck && npm test && npm run build
```

Each app opens in demo clip mode, so no camera is needed. Choose **Camera** to use your webcam. The browser asks for permission only then.

Build an app for a sub-path with `VITE_BASE`, for example `VITE_BASE=/rattle-reps/ npm run build -w apps/rattle-reps`. The output is `apps/<app>/dist`. Each app has a `vercel.json` (SPA rewrite, output `dist`).

More: [movement spec reference](docs/movement-spec.md), [architecture](docs/architecture.md), [core API](packages/marrow-core/README.md).

## Kiro

`/.kiro` holds the steering, specs, hooks and MCP config used to build this repo. See `KIRO.md` (coming) for the write-up.

## License

MIT
