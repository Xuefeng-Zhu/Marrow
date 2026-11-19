---
name: author-movement
description: Write, validate and replay a Marrow movement spec (rep counting, holds, form rules, range of motion), generate a fixture, and add a replay test.
---

# Author a Marrow movement

Work from the repo root of a Marrow checkout. Run `npm install && npm run build` once so the `marrow` MCP server (`tools/marrow-mcp/dist/index.js`) exists.

Never edit `packages/marrow-core/src`. A movement is data (JSON), not code.

## Step 1: Write the spec

Read `docs/movement-spec.md` and the reference spec `packages/marrow-core/specs/elbow-cycle.json`. A spec has:

- **metrics**: named values computed from landmarks (angles, distances), each in a **plane** (e.g. sagittal or frontal) that you choose to match the camera view.
- **phases**: ordered states with `min`/`max` bounds on a metric. Add **hysteresis** so noise at a boundary does not flip phases.
- **minRepMs / minHoldMs**: minimum durations that reject jitter and half reps.
- **holds**: isometric positions (for example a plank) that emit `hold:start`, `hold:tick` and `hold:end`.
- **formRules**: conditions that emit `form:warning` events.
- **rom**: range of motion tracking that emits `rom:sample`.

Left and right variants are separate specs. Do not try to mirror one spec at runtime.

Put app specs in `apps/<app>/src/movements/<name>.json`, or core examples in `packages/marrow-core/specs/`.

## Step 2: Validate

Call the `validate_movement` tool with the spec path. Fix every issue it returns; each has a JSON pointer such as `/phases/1/min`. Repeat until it reports valid.

Use `list_movements` to see what already exists and avoid duplicating a movement.

## Step 3: Generate a fixture

A fixture is a recorded or synthetic landmark sequence.

- Core: `npm run make-fixture -w marrow-core` (writes `packages/marrow-core/fixtures/*.json`).
- rattle-reps: add the movement to `apps/rattle-reps/scripts/make-fixtures.ts`, then run that script.
- steady: `npm run make-clips -w steady` (writes `apps/steady/src/clips/*.json`).

Committed fixtures must equal the script output, so regenerate rather than hand edit.

## Step 4: Replay

Call `replay_fixture` with the spec and fixture paths. Check that the event summary matches what the movement should do: the expected rep count, hold durations, form warnings and ROM samples.

## Step 5: Add a replay test

Follow `apps/rattle-reps/src/fixtures/fixtures.test.ts` or `apps/steady/src/clips/clips.test.ts`. Assert the event counts from the replay. Run `npm test` and `npm run typecheck` before finishing.
