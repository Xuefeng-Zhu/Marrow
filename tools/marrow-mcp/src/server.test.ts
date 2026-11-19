import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createServer } from './server';

it('lists the three tools and calls one over a transport', async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(b);
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(['list_movements', 'replay_fixture', 'validate_movement']);
  const res = await client.callTool({ name: 'validate_movement', arguments: { path: 'packages/marrow-core/specs/elbow-cycle.json' } });
  expect(JSON.parse((res.content as { text: string }[])[0]!.text).valid).toBe(true);
  await client.close();
});
