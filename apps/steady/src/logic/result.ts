import { NON_DIAGNOSIS_LINE, REFERENCES, type ReferenceEntry } from '../reference';
import type { AgeBand } from '../data/prefs';
import type { ResultKind, Side, TestDef } from '../tests';
import { isValidAngle, kneeFlexion } from './rom';
import type { StanceStop } from './stance';

export type ResultSource = 'camera' | 'demo';
export type RomStop = 'reps' | 'done' | 'timeout' | 'user';
export type StopReason = StanceStop | RomStop | 'window';

export interface RunOutcome {
  test: TestDef;
  /**
   * ROM: the raw peak from the spec metric (the joint angle for knee flexion, which
   * `buildResult` converts). Count and seconds: the final value. `null` means no value.
   */
  raw: number | null;
  stop?: StopReason;
  stoppedEarly?: boolean;
  source: ResultSource;
  takenAt: string;
  ageBand?: AgeBand | null;
  /** Injectable for tests. Defaults to the app data. */
  references?: readonly ReferenceEntry[];
}

export interface ReferenceLine {
  text: string;
  source: string;
  url?: string;
  note: string;
}

export interface ResultViewModel {
  testId: TestDef['id'];
  title: string;
  side?: Side;
  kind: ResultKind;
  /** Number to store, or null when there is no result. */
  value: number | null;
  /** Value as shown in large type, for example "142" or "12.5". */
  valueText: string;
  unit: string;
  takenAt: string;
  source: ResultSource;
  /** "Camera" or "Demo clip". */
  sourceLabel: string;
  stoppedEarly: boolean;
  /** "Stopped early" when the user ended the run before it finished. */
  stoppedEarlyText?: string;
  /** Plain-words stop reason, when there is one. */
  stopText?: string;
  /** Plain-words message for runs without a result. */
  noResultText?: string;
  saveable: boolean;
  references: ReferenceLine[];
  /** Chair stand threshold lines, for the chosen band or the general range. */
  thresholdLines: string[];
  disclaimer: string;
}

const STOP_TEXT: Record<StopReason, string> = {
  released: 'Your foot touched down.',
  sway: 'You swayed past the limit.',
  'lost-pose': 'The camera lost sight of you.',
  cap: 'You reached 30 seconds.',
  user: 'You pressed Stop.',
  reps: 'You completed three raises.',
  done: 'You pressed Done.',
  timeout: 'You reached the 60 second limit.',
  window: 'The 30 seconds were up.',
};

/** Rounds down to one decimal, matching the stance timer. */
function floorTenth(n: number): number {
  return Math.floor(n * 10 + 1e-9) / 10;
}

function formatValue(kind: ResultKind, v: number): string {
  if (kind === 'seconds') return floorTenth(v).toFixed(1);
  return String(Math.round(v));
}

function thresholdLines(entry: ReferenceEntry | undefined, band: AgeBand | null | undefined): string[] {
  const bands = entry?.ageBands ?? [];
  if (bands.length === 0) return [];
  const chosen = band ? bands.find((b) => b.band === band) : undefined;
  if (chosen) {
    return [`Ages ${chosen.band}: scores below ${chosen.men} (men) or below ${chosen.women} (women) are listed as below average.`];
  }
  const lo = (f: (b: (typeof bands)[number]) => number) => Math.min(...bands.map(f));
  const hi = (f: (b: (typeof bands)[number]) => number) => Math.max(...bands.map(f));
  return [
    `Across the age bands, scores below ${lo((b) => b.men)} to ${hi((b) => b.men)} (men) or ${lo((b) => b.women)} to ${hi((b) => b.women)} (women) are listed as below average.`,
  ];
}

/** Builds the result card model from a finished run (R5.5, R8.5, R9). */
export function buildResult(o: RunOutcome): ResultViewModel {
  const { test } = o;
  let value: number | null = null;
  if (o.raw !== null && Number.isFinite(o.raw)) {
    if (test.kind === 'rom-peak') {
      const flexion = test.romEdge === 'min' ? kneeFlexion(o.raw) : o.raw;
      if (isValidAngle(flexion)) value = Math.round(flexion);
    } else if (o.raw >= 0) {
      value = test.kind === 'seconds' ? floorTenth(o.raw) : Math.round(o.raw);
    }
  }

  let noResultText: string | undefined;
  if (value === null) {
    noResultText = test.kind === 'seconds' ? 'Foot was not lifted.' : test.kind === 'rom-peak' ? 'No movement detected.' : 'No stands were counted.';
  }

  const entries = o.references ?? REFERENCES;
  const entry = entries.find((r) => r.testFamily === test.family);
  const references: ReferenceLine[] = entry
    ? [{ text: entry.text, source: entry.source, ...(entry.url ? { url: entry.url } : {}), note: entry.note }]
    : [];

  const stoppedEarly = o.stoppedEarly === true || o.stop === 'user';
  const model: ResultViewModel = {
    testId: test.id,
    title: test.title,
    kind: test.kind,
    value,
    valueText: value === null ? '' : formatValue(test.kind, value),
    unit: test.unit,
    takenAt: o.takenAt,
    source: o.source,
    sourceLabel: o.source === 'demo' ? 'Demo clip' : 'Camera',
    stoppedEarly,
    saveable: value !== null,
    references,
    thresholdLines: test.kind === 'count' ? thresholdLines(entry, o.ageBand) : [],
    disclaimer: NON_DIAGNOSIS_LINE,
  };
  if (test.side) model.side = test.side;
  if (o.stop && test.kind !== 'count') model.stopText = STOP_TEXT[o.stop];
  if (stoppedEarly) model.stopText = model.stopText ?? STOP_TEXT.user;
  if (stoppedEarly) model.stoppedEarlyText = 'Stopped early';
  if (noResultText) model.noResultText = noResultText;
  return model;
}
