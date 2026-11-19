export interface PromptGate {
  /** True when the text should be shown or spoken at time `t` (ms). False for the same text within the gap. */
  offer(text: string, t: number): boolean;
}

/** Suppresses the same prompt text when it was last allowed less than `minGapMs` ago (R4.5). */
export function createPromptGate(minGapMs = 4000): PromptGate {
  const last = new Map<string, number>();
  return {
    offer(text, t) {
      const prev = last.get(text);
      if (prev !== undefined && t - prev < minGapMs) return false;
      last.set(text, t);
      return true;
    },
  };
}
