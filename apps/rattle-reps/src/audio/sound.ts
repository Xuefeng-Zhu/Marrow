/** A synthesized bone rattle. No audio files, no music (R7.5). */
export interface Sound {
  readonly supported: boolean;
  /** True once the `AudioContext` exists. */
  readonly active: boolean;
  /**
   * Create the `AudioContext`. Call it only from the click that turns sound on (R7.6). Returns
   * false when the browser has no Web Audio.
   */
  unlock(): boolean;
  /** Play one rattle. Does nothing before `unlock()` (a saved "on" creates the context on the first rattle). */
  rattle(): void;
  /** Close the context. */
  close(): void;
}

type Ctor = new () => AudioContext;

export interface SoundEnv {
  AudioContext?: Ctor;
  /** Whether to create the context when `rattle()` is called before `unlock()`. */
  lazy?: () => boolean;
}

const BURSTS = 5;
const SPAN_S = 0.15;

function browserCtor(): Ctor | undefined {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function createSound(env: SoundEnv = {}): Sound {
  const Ctx = env.AudioContext ?? browserCtor();
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  function ensure(): AudioContext | null {
    if (ctx || !Ctx) return ctx;
    try {
      ctx = new Ctx();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(c: AudioContext): AudioBuffer {
    if (noise) return noise;
    const len = Math.floor(c.sampleRate * 0.03);
    noise = c.createBuffer(1, len, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  return {
    supported: !!Ctx,
    get active() {
      return ctx !== null;
    },
    unlock() {
      const c = ensure();
      if (!c) return false;
      void c.resume?.();
      return true;
    },
    rattle() {
      const c = ctx ?? (env.lazy?.() ? ensure() : null);
      if (!c) return;
      const start = c.currentTime;
      for (let i = 0; i < BURSTS; i++) {
        const at = start + (i / BURSTS) * SPAN_S;
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c);
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800 + ((i * 937) % 1400);
        filter.Q.value = 6;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.35, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);
        src.start(at);
        src.stop(at + 0.035);
      }
    },
    close() {
      const c = ctx;
      ctx = null;
      noise = null;
      void c?.close?.();
    },
  };
}
