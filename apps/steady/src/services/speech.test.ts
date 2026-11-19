import { describe, expect, it } from 'vitest';
import { createSpeechService } from './speech';

function fakeSynth() {
  const log: string[] = [];
  class Utt {
    constructor(public text: string) {}
  }
  return {
    log,
    Utt,
    synth: {
      speak: (u: unknown) => log.push(`speak:${(u as { text: string }).text}`),
      cancel: () => log.push('cancel'),
    },
  };
}

describe('speech service', () => {
  it('cancels before every speak so prompts do not queue', () => {
    const f = fakeSynth();
    const s = createSpeechService(f.synth, f.Utt);
    s.speak('one');
    s.speak('two');
    expect(f.log).toEqual(['cancel', 'speak:one', 'cancel', 'speak:two']);
  });

  it('cancel stops speech', () => {
    const f = fakeSynth();
    const s = createSpeechService(f.synth, f.Utt);
    s.cancel();
    expect(f.log).toEqual(['cancel']);
  });

  it('is available with a synth', () => {
    const f = fakeSynth();
    expect(createSpeechService(f.synth, f.Utt).available).toBe(true);
  });

  it('is unavailable and silent without speechSynthesis', () => {
    const s = createSpeechService(null, undefined);
    expect(s.available).toBe(false);
    expect(() => {
      s.speak('hello');
      s.cancel();
    }).not.toThrow();
  });

  it('is unavailable in jsdom, which has no speechSynthesis', () => {
    expect(createSpeechService().available).toBe(false);
  });

  it('does not throw when the synth throws', () => {
    const s = createSpeechService(
      { speak: () => { throw new Error('boom'); }, cancel: () => { throw new Error('boom'); } },
      class { constructor(public text: string) {} },
    );
    expect(() => { s.speak('x'); s.cancel(); }).not.toThrow();
  });
});
