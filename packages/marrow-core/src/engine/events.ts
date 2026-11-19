/** Events emitted by the engine. `t` is the timestamp of the frame that caused the event. */
export type MarrowEvent =
  | { type: 'phase'; t: number; from: string | null; to: string }
  | { type: 'rep'; t: number; count: number; durationMs: number; phaseEntries: Record<string, number> }
  | { type: 'hold:start'; t: number; holdId: string }
  | { type: 'hold:tick'; t: number; holdId: string; elapsedMs: number }
  | { type: 'hold:end'; t: number; holdId: string; durationMs: number; reason: 'released' | 'lost-pose' }
  | { type: 'form:warning'; t: number; ruleId: string; message: string; value: number }
  | { type: 'rom:sample'; t: number; metric: string; min: number; max: number; trigger: string };

export type MarrowEventType = MarrowEvent['type'];
