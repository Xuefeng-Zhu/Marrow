# marrow-movements power

A Kiro power for authoring, validating and replaying [Marrow](https://github.com/Xuefeng-Zhu/Marrow) movement specs.

## Install

In Kiro, open the Powers panel, choose **Add Custom Power**, then **Import power from GitHub**. Use the repository URL `https://github.com/Xuefeng-Zhu/Marrow` and the subdirectory `powers/marrow-movements`.

## Included

- `plugin.json`: manifest and activation keywords (movement, rep counter, pose, exercise, range of motion).
- `skills/author-movement/SKILL.md`: the workflow for writing a spec, generating a fixture, validating, replaying and testing.
- `mcp.json`: the `marrow` MCP server with `validate_movement`, `replay_fixture` and `list_movements`.

## Prerequisites

Use a checkout of the Marrow repo with Node 22. Run `npm install` and `npm run build` at the repo root so `tools/marrow-mcp/dist/index.js` exists. The server command is relative to the repo root, so start Kiro in that checkout.
