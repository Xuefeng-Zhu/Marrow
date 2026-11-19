import { createPipeline, type MarrowEvent, type Pipeline, type PoseSource, type SourceError } from 'marrow-core';
import type { OneEuroOptions } from 'marrow-core';
import { createChairStandCounter, type ChairStandCounter } from '../logic/chairStand';
import { createPromptGate } from '../logic/prompts';
import type { ResultSource, RomStop, RunOutcome, StopReason } from '../logic/result';
import { isValidAngle, kneeFlexion, selectPeak } from '../logic/rom';
import { createStanceTimer, type StanceTimer } from '../logic/stance';
import { createSource } from '../services/source';
import type { SourceMode } from './machine';
import type { TestDef } from '../tests';

/** Clock and timers, injectable so tests and demo runs are deterministic. */
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export const COUNTDOWN_SECONDS = 5;
/** A ROM run ends after this many engine `rep` events (R5.1). */
export const ROM_REPS = 3;
/** A stance run in which the foot is never lifted ends after this long without a lift. */
export const STANCE_WAIT_MS = 60000;
/** The pose is reported lost after this long without a frame (R4.6). */
export const LOST_PROMPT_MS = 2000;

export type RunPhase = 'idle' | 'countdown' | 'running' | 'ended';

export interface RunSnapshot {
  phase: RunPhase;
  /** Countdown number shown (5 to 1), or null outside the countdown. */
  countdown: number | null;
  /** Pipeline time since the first frame of the run, in ms. */
  elapsedMs: number;
  remainingMs: number;
  /** Live value: ROM peak so far (flexion), chair stand reps in the window, or stance seconds. */
  value: number | null;
  reps: number;
  prompt: string;
}

export interface ControllerOptions {
  test: TestDef;
  mode: SourceMode;
  scheduler?: Scheduler;
  createSource?: (mode: SourceMode, test: TestDef) => Promise<PoseSource>;
  /** Smoothing is on by default, as in the core. */
  smoothing?: OneEuroOptions | false;
  onUpdate?: (s: RunSnapshot) => void;
  /** Text to show and speak. Already passed through the 4 second prompt gate (R4.5). */
  onPrompt?: (text: string) => void;
  onCountdown?: (n: number) => void;
  onSourceError?: (e: SourceError) => void;
  onEnd?: (o: RunOutcome) => void;
}

export interface RunController {
  /** Starts the 5 second countdown, then the pipeline. */
  start(): void;
  /** Ends the run as the user pressing Stop (R4.4). During the countdown it cancels the run. */
  stop(): void;
  /** Ends a ROM run as the user pressing Done (R5.1). */
  done(): void;
  snapshot(): RunSnapshot;
}

/**
 * Wires the pipeline, the logic modules, the countdown and the end-of-run rules.
 *
 * Deadlines are enforced by a timer as well as by frame timestamps (R5.1, R7.1, R8.2). A camera that
 * stops delivering frames, or a clip that has ended, would otherwise leave the run open forever.
 * The timer starts when the first frame of the run arrives, so it measures the same window as the
 * pipeline time does for a source that runs in real time.
 */
