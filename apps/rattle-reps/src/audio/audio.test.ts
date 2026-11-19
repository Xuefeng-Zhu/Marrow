import { describe, expect, it, vi } from 'vitest';
import { createSound } from './sound';
import { createVoice } from './voice';

function fakeAudio() {
  const created: unknown[] = [];
  const nodes = { sources: 0, started: 0 };
  class FakeContext {
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    constructor() {
      created.push(this);
    }
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    createBuffer(_c: number, len: number) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      nodes.sources += 1;
      return { buffer: null, connect: vi.fn(), start: () => (nodes.started += 1), stop: vi.fn() };
    }
    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() };
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }
  return { Ctx: FakeContext as unknown as new () => AudioContext, created, nodes };
}

describe('sound', () => {
  it('creates no AudioContext until unlock, and rattle does nothing before that', () => {
    const { Ctx, created, nodes } = fakeAudio();
    const sound = createSound({ AudioContext: Ctx });
    expect(created).toHaveLength(0);
    sound.rattle();
    expect(created).toHaveLength(0);
    expect(nodes.sources).toBe(0);
    expect(sound.active).toBe(false);
    expect(sound.unlock()).toBe(true);
    expect(created).toHaveLength(1);
    sound.unlock();
    expect(created).toHaveLength(1);
  });

  it('plays 4 to 6 short bursts per rattle and closes the context', () => {
    const { Ctx, nodes } = fakeAudio();
    const sound = createSound({ AudioContext: Ctx });
    sound.unlock();
    sound.rattle();
    expect(nodes.sources).toBeGreaterThanOrEqual(4);
    expect(nodes.sources).toBeLessThanOrEqual(6);
    sound.close();
    expect(sound.active).toBe(false);
  });

  it('a saved "on" creates the context on the first rattle only when asked to', () => {
    const a = fakeAudio();
    createSound({ AudioContext: a.Ctx, lazy: () => false }).rattle();
    expect(a.created).toHaveLength(0);
    const b = fakeAudio();
    createSound({ AudioContext: b.Ctx, lazy: () => true }).rattle();
    expect(b.created).toHaveLength(1);
  });

  it('reports itself unsupported without Web Audio', () => {
    const s = createSound({ AudioContext: undefined });
    const saved = (globalThis as { AudioContext?: unknown }).AudioContext;
    if (saved === undefined) {
      expect(s.supported).toBe(false);
      expect(s.unlock()).toBe(false);
    }
  });
});

describe('voice', () => {
  it('cancels pending speech before each utterance, so one waits at most', () => {
    const calls: string[] = [];
    const synth = { speak: (u: { text: string }) => calls.push(`speak:${u.text}`), cancel: () => calls.push('cancel') };
    class U {
      rate = 1;
      constructor(public text: string) {}
    }
    const voice = createVoice({
      synth: synth as unknown as SpeechSynthesis,
      Utterance: U as unknown as new (t: string) => SpeechSynthesisUtterance,
    });
    expect(voice.supported).toBe(true);
    voice.speak('one');
    voice.speak('two');
    voice.cancel();
    expect(calls).toEqual(['cancel', 'speak:one', 'cancel', 'speak:two', 'cancel']);
  });

  it('is unsupported without speechSynthesis', () => {
    const voice = createVoice({ synth: undefined, Utterance: undefined });
    if (typeof speechSynthesis === 'undefined') {
      expect(voice.supported).toBe(false);
      expect(() => voice.speak('x')).not.toThrow();
    }
  });
});
