/** Small preferences kept in localStorage under a `steady:` prefix. These are not results (R10.1). */

export const AGE_BANDS = ['60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

const PREFIX = 'steady:';

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(PREFIX + key);
    else globalThis.localStorage?.setItem(PREFIX + key, value);
  } catch {
    // Storage may be blocked or full. Preferences are optional, so ignore.
  }
}

/** Voice prompts are on by default. */
export function getVoice(): boolean {
  return read('voice') !== 'off';
}

export function setVoice(on: boolean): void {
  write('voice', on ? 'on' : 'off');
}

export function getAgeBand(): AgeBand | null {
  const v = read('ageBand');
  return (AGE_BANDS as readonly string[]).includes(v ?? '') ? (v as AgeBand) : null;
}

export function setAgeBand(band: AgeBand | null): void {
  write('ageBand', band);
}

export function getAcknowledged(): boolean {
  return read('acknowledged') === 'yes';
}

export function setAcknowledged(v: boolean): void {
  write('acknowledged', v ? 'yes' : null);
}
