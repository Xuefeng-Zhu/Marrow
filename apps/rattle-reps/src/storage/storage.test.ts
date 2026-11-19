import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { createStore, get, set } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendHistory,
  decodeHistory,
  decodeSettings,
  encodeHistory,
  encodeSettings,
  HISTORY_CAP,
  type HistoryEntry,
} from './codec';
import { createRattleStore } from './store';

const entry = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: `e${n}`,
  movementId: 'squat',
  kind: 'reps',
  reps: 10,
  cleanReps: 8,
  cleanPct: 80,
  holdMs: 0,
  tutMs: 9000,
  warnings: [{ ruleId: 'shallow-depth', message: 'Sink a little deeper', count: 2 }],
  mode: 'camera',
  startedAt: 1_700_000_000_000 + n,
  day: '2024-02-29',
  ...over,
});

const entryArb = fc.nat(1000).map((n) => entry(n));

describe('codec', () => {
  it('P32: appending keeps at most 500, the newest, in order', () => {
    fc.assert(
      fc.property(fc.nat(700), fc.integer({ min: 1, max: 40 }), (size, adds) => {
        let list = Array.from({ length: size }, (_, i) => entry(i));
        const all = [...list];
        for (let i = 0; i < adds; i++) {
          const e = entry(size + i);
          list = appendHistory(list, e);
          all.push(e);
        }
        expect(list.length).toBe(Math.min(HISTORY_CAP, all.length));
        expect(list).toEqual(all.slice(all.length - list.length));
      }),
    );
  });

  it('P33: decoding arbitrary JSON never throws and gives a list', () => {
    fc.assert(
      fc.property(fc.json().map((s) => JSON.parse(s) as unknown), (raw) => {
        expect(Array.isArray(decodeHistory(raw))).toBe(true);
        expect(decodeSettings(raw)).toEqual({ voice: false, sound: false, showVideo: false });
      }),
    );
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        expect(Array.isArray(decodeHistory(raw))).toBe(true);
        decodeSettings(raw);
        decodeHistory({ v: 1, data: raw });
      }),
    );
  });

  it('round trips valid history and drops invalid entries', () => {
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 20 }), (list) => {
        expect(decodeHistory(encodeHistory(list))).toEqual(list);
      }),
    );
    const mixed = { v: 1, data: [entry(1), { nope: true }, entry(2, { day: '2024-13-40' }), entry(3)] };
    expect(decodeHistory(mixed).map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('ignores an unknown version', () => {
    expect(decodeHistory({ v: 2, data: [entry(1)] })).toEqual([]);
    expect(decodeSettings({ v: 2, data: { voice: true, sound: true, showVideo: true } })).toEqual({
      voice: false,
      sound: false,
      showVideo: false,
    });
  });

  it('settings default to muted and round trip', () => {
    expect(decodeSettings(undefined)).toEqual({ voice: false, sound: false, showVideo: false });
    const s = { voice: true, sound: true, showVideo: false, lastMode: 'demo' as const };
    expect(decodeSettings(encodeSettings(s))).toEqual(s);
  });
});

describe('store', () => {
  beforeEach(async () => {
    await createRattleStore().clearAll();
  });

  it('round trips history and settings through IndexedDB', async () => {
    const store = createRattleStore();
    expect(await store.loadHistory()).toEqual([]);
    await store.addEntry(entry(1));
    await store.addEntry(entry(2));
    const fresh = createRattleStore();
    expect((await fresh.loadHistory()).map((e) => e.id)).toEqual(['e1', 'e2']);
    await fresh.saveSettings({ voice: true, sound: false, showVideo: true });
    expect(await createRattleStore().loadSettings()).toEqual({ voice: true, sound: false, showVideo: true });
    expect(fresh.persistent).toBe(true);
  });

  it('serializes quick saves so none is lost', async () => {
    const store = createRattleStore();
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.addEntry(entry(n))));
    expect((await store.loadHistory()).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('settings default to muted when nothing is stored', async () => {
    expect(await createRattleStore().loadSettings()).toEqual({ voice: false, sound: false, showVideo: false });
  });

  it('clearAll deletes history and settings', async () => {
    const store = createRattleStore();
    await store.addEntry(entry(1));
    await store.saveSettings({ voice: true, sound: true, showVideo: true });
    await store.clearAll();
    expect(await store.loadHistory()).toEqual([]);
    expect(await store.loadSettings()).toEqual({ voice: false, sound: false, showVideo: false });
  });

  it('falls back to memory when idb throws, and says so', async () => {
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const store = createRattleStore();
      await store.addEntry(entry(1));
      expect(store.persistent).toBe(false);
      expect((await store.loadHistory()).map((e) => e.id)).toEqual(['e1']);
      await store.saveSettings({ voice: true, sound: false, showVideo: false });
      expect((await store.loadSettings()).voice).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('clearAll removes unknown-version data from disk and makes the store persistent again', async () => {
    const db = createStore('rattle-reps', 'kv');
    await set('history', { v: 2, data: [] }, db);
    const store = createRattleStore();
    await store.loadHistory();
    expect(store.persistent).toBe(false);
    await store.clearAll();
    expect(await get('history', db)).toBeUndefined();
    expect(store.persistent).toBe(true);
    await store.addEntry(entry(1));
    expect((await get('history', db)) !== undefined).toBe(true);
  });

  it('ignores an unknown version without overwriting it', async () => {
    const db = createStore('rattle-reps', 'kv');
    const future = { v: 2, data: [{ shape: 'new' }] };
    await set('history', future, db);
    const store = createRattleStore();
    expect(await store.loadHistory()).toEqual([]);
    expect(store.persistent).toBe(false);
    await store.addEntry(entry(1));
    expect((await store.loadHistory()).map((e) => e.id)).toEqual(['e1']);
    expect(await get('history', db)).toEqual(future);
  });
});
