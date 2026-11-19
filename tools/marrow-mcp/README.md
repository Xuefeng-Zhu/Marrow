# marrow-mcp

A stdio MCP server that exposes Marrow's movement-spec tooling. It reuses `marrow-core` (`parseMovementSpec`, `parseFixture`, `replay`, `createEngine`), so results match the apps.

## Run

```
npm install && npm run build
node tools/marrow-mcp/dist/index.js
```

`npm run build` type-checks and bundles `src/index.ts` with esbuild into `dist/index.js`. The bundle is needed because `marrow-core` ships TypeScript source that plain `node` cannot import from `node_modules`. The server is registered as `marrow` in `.kiro/settings/mcp.json`.

## Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `validate_movement` | `path` (file) or `json` (object or string), exactly one | `{valid, errors:[{pointer, path, message}]}`. `pointer` is an RFC 6901 JSON pointer (`/phases/1/min`), `path` is `phases[1].min`. |
| `replay_fixture` | `movementPath`, `fixturePath` | `{ok, repCount, phases:[{t,from,to}], rom:[{metric,min,max,trigger,t}], warnings:[{t,ruleId,message,value}], holds:[{holdId,durationMs,reason,t}]}` or `{ok:false, errors}` |
| `list_movements` | `app` (optional: `rattle-reps` or `steady`) | `{ok, movements:[{app,file,id,name,joints,phaseCount}]}`. Invalid specs carry `errors`. An unknown app returns the valid apps. |

File paths resolve against the repo root and must stay inside it.
