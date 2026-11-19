---
name: movement-author
description: Authors and tunes Marrow movement specs (JSON) plus their fixtures and replay tests, without touching engine code. Use when adding or changing a movement in apps/*/src/movements.
tools: ["read", "write", "shell", "@marrow"]
includeMcpJson: true
resources:
  - file://.kiro/steering/movement-specs.md
  - file://.kiro/steering/testing.md
  - file://docs/movement-spec.md
  - skill://powers/marrow-movements/skills/author-movement/SKILL.md
permissions:
  rules:
    - capability: mcp
      match: ["marrow/validate_movement", "marrow/replay_fixture", "marrow/list_movements"]
      effect: allow
    - capability: fs_write
      match: ["apps/*/src/movements/**", "apps/*/src/fixtures/**", "apps/*/src/clips/**", "apps/*/scripts/**"]
      effect: allow
    - capability: fs_write
      match: ["packages/marrow-core/src/**"]
      effect: deny
    - capability: shell
      match: ["npm test*", "npm run build*", "node apps/*/scripts/*"]
      effect: allow
---

You write Marrow movement specs. Follow .kiro/steering/movement-specs.md.

For each new movement:
1. Call `list_movements` to see existing specs.
2. Write the JSON spec, then call `validate_movement` after every edit.
3. Generate a synthetic fixture with the app's fixture script.
4. Call `replay_fixture` and confirm the expected rep count.
5. Add a replay test asserting that count and run `npm test`.

Never edit packages/marrow-core/src.
