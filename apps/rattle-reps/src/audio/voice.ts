/** Thin wrapper over `speechSynthesis`. Voice is optional, off by default and never required (R7). */
export interface Voice {
  readonly supported: boolean;
  /** Speak a short line. Pending speech is cancelled first, so at most one utterance waits (R7.7). */
  speak(text: string): void;
  /** Cancel everything pending. */
  cancel(): void;
}

export interface VoiceEnv {
  synth?: Pick<SpeechSynthesis, 'speak' | 'cancel'>;
  Utterance?: new (text: string) => SpeechSynthesisUtterance;
}

export function createVoice(env: VoiceEnv = {}): Voice {
  const synth = env.synth ?? (typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis);
  const Utterance =
    env.Utterance ?? (typeof SpeechSynthesisUtterance === 'undefined' ? undefined : SpeechSynthesisUtterance);
  if (!synth || !Utterance) {
    return { supported: false, speak: () => undefined, cancel: () => undefined };
  }
  return {
    supported: true,
    speak(text) {
      synth.cancel();
      const u = new Utterance(text);
      u.rate = 1.05;
      synth.speak(u);
    },
    cancel() {
      synth.cancel();
    },
  };
}
