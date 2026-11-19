---
inclusion: always
---
# Tech stack
- npm workspaces monorepo. TypeScript strict everywhere.
- `packages/marrow-core`: plain TypeScript library, no UI framework. Pose source adapters (MediaPipe `@mediapipe/tasks-vision` Pose Landmarker for live webcam; a fixture player for recorded landmark JSON), geometry (joint angles, distances, normalisation), One-Euro smoothing, and the movement-rules engine (a deterministic finite state machine driven by a JSON movement spec, validated with zod).
- Apps: Vite + React 18 + TypeScript. Each app is independently buildable and deployable as a static site (Vercel). Base path configurable via `VITE_BASE`.
- Rendering: canvas overlay for the skeleton; CSS modules + custom properties for theme tokens.
- Storage: local only (IndexedDB via idb-keyval).
- Testing: Vitest. Use **property-based tests with fast-check** for the core: angle math invariants, smoothing stability, and rule-engine properties (rep count never decreases, a rep requires passing through every phase in order, noise below hysteresis never creates a rep, replaying a fixture is deterministic).
- Fixtures: recorded landmark sequences as JSON under `packages/marrow-core/fixtures/`; they drive both tests and the apps' demo clip mode.
- Root scripts: `npm run typecheck`, `npm test`, `npm run build` must work across all workspaces and pass in CI.
- License: MIT. The /.kiro folder must be committed and never gitignored. No secrets in the repo.
