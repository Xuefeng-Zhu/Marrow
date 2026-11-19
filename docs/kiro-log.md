# Kiro build log

How Marrow was built with Kiro, one phase at a time. Source material for `KIRO.md`.

| Phase | Issue → PR | Kiro surface | Review rounds | Notable catch |
|---|---|---|---|---|
| marrow-core spec | #1 → #2, fixes #3 → #4 | Kiro Web (issue) | 1 + fix PR | 4 design gaps fixed before any code |
| core tasks 1–9 | #5 → #6 | Kiro Web | 1 | 163 tests incl. fast-check engine properties |
| core tasks 10–14 | #7 → #8 | Kiro Web | 2 | webcam source, overlay, hello-skeleton apps |
| Steady spec | #10 → #11 | Kiro Web | 1 | sway-before-hold, deadlines when frames stop, projection plane |
| Rattle Reps spec | #9 → #12 | Kiro Web | 3 | paused playhead, latched warnings, hold clipping |
| Steady tasks 1–10 | #14 → #15 | Kiro Web | 1 + `/kiro fix` | spec findings folded into tests |
| Rattle Reps tasks 1–9 | #13 → #16 | Kiro Web | 1 (clean) | 209 tests total |
| Tooling: MCP server, power, PBT sweep | #23 → PR | Kiro MCP, power, custom agent | n/a | property-hunter sweep of all three specs found no counterexamples, a11y-reviewer found nothing to fix; 7 review findings now have property tests (see `docs/pbt-sweep.md`) |
| chore/agents-v3 | Hark | — | Root cause of "custom agents can't be launched" in PR #24: all three `.kiro/agents/*.json` used CLI 2.x fields (`allowedTools`, `toolsSettings`, `fs_read`) with no `permissions` block, which IDE 1.0 / CLI V3 / Web skip. Rewritten as V3 Markdown agents with `permissions.rules`. Retest via a Kiro Web issue. |
