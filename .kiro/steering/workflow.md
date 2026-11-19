---
inclusion: always
---
# How work flows in this repo (Kiro Crew)
1. A GitHub issue labeled `kiro` describes one phase (a spec or a slice of tasks). Kiro Web picks it up and opens a PR that says `Closes #N`.
2. Spec-first: requirements.md (EARS) → design.md (with numbered correctness properties) → tasks.md. Implementation PRs tick tasks in tasks.md.
3. Every PR gets an automated review. Findings are fixed in the same PR when someone comments `/kiro fix`.
4. CI (typecheck, test, build) must be green before merge. Keep PRs scoped to their phase; don't touch `packages/marrow-core` from an app phase unless a task requires it.
5. Record notable decisions and review catches in `docs/kiro-log.md`.
