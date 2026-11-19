---
inclusion: always
---
# Product: Marrow

A Kiroween 2026 **Skeleton Crew** entry. The brief: a skeleton code template lean enough to be clear but flexible enough for many uses, proven by two distinct apps in two folders.

Marrow is a *literal* skeleton: an in-browser human pose "skeleton" engine. Developers describe a movement as **data** (a JSON movement spec: joints, angle thresholds, phases, holds, reps, form rules) and Marrow turns live or recorded pose landmarks into typed events (`rep`, `phase`, `hold:start|tick|end`, `form:warning`, `rom:sample`). Apps only render UI and react to events.

## Principles
- **Private by design**: all inference runs on-device in the browser (MediaPipe Tasks Vision Pose Landmarker, WASM/WebGL). No video or landmarks are uploaded. Say so in the UI.
- **Rules are data**: adding an exercise means adding a JSON spec, not code. The core has zero app-specific logic.
- **Lean core**: `packages/marrow-core` stays small, documented and framework-agnostic (plain TypeScript, no React).
- **Judges can always try it**: every app has a *demo clip* mode that replays recorded landmark sequences (JSON fixtures in the repo) through the exact same pipeline, so it works with no camera.
- **Kiroween costume**: a friendly bone/skeleton theme (an animated skeleton overlay mirrors the user, bone-rattle sounds on reps). Spooky-cute, never gory. Respect prefers-reduced-motion.

## App 1: Rattle Reps (apps/rattle-reps)
Webcam home-workout coach for people without a trainer. Pick a workout (squats, push-ups, lunges, jumping jacks, plank hold); the skeleton overlay counts reps, flags form (e.g. knees caving, hips sagging), and shows a set summary. Sets and streaks saved locally.

## App 2: Steady (apps/steady)
Range-of-motion and balance checks for older adults and people in physio rehab. Guided, large-type, high-contrast, voice-prompted tests: shoulder flexion, knee flexion, sit-to-stand (30-second chair stand, a recognised fall-risk screen), single-leg stance timer. Results tracked over days with a printable/PDF progress report to show a physical therapist. Clearly says it is not a medical device.

The two apps must feel clearly different (energetic game vs. calm clinical tool) while sharing the same core.

## Out of scope
Accounts, servers, uploading video, medical diagnosis, real trademarks or brand names.