export function createRunController(opts: ControllerOptions): RunController {
  const { test, mode } = opts;
  const sched = opts.scheduler ?? systemScheduler;
  const makeSource = opts.createSource ?? createSource;
  const gate = createPromptGate();
  const rom = test.kind === 'rom-peak';
  const source: ResultSource = mode === 'demo' ? 'demo' : 'camera';

  let phase: RunPhase = 'idle';
  let countdown: number | null = null;
  let prompt = '';
  let countdownHandle: unknown;
  let deadlineHandle: unknown;
  let capHandle: unknown;
  let lostHandle: unknown;
  let pipeline: Pipeline | null = null;
  let src: PoseSource | null = null;
  let offError: (() => void) | null = null;
  let generation = 0;

  let startT: number | null = null;
  let lastT = 0;
  let lastWall = 0;

  let reps = 0;
  /** ROM values seen: flexion for samples and frames, in degrees. */
  let flexions: number[] = [];
  let pending: { min: number; max: number } | null = null;
  let counter: ChairStandCounter | null = null;
  let stance: StanceTimer | null = null;

  function romFlexion(angle: number): number {
    return test.romEdge === 'min' ? kneeFlexion(angle) : angle;
  }

  function romPeak(): number | null {
    flushPending();
    return selectPeak(flexions);
  }

  function flushPending(): void {
    if (!pending) return;
    const edge = test.romEdge === 'min' ? pending.min : pending.max;
    flexions.push(romFlexion(edge));
    pending = null;
  }

  function liveValue(): number | null {
    if (rom) {
      const all = pending ? [...flexions, romFlexion(test.romEdge === 'min' ? pending.min : pending.max)] : flexions;
      return selectPeak(all);
    }
    if (test.kind === 'count') return counter ? counter.result() : null;
    if (!stance) return null;
    const r = stance.result();
    return r ? r.seconds : Math.floor(stance.state.elapsedMs / 100) / 10;
  }

  function snapshot(): RunSnapshot {
    const elapsed = startT === null ? 0 : Math.max(0, lastT - startT);
    return {
      phase,
      countdown,
      elapsedMs: elapsed,
      remainingMs: Math.max(0, test.limitMs - elapsed),
      value: liveValue(),
      reps,
      prompt,
    };
  }

  function update(): void {
    opts.onUpdate?.(snapshot());
  }

  function say(text: string, t: number): void {
    if (!text || phase === 'ended') return;
    if (!gate.offer(text, t)) return;
    prompt = text;
    opts.onPrompt?.(text);
  }

  function clearTimers(): void {
    if (countdownHandle !== undefined) sched.clearTimeout(countdownHandle);
    if (deadlineHandle !== undefined) sched.clearTimeout(deadlineHandle);
    if (capHandle !== undefined) sched.clearTimeout(capHandle);
    if (lostHandle !== undefined) sched.clearTimeout(lostHandle);
    countdownHandle = deadlineHandle = capHandle = lostHandle = undefined;
  }

  function release(): void {
    offError?.();
    offError = null;
    if (pipeline) pipeline.stop();
    else src?.stop();
    pipeline = null;
    src = null;
  }

  function finish(stop: StopReason, stoppedEarly: boolean, raw: number | null): void {
    if (phase === 'ended') return;
    phase = 'ended';
    clearTimers();
    release();
    countdown = null;
    const outcome: RunOutcome = { test, raw, stop, stoppedEarly, source, takenAt: new Date(sched.now()).toISOString() };
    update();
    opts.onEnd?.(outcome);
  }

  /** ROM: raw is the joint angle (`buildResult` converts knee flexion), so convert the flexion peak back. */
  function romRaw(): number | null {
    const peak = romPeak();
    if (peak === null || !isValidAngle(peak)) return null;
    return test.romEdge === 'min' ? kneeFlexion(peak) : peak;
  }

  function endRom(stop: RomStop): void {
    finish(stop, stop === 'user', romRaw());
  }

  function endChair(stop: 'window' | 'user'): void {
    counter?.finish();
    finish(stop, stop === 'user', counter ? counter.result() : 0);
  }

  function endStance(stop: 'user' | 'timeout'): void {
    if (stop === 'user') stance?.stopByUser(lastT);
    const r = stance?.result() ?? null;
    if (r) finish(r.reason, r.reason === 'user', r.seconds);
    else finish(stop, stop === 'user', null);
  }

  function endByUser(): void {
    if (phase !== 'running') return;
    if (rom) endRom('user');
    else if (test.kind === 'count') endChair('user');
    else endStance('user');
  }

  /** Deadline timer fired: no frame closed the run in time. */
  function onDeadline(): void {
    deadlineHandle = undefined;
    if (phase !== 'running') return;
    if (startT !== null) lastT = Math.max(lastT, startT + test.limitMs);
    if (rom) endRom('timeout');
    else if (test.kind === 'count') endChair('window');
    else {
      // The foot was never lifted within the wait.
      endStance('timeout');
    }
  }

  function armDeadline(afterMs: number): void {
    if (deadlineHandle !== undefined) sched.clearTimeout(deadlineHandle);
    deadlineHandle = sched.setTimeout(onDeadline, afterMs);
  }

  function checkStance(): void {
    if (stance && stance.state.status === 'stopped') {
      const r = stance.result();
      if (r) finish(r.reason, false, r.seconds);
    }
  }

  /** Stance cap check driven by the timer, for when frames stop after the foot is lifted. */
  function armCap(holdStartT: number): void {
    if (capHandle !== undefined) sched.clearTimeout(capHandle);
    const capMs = test.limitMs;
    const wait = Math.max(0, holdStartT + capMs - lastT - (sched.now() - lastWall));
    capHandle = sched.setTimeout(() => {
      capHandle = undefined;
      if (phase !== 'running' || !stance) return;
      stance.push({ type: 'hold:tick', t: holdStartT + capMs, holdId: 'cap', elapsedMs: capMs });
      lastT = Math.max(lastT, holdStartT + capMs);
      checkStance();
    }, wait);
  }

  function armLost(): void {
    if (lostHandle !== undefined) sched.clearTimeout(lostHandle);
    lostHandle = sched.setTimeout(() => {
      lostHandle = undefined;
      if (phase === 'running') say(test.script.lost, lastT + LOST_PROMPT_MS);
    }, LOST_PROMPT_MS);
  }

  function onEvent(e: MarrowEvent): void {
    if (phase !== 'running') return;
    if (rom) {
      if (e.type === 'rom:sample' && e.metric === test.metric) {
        // The frame extremes since the last sample are covered by this sample.
        pending = null;
        flexions.push(romFlexion(test.romEdge === 'min' ? e.min : e.max));
      } else if (e.type === 'rep') {
        reps = e.count;
        say(test.script.rep, e.t);
        update();
        if (reps >= ROM_REPS) endRom('reps');
      }
      return;
    }
    if (test.kind === 'count') {
      counter?.push(e);
      if (e.type === 'rep' && counter && !counter.closed) {
        reps += 1;
        update();
      }
      return;
    }
    if (!stance) return;
    const before = stance.state.status;
    stance.push(e);
    if (before === 'waiting' && stance.state.status === 'running') {
      say(test.script.hold, e.t);
      // From the lift on, the cap timer is the deadline, so the wait-for-lift timer is replaced.
      if (deadlineHandle !== undefined) sched.clearTimeout(deadlineHandle);
      deadlineHandle = undefined;
      armCap(stance.state.startT!);
    }
    if (e.type === 'form:warning') say(test.script.warn[e.ruleId] ?? '', e.t);
    checkStance();
  }

  function onFrameProcessed(f: { frame: { t: number }; metrics: Record<string, number>; phase: string | null }): void {
    if (phase !== 'running') return;
    const t = f.frame.t;
    lastT = t;
    lastWall = sched.now();
    armLost();
    if (startT === null) {
      startT = t;
      counter = test.kind === 'count' ? createChairStandCounter(t, test.limitMs) : null;
      // Restart the deadline from the first frame so it measures the same window as the timeline.
      armDeadline(rom || test.kind === 'count' ? test.limitMs : STANCE_WAIT_MS);
      say(test.script.go, t);
    }
    if (rom) {
      const v = test.metric ? f.metrics[test.metric] : undefined;
      if (v !== undefined && Number.isFinite(v)) {
        pending = pending ? { min: Math.min(pending.min, v), max: Math.max(pending.max, v) } : { min: v, max: v };
      }
      if (t - startT >= test.limitMs) endRom('timeout');
    } else if (test.kind === 'count' && counter) {
      counter.setPhase(f.phase, t);
      if (t > startT + test.limitMs) endChair('window');
    }
    update();
  }

  async function begin(gen: number): Promise<void> {
    let s: PoseSource;
    try {
      s = await makeSource(mode, test);
    } catch (err) {
      if (gen !== generation) return;
      phase = 'ended';
      clearTimers();
      opts.onSourceError?.({ code: 'camera-unavailable', message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (gen !== generation || phase !== 'running') {
      s.stop();
      return;
    }
    src = s;
    offError = s.onError((e) => {
      if (phase === 'ended') return;
      phase = 'ended';
      clearTimers();
      release();
      opts.onSourceError?.(e);
    });
    const p = createPipeline({ source: s, spec: test.spec, smoothing: opts.smoothing ?? undefined });
    pipeline = p;
    stance = test.kind === 'seconds' ? createStanceTimer(test.limitMs) : null;
    p.onFrame(onFrameProcessed);
    for (const type of ['rep', 'rom:sample', 'hold:start', 'hold:tick', 'hold:end', 'form:warning', 'phase'] as const) {
      p.on(type, onEvent);
    }
    // A run that never gets a frame still ends by the timer.
    lastWall = sched.now();
    armDeadline(rom || test.kind === 'count' ? test.limitMs : STANCE_WAIT_MS);
    await p.start();
  }

  function tickCountdown(n: number, gen: number): void {
    countdown = n;
    opts.onCountdown?.(n);
    update();
    countdownHandle = sched.setTimeout(() => {
      countdownHandle = undefined;
      if (gen !== generation || phase !== 'countdown') return;
      if (n > 1) tickCountdown(n - 1, gen);
      else {
        countdown = null;
        phase = 'running';
        update();
        void begin(gen);
      }
    }, 1000);
  }

  return {
    start() {
      if (phase !== 'idle') return;
      generation += 1;
      phase = 'countdown';
      tickCountdown(COUNTDOWN_SECONDS, generation);
    },
    stop() {
      if (phase === 'countdown') {
        generation += 1;
        phase = 'idle';
        countdown = null;
        clearTimers();
        update();
        return;
      }
      endByUser();
    },
    done() {
      if (phase === 'running' && rom) endRom('done');
    },
    snapshot,
  };
}
