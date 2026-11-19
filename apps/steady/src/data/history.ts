import { clear, createStore, del, entries, set, type UseStore } from 'idb-keyval';
import type { ResultKind, Side, TestId } from '../tests';

export interface HistoryRecord {
  id: string;
  testId: TestId;
  kind: ResultKind;
  side?: Side;
  value: number;
  unit: string;
  /** ISO 8601 timestamp. */
  takenAt: string;
  source: 'camera' | 'demo';
  stoppedEarly: boolean;
}

/** Thrown when IndexedDB is missing or fails. The UI maps it to the "cannot save on this device" message (R10.8). */
export class StorageUnavailableError extends Error {
  constructor(message = 'Results cannot be saved on this device.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

const TEST_IDS: readonly string[] = [
  'shoulder-flexion-left',
  'shoulder-flexion-right',
  'knee-flexion-left',
  'knee-flexion-right',
  'chair-stand',
  'single-leg-stance-left',
  'single-leg-stance-right',
];
const KINDS: readonly string[] = ['rom-peak', 'count', 'seconds'];
const KEY_PREFIX = 'rec:';

/** Validates a value read from storage (R10.2). */
export function isHistoryRecord(v: unknown): v is HistoryRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.testId === 'string' &&
    TEST_IDS.includes(r.testId) &&
    typeof r.kind === 'string' &&
    KINDS.includes(r.kind) &&
    (r.side === undefined || r.side === 'left' || r.side === 'right') &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    typeof r.unit === 'string' &&
    typeof r.takenAt === 'string' &&
    Number.isFinite(Date.parse(r.takenAt)) &&
    (r.source === 'camera' || r.source === 'demo') &&
    typeof r.stoppedEarly === 'boolean'
  );
}

let store: UseStore | null = null;

/** Opens the store on first use, so importing this module never touches IndexedDB. */
function getStore(): UseStore {
  store ??= createStore('steady', 'history');
  return store;
}

async function guard<T>(op: (s: UseStore) => Promise<T>): Promise<T> {
  try {
    return await op(getStore());
  } catch (cause) {
    store = null; // allow a retry to reopen the database
    throw new StorageUnavailableError(undefined, { cause });
  }
}

export function saveRecord(r: HistoryRecord): Promise<void> {
  return guard((s) => set(KEY_PREFIX + r.id, r, s));
}

/** All valid records. Entries that fail validation are skipped. */
export function listRecords(): Promise<HistoryRecord[]> {
  return guard(async (s) => {
    const all = await entries(s);
    const out: HistoryRecord[] = [];
    for (const [key, value] of all) {
      if (typeof key === 'string' && key.startsWith(KEY_PREFIX) && isHistoryRecord(value)) out.push(value);
    }
    return out;
  });
}

export function deleteRecord(id: string): Promise<void> {
  return guard((s) => del(KEY_PREFIX + id, s));
}

export function clearAll(): Promise<void> {
  return guard((s) => clear(s));
}
