import type { MarrowEvent } from 'marrow-core';

export interface ChairStandCounter {
  /** Feeds engine events: `rep` events are counted, `phase` events track the phase, and any event after the window closes it. */
  push(e: MarrowEvent): void;
  /** Records the engine phase at time `t`. A `t` after the window closes it. */
  setPhase(phase: string | null, t: number): void;
  /** Closes the window. Call it when pipeline time reaches the end of the window, or at the end of a stopped run. Safe to call twice. */
  finish(): void;
  /** Reps inside the window, plus the standing bonus once the window is closed. Never decreases. */
  result(): number;
  readonly closed: boolean;
}

/**
 * Counts the 30-second chair stand (R7).
 *
 * Window rule: `startT <= t <= startT + windowMs`. Only `rep` events inside the window count, and the engine already
 * drops cycles shorter than the spec's `minRepMs`, so those never reach the count.
 *
 * Standing bonus: +1 when the phase at the end of the window is `standing`. It is applied once, when the window closes,
 * so the live count only ever goes up (reps), the bonus then adds at most 1, and the result is frozen. The bonus cannot
 * double count the same stand: the `rep` for a stand that is still in progress at the end carries a `t` after the
 * window and is ignored. A fast stand and sit that the engine discards leaves the phase at `seated`, so no bonus
 * is given for it and the count cannot drop later.
 */
export function createChairStandCounter(startT: number, windowMs = 30000): ChairStandCounter {
  const endT = startT + windowMs;
  let reps = 0;
  let phase: string | null = null;
  let closed = false;
  let bonus = 0;

  function close(): void {
    if (closed) return;
    closed = true;
    bonus = phase === 'standing' ? 1 : 0;
  }

  function setPhase(next: string | null, t: number): void {
    if (closed) return;
    if (t > endT) {
      close();
      return;
    }
    phase = next;
  }

  return {
    push(e) {
      if (closed) return;
      if (e.t > endT) {
        close();
        return;
      }
      if (e.type === 'phase') setPhase(e.to, e.t);
      else if (e.type === 'rep' && e.t >= startT) reps += 1;
    },
    setPhase,
    finish: close,
    result: () => reps + bonus,
    get closed() {
      return closed;
    },
  };
}
