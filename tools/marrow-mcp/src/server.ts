import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findRepoRoot } from './repo';
import { listMovements } from './tools/listMovements';
import { replayFixture } from './tools/replayFixture';
import { validateMovement } from './tools/validateMovement';

const reply = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export function createServer(root: string = findRepoRoot()): McpServer {
  const server = new McpServer({ name: 'marrow', version: '0.1.0' });

  server.tool(
    'validate_movement',
    'Validate a Marrow movement spec with parseMovementSpec. Pass exactly one of path (repo-relative or absolute file) or json (object or string). Returns {valid, errors:[{pointer, path, message}]}.',
    { path: z.string().optional(), json: z.union([z.string(), z.record(z.unknown())]).optional() },
    (args) => {
      const r = validateMovement(args, root);
      return reply(r, !r.valid);
    },
  );

  server.tool(
    'replay_fixture',
    'Replay a fixture or clip through the engine for a movement spec. Returns repCount, phase transitions, ROM samples, form warnings and hold ends.',
    { movementPath: z.string(), fixturePath: z.string() },
    (args) => {
      const r = replayFixture(args, root);
      return reply(r, !r.ok);
    },
  );

  server.tool(
    'list_movements',
    'List movement specs in apps/*/src/movements with id, name, joints and phase count. Optional app filter (rattle-reps or steady).',
    { app: z.string().optional() },
    (args) => {
      const r = listMovements(args, root);
      return reply(r, !r.ok);
    },
  );

  return server;
}
