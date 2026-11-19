import type { MarrowEvent } from 'marrow-core';
import type { WorkoutDef } from '../movements/registry';

/** How long a warning cue stays visible unless a newer warning replaces it (at least 2 s, R6.2). */
export const WARNING_VISIBLE_MS = 2500;
/** Minimum time a warning stays visible before anything else may replace it. */
export const MIN_WARNING_MS = 2000;
export const MILESTONE_EVERY = 5;
/** Effects allowed to start within any window of `EFFECT_WINDOW_MS` (R17.3). */
export const MAX_EFFECTS_PER_WINDOW = 3;
export const EFFECT_WINDOW_MS = 1000;

export type CueKind = 'phase' | 'warning' | 'hold' | 'rep' | 'info';

export interface Cue {
  kind: CueKind;
  text: string;
  /** Rule id of a warning cue. */
  ruleId?: string;
  /** Line to speak when voice is on. */
  voice?: string;
  /** Rep cues: true on every 5th rep. */
  milestone?: boolean;
}

/** A cue in state, with the time it was shown and when it expires (null: stays until replaced). */
export interface ActiveCue {
  cue: Cue;
  shownAt: number;
  expiresAt: number | null;
}

/** The cue for an event, or null when the event shows nothing (`hold:tick`, `rom:sample`). */
export function cueFor(event: MarrowEvent, workout: WorkoutDef): Cue | null {
  switch (event.type) {
    case 'rep':
      return {
        kind: 'rep',
        text: `Rep ${event.count}`,
        milestone: event.count % MILESTONE_EVERY === 0,
      };
    case 'phase': {
      const text = workout.phaseCues[event.to];
      return text ? { kind: 'phase', text } : null;
    }
    case 'hold:start':
      return { kind: 'hold', text: 'Hold it!' };
    case 'hold:tick':
      return null;
    case 'hold:end':
      return event.reason === 'lost-pose'
        ? { kind: 'info', text: 'Lost you, get back in frame' }
        : { kind: 'hold', text: 'Nice hold' };
    case 'form:warning':
      return {
        kind: 'warning',
        text: event.message,
        ruleId: event.ruleId,
        voice: workout.ruleVoice?.[event.ruleId] ?? event.message,
      };
    case 'rom:sample':
      return null;
  }
}

/** Whether a rep count is a milestone: every 5th rep and the final rep of a rep target. */
export function isMilestone(count: number, targetReps?: number): boolean {
  return count > 0 && (count % MILESTONE_EVERY === 0 || count === targetReps);
}

/**
 * The cue to show after `incoming` arrives at `now`. A warning replaces whatever is shown. Any other
 * cue waits while a warning is within its minimum visible time. An expired cue is cleared first.
 */
export function nextCue(current: ActiveCue | null, incoming: Cue | null, now: number): ActiveCue | null {
  const live = current && (current.expiresAt === null || now < current.expiresAt) ? current : null;
  if (!incoming) return live;
  if (live && live.cue.kind === 'warning' && incoming.kind !== 'warning' && now < live.shownAt + MIN_WARNING_MS) {
    return live;
  }
  return {
    cue: incoming,
    shownAt: now,
    expiresAt: incoming.kind === 'warning' ? now + WARNING_VISIBLE_MS : incoming.kind === 'rep' ? now + 1000 : null,
  };
}

/** Rate limiter: true when fewer than 3 effects started in the last second. `starts` are epoch ms. */
export function shouldEmit(starts: readonly number[], now: number): boolean {
  let recent = 0;
  for (const s of starts) if (s > now - EFFECT_WINDOW_MS && s <= now) recent += 1;
  return recent < MAX_EFFECTS_PER_WINDOW;
}
