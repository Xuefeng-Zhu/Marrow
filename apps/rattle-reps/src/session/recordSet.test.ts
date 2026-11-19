import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRattleStore } from '../storage/store';
import type { SetSummary } from '../summary/summarize';
import { recordSet } from './recordSet';

const summary = (over: Partial<SetSummary> = {}): SetSummary => ({
  movementId: 'squat',
  kind: 'reps',
  reps: 8,
  cleanReps: 8,
  cleanPct: 100,
  holdMs: 0,
  tutMs: 9000,
  warnings: [],
  ...over,
});

// Wednesday 2025-01-15 at noon UTC.
const NOW = Date.UTC(2025, 0, 15, 12);

describe('recordSet', () => {
  beforeEach(() => createRattleStore().clearAll());

  it('does not save a set without reps or hold time', async () => {
    const store = createRattleStore();
    const r = await recordSet(store, { summary: summary({ reps: 0, cleanReps: 0, cleanPct: 0 }), mode: 'camera', startedAt: NOW, offsetMinutes: 0 }, 'a', NOW);
    expect(r).toEqual({ saved: false, streakGain: false, streakWeeks: 0 });
    expect(await store.loadHistory()).toEqual([]);
  });

  it('saves a camera set, reports the streak gain once and tags the circuit', async () => {
    const store = createRattleStore();
    const input = { summary: summary(), mode: 'camera' as const, circuitId: 'spooky-starter', startedAt: NOW, offsetMinutes: 0 };
    const first = await recordSet(store, input, 'a', NOW);
    expect(first).toEqual({ saved: true, streakGain: true, streakWeeks: 1 });
    const second = await recordSet(store, input, 'b', NOW);
    expect(second.streakGain).toBe(false);
    const list = await store.loadHistory();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ circuitId: 'spooky-starter', mode: 'camera', day: '2025-01-15' });
  });

  it('saves a demo set as demo and never extends the streak', async () => {
    const store = createRattleStore();
    const r = await recordSet(store, { summary: summary(), mode: 'demo', startedAt: NOW, offsetMinutes: 0 }, 'd', NOW);
    expect(r).toEqual({ saved: true, streakGain: false, streakWeeks: 0 });
    expect((await store.loadHistory())[0]).toMatchObject({ mode: 'demo' });
  });
});
