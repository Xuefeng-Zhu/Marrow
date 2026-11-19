import type { Clock, Frame, PoseSource, SourceError } from 'marrow-core';

/** A virtual time base with timers, for the fixture player and the pausable clock. */
export class FakeTime {
  now = 0;
  private timers: { at: number; fn: () => void; seq: number }[] = [];
  private seq = 0;

  readonly clock: Clock = {
    setTimeout: (fn, ms) => {
      const timer = { at: this.now + ms, fn, seq: this.seq++ };
      this.timers.push(timer);
      return timer;
    },
    clearTimeout: (h) => {
      this.timers = this.timers.filter((t) => t !== h);
    },
  };

  /** Run due timers in order while moving time forward by `ms`. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.now = Math.max(this.now, next.at);
      next.fn();
    }
    this.now = target;
  }
}

/** A `PoseSource` that emits what a test tells it to, and counts its listeners. */
export class ScriptedSource implements PoseSource {
  frameListeners = new Set<(f: Frame) => void>();
  lostListeners = new Set<(t: number) => void>();
  errorListeners = new Set<(e: SourceError) => void>();
  started = false;
  stopCount = 0;

  async start(): Promise<void> {
    this.started = true;
  }
  stop(): void {
    this.started = false;
    this.stopCount += 1;
  }
  onFrame(fn: (f: Frame) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }
  onPoseLost(fn: (t: number) => void): () => void {
    this.lostListeners.add(fn);
    return () => this.lostListeners.delete(fn);
  }
  onError(fn: (e: SourceError) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }
  emit(frame: Frame): void {
    for (const fn of [...this.frameListeners]) fn(frame);
  }
  lost(t: number): void {
    for (const fn of [...this.lostListeners]) fn(t);
  }
  fail(e: SourceError): void {
    for (const fn of [...this.errorListeners]) fn(e);
  }
  get listenerCount(): number {
    return this.frameListeners.size + this.lostListeners.size + this.errorListeners.size;
  }
}

/** A settings store that keeps its values in memory and records writes. */
export function memorySettingsStore(initial: Partial<{ voice: boolean; sound: boolean; showVideo: boolean }> = {}) {
  let saved = { voice: false, sound: false, showVideo: false, ...initial };
  const writes: (typeof saved)[] = [];
  return {
    writes,
    loadSettings: async () => ({ ...saved }),
    saveSettings: async (s: typeof saved) => {
      saved = { ...s };
      writes.push({ ...s });
    },
  };
}
