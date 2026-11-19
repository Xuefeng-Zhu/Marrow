import { isDayKey } from '../streak/dayKey';
import type { SetSummary, WarningTally } from '../summary/summarize';

export const SCHEMA_VERSION = 1;
export const HISTORY_CAP = 500;

export interface HistoryEntry extends SetSummary {
  id: string;
  circuitId?: string;
  mode: 'camera' | 'demo';
  /** Epoch ms. */
  startedAt: number;
  /** Local day key, YYYY-MM-DD. */
  day: string;
}

export interface Settings {
  voice: boolean;
  sound: boolean;
  showVideo: boolean;
  lastMode?: 'camera' | 'demo';
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { voice: false, sound: false, showVideo: false };

export interface VersionedRecord<T> {
  v: number;
  data: T;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

function isNonNegFinite(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

function decodeTally(x: unknown): WarningTally | null {
  if (!isRecord(x)) return null;
  if (typeof x.ruleId !== 'string' || typeof x.message !== 'string' || !isNonNegInt(x.count)) return null;
  return { ruleId: x.ruleId, message: x.message, count: x.count };
}

/** Validate one history entry by hand. Returns null when anything is wrong. */
export function decodeEntry(x: unknown): HistoryEntry | null {
  if (!isRecord(x)) return null;
  if (typeof x.id !== 'string' || x.id === '' || typeof x.movementId !== 'string') return null;
  if (x.kind !== 'reps' && x.kind !== 'hold') return null;
  if (x.mode !== 'camera' && x.mode !== 'demo') return null;
  if (!isNonNegInt(x.reps) || !isNonNegInt(x.cleanReps) || x.cleanReps > x.reps) return null;
  if (!isNonNegInt(x.cleanPct) || x.cleanPct > 100) return null;
  if (!isNonNegFinite(x.holdMs) || !isNonNegFinite(x.tutMs)) return null;
  if (typeof x.startedAt !== 'number' || !Number.isFinite(x.startedAt)) return null;
  if (!isDayKey(x.day)) return null;
  if (x.circuitId !== undefined && typeof x.circuitId !== 'string') return null;
  if (!Array.isArray(x.warnings)) return null;
  const warnings: WarningTally[] = [];
  for (const w of x.warnings) {
    const t = decodeTally(w);
    if (!t) return null;
    warnings.push(t);
  }
  const entry: HistoryEntry = {
    id: x.id,
    movementId: x.movementId,
    kind: x.kind,
    mode: x.mode,
    reps: x.reps,
    cleanReps: x.cleanReps,
    cleanPct: x.cleanPct,
    holdMs: x.holdMs,
    tutMs: x.tutMs,
    warnings,
    startedAt: x.startedAt,
    day: x.day,
  };
  if (x.circuitId !== undefined) entry.circuitId = x.circuitId;
  return entry;
}

/** True when the value is a record of the current version, so its data can be read. */
export function hasKnownVersion(raw: unknown): raw is VersionedRecord<unknown> {
  return isRecord(raw) && raw.v === SCHEMA_VERSION && 'data' in raw;
}

/** Never throws. Unknown versions and invalid shapes give an empty list, invalid entries are dropped. */
export function decodeHistory(raw: unknown): HistoryEntry[] {
  try {
    if (!hasKnownVersion(raw) || !Array.isArray(raw.data)) return [];
    const out: HistoryEntry[] = [];
    for (const item of raw.data) {
      const e = decodeEntry(item);
      if (e) out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

/** Never throws. Anything invalid gives the defaults, so sound stays muted. */
export function decodeSettings(raw: unknown): Settings {
  try {
    if (!hasKnownVersion(raw) || !isRecord(raw.data)) return { ...DEFAULT_SETTINGS };
    const d = raw.data;
    if (typeof d.voice !== 'boolean' || typeof d.sound !== 'boolean' || typeof d.showVideo !== 'boolean') {
      return { ...DEFAULT_SETTINGS };
    }
    const s: Settings = { voice: d.voice, sound: d.sound, showVideo: d.showVideo };
    if (d.lastMode === 'camera' || d.lastMode === 'demo') s.lastMode = d.lastMode;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function encodeHistory(entries: readonly HistoryEntry[]): VersionedRecord<HistoryEntry[]> {
  return { v: SCHEMA_VERSION, data: [...entries] };
}

export function encodeSettings(settings: Settings): VersionedRecord<Settings> {
  return { v: SCHEMA_VERSION, data: { ...settings } };
}

/** Append an entry (oldest first) and keep the newest HISTORY_CAP entries. */
export function appendHistory(list: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...list, entry];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}
