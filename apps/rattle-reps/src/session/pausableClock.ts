import type { Clock } from 'marrow-core';

export interface PausableClock extends Clock {
  /** Suspend every pending timer, keeping how long each still has to run. */
  pause(): void;
  /** Restart every suspended timer with its remaining delay. */
  resume(): void;
  readonly paused: boolean;
}

interface Entry {
  fn: () => void;
  /** Delay left while suspended. */
  remaining: number;
  /** Time at which the timer is due while running. */
  due: number;
  handle: unknown;
}

export interface PausableClockOptions {
  /** The clock that really runs timers. Default: the global timers. */
  base?: Clock;
  /** Current time in ms. Must be the same time base that `base` runs on. Default: `Date.now`. */
  now?: () => number;
}

const globalClock: Clock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * A `Clock` for `createFixturePlayer` that can be suspended, so a paused demo clip does not advance.
 * On `pause()` pending timers are cleared and their remaining delay is recorded, and `resume()`
 * schedules them again with that delay. A timer set while paused starts on `resume()`.
 */
export function createPausableClock(opts: PausableClockOptions = {}): PausableClock {
  const base = opts.base ?? globalClock;
  const now = opts.now ?? (() => Date.now());
  const entries = new Set<Entry>();
  let paused = false;

  function run(entry: Entry, delay: number): void {
    entry.due = now() + delay;
    entry.handle = base.setTimeout(() => {
      entries.delete(entry);
      entry.handle = undefined;
      entry.fn();
    }, delay);
  }

  return {
    setTimeout(fn, ms) {
      const entry: Entry = { fn, remaining: Math.max(0, ms), due: 0, handle: undefined };
      entries.add(entry);
      if (!paused) run(entry, entry.remaining);
      return entry;
    },
    clearTimeout(handle) {
      const entry = handle as Entry;
      if (!entries.delete(entry)) return;
      if (entry.handle !== undefined) base.clearTimeout(entry.handle);
      entry.handle = undefined;
    },
    pause() {
      if (paused) return;
      paused = true;
      for (const entry of entries) {
        if (entry.handle === undefined) continue;
        base.clearTimeout(entry.handle);
        entry.handle = undefined;
        entry.remaining = Math.max(0, entry.due - now());
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const entry of [...entries]) if (entry.handle === undefined) run(entry, entry.remaining);
    },
    get paused() {
      return paused;
    },
  };
}
