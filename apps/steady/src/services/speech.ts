/** Minimal parts of the browser speech API that Steady uses, so tests can pass a fake. */
export interface SynthLike {
  speak(utterance: unknown): void;
  cancel(): void;
}
export type UtteranceCtor = new (text: string) => unknown;

export interface SpeechService {
  /** False when `speechSynthesis` is missing. The UI hides the voice control then (R14.4). */
  readonly available: boolean;
  /** Cancels speech in progress, then speaks, so prompts never queue (R14.2). */
  speak(text: string): void;
  /** Stops speech in progress (R14.3). */
  cancel(): void;
}

const UNAVAILABLE: SpeechService = {
  available: false,
  speak: () => undefined,
  cancel: () => undefined,
};

/**
 * Wraps `speechSynthesis`. Pass a fake synth and utterance constructor in tests. With no
 * arguments it uses the browser globals, and is unavailable when they are missing.
 */
export function createSpeechService(
  synth: SynthLike | null | undefined = (globalThis as { speechSynthesis?: SynthLike }).speechSynthesis,
  Utterance: UtteranceCtor | undefined = (globalThis as { SpeechSynthesisUtterance?: UtteranceCtor })
    .SpeechSynthesisUtterance,
): SpeechService {
  if (!synth || !Utterance) return UNAVAILABLE;
  return {
    available: true,
    speak(text) {
      if (!text) return;
      try {
        synth.cancel();
        synth.speak(new Utterance(text));
      } catch {
        // Speech is an extra. The prompt text is still on screen.
      }
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        // ignore
      }
    },
  };
}
