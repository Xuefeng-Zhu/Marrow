---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "**/logic/**", "packages/marrow-core/src/**"]
---
# Testing conventions
- Vitest everywhere. Pure logic gets **property-based tests with fast-check** first, examples second.
- Name each property after the requirement it guards, e.g. `// Property 7 (R3.2): rep count is monotone`.
- Properties we always want for counting/timing logic: monotone counts, determinism of fixture replay, noise below hysteresis never changes state, pause/resume never adds time, results are invariant to frame rate within tolerance.
- UI tests use Testing Library with keyboard-only paths; no snapshot tests of canvas output.
- A bug found in review gets a regression test (property if it generalises) in the same PR.
