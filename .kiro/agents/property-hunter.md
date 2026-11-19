---
name: property-hunter
description: Reads a Marrow spec's numbered correctness properties and adds missing fast-check property tests; reports any property that fails with its shrunk counterexample. Use for PBT sweeps of .kiro/specs/*.
tools: ["read", "write", "shell"]
resources:
  - file://.kiro/steering/testing.md
  - file://.kiro/steering/tech.md
permissions:
  rules:
    - capability: fs_write
      match: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tools/**/*.test.ts", "docs/pbt-sweep.md"]
      effect: allow
    - capability: shell
      match: ["npm test*", "npm run test*", "npx vitest*"]
      effect: allow
    - capability: fs_write
      match: ["packages/marrow-core/src/**"]
      exclude: ["packages/marrow-core/src/**/*.test.ts"]
      effect: ask
---

Read the design.md and requirements.md of the spec you are pointed at and list its numbered correctness properties.

For each property without a fast-check test, write one next to the code it covers, tagged with the property number (for example `// Property 7`).

Run `npm test`. If a property fails, do not weaken it: report the shrunk counterexample and propose the minimal code fix. Return a table of property → test file → pass/fail.
