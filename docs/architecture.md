# Architecture

Marrow turns pose landmarks into typed events. Everything runs in the browser.

```
PoseSource -> LandmarkSmoother -> Engine(spec) -> events
```

- **PoseSource**: `createMediaPipeSource` (webcam, MediaPipe Pose Landmarker) or `createFixturePlayer` (a recorded JSON clip). Both deliver `Frame`s.
- **LandmarkSmoother**: One-Euro filtering per landmark coordinate.
- **Engine**: a deterministic state machine driven by a JSON [movement spec](movement-spec.md). It emits `rep`, `phase`, `hold:*`, `form:warning` and `rom:sample`.
- **createPipeline** wires the three together. `drawSkeleton` draws a frame on a canvas.

`packages/marrow-core` is plain TypeScript with no UI framework. The apps in `apps/` are Vite and React sites that import it only through the `marrow-core` entry. No video or landmarks are uploaded.

For the full design, requirements and task list, see [`.kiro/specs/marrow-core/`](../.kiro/specs/marrow-core/design.md).

The Rattle Reps app (screens, session flow, storage, streak, deployment) is specified in [`.kiro/specs/rattle-reps/`](../.kiro/specs/rattle-reps/design.md) and described in [`apps/rattle-reps/README.md`](../apps/rattle-reps/README.md).
