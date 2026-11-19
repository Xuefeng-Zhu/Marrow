# Marrow 🦴

**A literal skeleton for the browser.** Marrow is a lean pose-tracking skeleton: write a movement as data (joint angles, holds, reps) and it runs on-device in any web page. No video ever leaves the device.

Kiroween 2026 · Skeleton Crew entry · built with [Kiro](https://kiro.dev).

## The skeleton and two apps

| Folder | What it is |
| --- | --- |
| `packages/marrow-core` | The skeleton: pose source (webcam or recorded clip), joint-angle math, smoothing, and a JSON movement-rules engine that emits rep / hold / form events. |
| `apps/rattle-reps` | **Rattle Reps**: a webcam home-workout coach that counts reps and calls out form. |
| `apps/steady` | **Steady**: physio range-of-motion and balance checks for older adults, with a printable progress report. |

Both apps also ship a **demo clip mode**, so you can try them with no webcam.

## Kiro

`/.kiro` holds the steering, specs, hooks and MCP config used to build this repo. See `KIRO.md` (coming) for the write-up.

## License

MIT
