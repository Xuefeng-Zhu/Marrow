import { vi } from 'vitest';
import type { SpeechService } from '../services/speech';

/** jsdom has no canvas. A null 2D context makes the overlay drawing a no-op without logging errors. */
export function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
}

export function fakeSpeech(available = true): SpeechService & { spoken: string[]; cancelled: { count: number } } {
  const spoken: string[] = [];
  const cancelled = { count: 0 };
  return {
    available,
    spoken,
    cancelled,
    speak: (t: string) => void spoken.push(t),
    cancel: () => void (cancelled.count += 1),
  };
}
