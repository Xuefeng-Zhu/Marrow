import type { MarrowEvent } from 'marrow-core';

export type StanceStop = 'released' | 'sway' | 'lost-pose' | 'cap' | 'user';

export interface StanceState {
  status: 'waiting' | 'running' | 'stopped';
  startT: number | null;
  elapsedMs: number;
}

export interface StanceTimer {
  /** Feeds engine events: `hold:start`, `hold:tick`, `hold:end` and `form:warning` with ruleId `sway-limit`. */
  push(e: MarrowEvent): void;
  stopByUser(t: number): void;
  readonly state: StanceState;
  /** Null until the timer stopped after a `hold:start`. */
  result(): { seconds: number; reason: StanceStop } | null;
}

const SWAY_RULE = 'sway-limit';

/**
 * Times the single-leg stance (R8).
 *
 * `hold:start` carries the time the foot was lifted, but the engine emits it only after the hold's `minMs`, so a sway
 * warning can arrive before it. Such warnings are buffered. When `hold:start` arrives, the earliest buffered warning
 * with `t >= startT` ends the test with reason `sway`. Warnings from before the lift are dropped.
 */
export function createStanceTimer(capMs = 30000): StanceTimer {
  const state: StanceState = { status: 'waiting', startT: null, elapsedMs: 0 };
  const earlySway: number[] = [];
  let outcome: { seconds: number; reason: StanceStop } | null = null;

  function stopAt(t: number, reason: StanceStop): void {
    const startT = state.startT ?? t;
    const raw = t - startT;
    let ms = Math.max(0, raw);
    let why = reason;
    if (raw >= capMs) {
      ms = capMs;
      why = 'cap';
    }
    state.status = 'stopped';
    state.elapsedMs = ms;
    outcome = { seconds: Math.floor(ms / 100) / 10, reason: why };
  }

  function push(e: MarrowEvent): void {
    if (state.status === 'stopped') return;
    if (state.status === 'waiting') {
      if (e.type === 'form:warning' && e.ruleId === SWAY_RULE) {
        earlySway.push(e.t);
      } else if (e.type === 'hold:start') {
        state.status = 'running';
        state.startT = e.t;
        const early = earlySway.filter((t) => t >= e.t);
        earlySway.length = 0;
        if (early.length > 0) stopAt(Math.min(...early), 'sway');
      }
      return;
    }
    const startT = state.startT as number;
    if (e.t < startT) return;
    const elapsed = e.t - startT;
    if (elapsed >= capMs) {
      stopAt(e.t, 'cap');
      return;
    }
    if (e.type === 'hold:end') stopAt(e.t, e.reason);
    else if (e.type === 'form:warning' && e.ruleId === SWAY_RULE) stopAt(e.t, 'sway');
    else state.elapsedMs = Math.max(state.elapsedMs, elapsed);
  }

  return {
    push,
    stopByUser(t) {
      if (state.status === 'stopped') return;
      if (state.status === 'waiting') {
        state.status = 'stopped';
        return;
      }
      stopAt(t, 'user');
    },
    state,
    result: () => (outcome ? { ...outcome } : null),
  };
}
