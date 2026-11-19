---
inclusion: always
---
# Repo structure
```
/.kiro/                steering, specs, hooks, settings (committed)
/packages/marrow-core/ the skeleton (src/, fixtures/, tests colocated as *.test.ts)
/apps/rattle-reps/     App 1, Vite + React
/apps/steady/          App 2, Vite + React
/docs/                 movement-spec reference, architecture notes
LICENSE  README.md  KIRO.md
```
- Apps import the core only through its public entry (`marrow-core`), never deep paths.
- Movement specs live with the app that uses them (`apps/*/src/movements/*.json`); the core ships 1–2 example specs only.
- Keep each spec's tasks small and incremental; every task leaves typecheck, tests and build green.
