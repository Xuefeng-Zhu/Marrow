---
inclusion: always
---
# How work flows in this repo (Kiro Crew)
1. A GitHub issue labeled `kiro` describes one phase (a spec or a slice of tasks). Kiro Web picks it up and opens a PR that says `Closes #N`.
2. Spec-first: requirements.md (EARS) → design.md (with numbered correctness properties) → tasks.md. Implementation PRs tick tasks in tasks.md.
3. Every PR gets an automated review. Findings are fixed in the same PR when someone comments `/kiro fix`.
4. CI (typecheck, test, build) must be green before merge. Keep PRs scoped to their phase; don't touch `packages/marrow-core` from an app phase unless a task requires it.
5. Record notable decisions and review catches in `docs/kiro-log.md`.
6. Use the project's custom agents (`.kiro/agents/`) as sub-agents: `property-hunter` after any change to logic covered by a design.md property, `a11y-reviewer` before opening any PR that touches `apps/*/src/ui` or screens, and `movement-author` for new or retuned movement specs. Name which ones you ran in the PR body.
7. For a full phase, prefer the `marrow-phase` workflow recipe (`.kiro/workflows/marrow-phase.workflow.json`): implement, then property-hunter, a11y-reviewer and a behavioral reviewer in parallel, fix until approved (max 2 rounds), then open the PR.
