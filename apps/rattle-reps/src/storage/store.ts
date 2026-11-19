import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import {
  appendHistory,
  decodeHistory,
  decodeSettings,
  DEFAULT_SETTINGS,
  encodeHistory,
  encodeSettings,
  hasKnownVersion,
  type HistoryEntry,
  type Settings,
} from './codec';

const HISTORY_KEY = 'history';
const SETTINGS_KEY = 'settings';

export interface Store {
  /** False once the store fell back to memory, or when stored data has an unknown version. */
  readonly persistent: boolean;
  loadHistory(): Promise<HistoryEntry[]>;
  addEntry(entry: HistoryEntry): Promise<HistoryEntry[]>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  clearAll(): Promise<void>;
}

/** Create a store. Writes are serialized. The first idb failure switches to in-memory for good. */
export function createRattleStore(): Store {
  let idb: UseStore | null = null;
  const memory = new Map<string, unknown>();
  let persistent = true;
  /** History in memory only, because the stored history has a version this app does not know. */
  let historyLocked = false;
  let chain: Promise<unknown> = Promise.resolve();

  function backend(): UseStore | null {
    if (!persistent) return null;
    try {
      idb ??= createStore('rattle-reps', 'kv');
      return idb;
    } catch {
      persistent = false;
      return null;
    }
  }

  async function read(key: string): Promise<unknown> {
    const db = backend();
    if (db) {
      try {
        return await get(key, db);
      } catch {
        persistent = false;
      }
    }
    return memory.get(key);
  }

  async function write(key: string, value: unknown): Promise<void> {
    const db = backend();
    if (db) {
      try {
        await set(key, value, db);
        return;
      } catch {
        persistent = false;
      }
    }
    memory.set(key, value);
  }

  async function remove(key: string): Promise<void> {
    memory.delete(key);
    const db = backend();
    if (db) {
      try {
        await del(key, db);
      } catch {
        persistent = false;
      }
    }
  }

  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  async function readHistory(): Promise<HistoryEntry[]> {
    if (historyLocked) return decodeHistory(memory.get(HISTORY_KEY));
    const raw = await read(HISTORY_KEY);
    if (raw !== undefined && raw !== null && !hasKnownVersion(raw)) {
      // Keep the unknown data on disk untouched, and use memory for this session.
      historyLocked = true;
      persistent = false;
      return [];
    }
    return decodeHistory(raw);
  }

  return {
    get persistent() {
      return persistent;
    },
    loadHistory: () => serialized(readHistory),
    addEntry: (entry) =>
      serialized(async () => {
        const next = appendHistory(await readHistory(), entry);
        if (historyLocked) memory.set(HISTORY_KEY, encodeHistory(next));
        else await write(HISTORY_KEY, encodeHistory(next));
        return next;
      }),
    loadSettings: () =>
      serialized(async () => {
        const raw = await read(SETTINGS_KEY);
        return raw === undefined ? { ...DEFAULT_SETTINGS } : decodeSettings(raw);
      }),
    saveSettings: (settings) =>
      serialized(async () => {
        const raw = await read(SETTINGS_KEY);
        // Do not overwrite settings written by a newer version.
        if (raw !== undefined && raw !== null && !hasKnownVersion(raw)) return;
        await write(SETTINGS_KEY, encodeSettings(settings));
      }),
    clearAll: () =>
      serialized(async () => {
        historyLocked = false;
        await remove(HISTORY_KEY);
        await remove(SETTINGS_KEY);
      }),
  };
}
