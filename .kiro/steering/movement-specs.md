---
inclusion: fileMatch
fileMatchPattern: ["**/movements/*.json", "packages/marrow-core/src/spec/**"]
---
# Writing movement specs
A movement is data, not code. When editing a movement JSON:
- Validate against the zod schema in `packages/marrow-core` (see `docs/movement-spec.md`); never add app-specific fields to the core schema.
- Every metric names its landmarks and, for angles, an explicit projection plane (`xy` unless depth is proven reliable).
- Phases need hysteresis on both edges and a `minRepMs`/`minHoldMs` so jitter can't count.
- Ship a committed fixture or demo clip for every movement and a test that replays it to the expected count.
- Left/right variants are separate specs (`*-left.json`, `*-right.json`) so asymmetry stays explicit.
- After every edit to a movement JSON, run the `validate_movement` tool of the `marrow` MCP server (`tools/marrow-mcp`) and fix every reported pointer before moving on.
- Run `replay_fixture` with the spec and its committed fixture or clip and confirm the rep count (or hold) matches what the replay test expects. Use `list_movements` to see what already exists.
