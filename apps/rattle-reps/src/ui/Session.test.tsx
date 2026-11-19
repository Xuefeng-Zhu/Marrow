import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replay, type Frame } from 'marrow-core';
import { getFixture } from '../fixtures';
import { getWorkout } from '../movements/registry';
import type { ActiveCue } from '../session/cues';
import type { CreateSourceOptions } from '../session/sourceFactory';
import { ScriptedSource } from '../session/testSupport';
import { CueBar } from './CueBar';
import Session from './Session';
import { RATTLE_MS, rattleOffset } from './SkeletonCanvas';

const ctx = {
  canvas: { width: 640, height: 480 },
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
};

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRaf: number;
let cancelled: number[];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  rafCallbacks = new Map();
  nextRaf = 1;
  cancelled = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRaf++;
    rafCallbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(opts: { id?: string; mode?: 'demo' | 'camera'; reps?: number } = {}) {
  const source = new ScriptedSource();
  const workout = getWorkout(opts.id ?? 'squat')!;
  const onEnd = vi.fn();
  const onUseDemo = vi.fn();
  const createSource = async (_: CreateSourceOptions) => ({
    source,
    pause: () => undefined,
    resume: () => undefined,
  });
  const ui = render(
    <Session
      workout={workout}
      mode={opts.mode ?? 'demo'}
      target={workout.kind === 'reps' ? { kind: 'reps', reps: opts.reps ?? 10 } : { kind: 'hold', seconds: 20 }}
      onEnd={onEnd}
      onHome={() => undefined}
      onUseDemo={onUseDemo}
      createSource={createSource}
    />,
  );
  return { source, onEnd, onUseDemo, ...ui, workout };
}

async function started(source: ScriptedSource) {
  await waitFor(() => expect(source.started).toBe(true));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false));
}

const clip = (id: string): Frame[] => [...replay(getFixture(id)!)];

describe('Session screen', () => {
  it('labels the demo clip, hides the canvas from assistive tech and gives a text alternative', async () => {
    const { source } = setup();
    await started(source);
    expect(screen.getByTestId('demo-label').textContent).toBe('Demo clip');
    const canvas = document.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('canvas-alt').textContent).toMatch(/Rep 0 of 10/);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('counter and its live region follow the rep events', async () => {
    const { source } = setup();
    await started(source);
    const live = screen.getByTestId('counter-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Rep 0 of 10');
    const frames = clip('squat');
    let last = 0;
    for (const frame of frames) {
      act(() => source.emit(frame));
      last = Number(screen.getByTestId('counter-number').textContent);
    }
    expect(last).toBe(6);
    expect(live.textContent).toBe('Rep 6 of 10');
    expect(screen.getByTestId('canvas-alt').textContent).toMatch(/Rep 6 of 10/);
  });

  it('shows a warning cue with an icon and a text label from the clip', async () => {
    const { source } = setup();
    await started(source);
    let seen: string | null = null;
    for (const frame of clip('squat')) {
      act(() => source.emit(frame));
      const w = screen.queryByTestId('warning-cue');
      if (w) {
        seen = w.textContent;
        break;
      }
    }
    expect(seen).toMatch(/Form check:/);
    expect(seen).toMatch(/knees|deeper/i);
    expect(screen.getByTestId('warning-cue').closest('[aria-live]')?.getAttribute('aria-live')).toBe('assertive');
  });

  it('Space pauses and resumes, and Escape stops the set', async () => {
    const user = userEvent.setup();
    const { source, onEnd } = setup();
    await started(source);
    await user.keyboard(' ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    expect(screen.getByTestId('polite-cue').textContent).toBe('Paused');
    await user.keyboard(' ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
    await user.keyboard('{Escape}');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0]![0].reason).toBe('stop');
  });

  it('shortcuts are ignored while a text field has focus', async () => {
    const user = userEvent.setup();
    const { source, onEnd } = setup();
    await started(source);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    await user.keyboard(' {Escape}');
    expect(onEnd).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    input.remove();
  });

  it('Space on a focused button activates the button once and does not also trigger the shortcut', async () => {
    const user = userEvent.setup();
    const { source } = setup();
    await started(source);
    screen.getByRole('button', { name: 'Pause' }).focus();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
  });

  it('shows the pose-lost cue text and the demo fallback after a camera error', async () => {
    const user = userEvent.setup();
    const { source, onUseDemo } = setup({ mode: 'camera' });
    await started(source);
    expect(screen.getByRole('button', { name: 'Show my video' }).getAttribute('aria-pressed')).toBe('false');
    act(() => source.fail({ code: 'camera-denied', message: 'Camera blocked' }));
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/Camera blocked|Use demo clip/);
    await user.click(screen.getByRole('button', { name: 'Use demo clip' }));
    expect(onUseDemo).toHaveBeenCalled();
  });

  it('runs a rAF loop and cancels it on unmount', async () => {
    const { source, unmount } = setup();
    await started(source);
    expect(rafCallbacks.size).toBe(1);
    const [id, cb] = [...rafCallbacks.entries()][0]!;
    act(() => {
      rafCallbacks.delete(id);
      cb(0);
    });
    expect(rafCallbacks.size).toBe(1);
    unmount();
    expect(rafCallbacks.size).toBe(0);
    expect(cancelled.length).toBeGreaterThan(0);
  });
});

describe('CueBar', () => {
  const warn = (text: string, shownAt: number): ActiveCue => ({
    cue: { kind: 'warning', text, ruleId: text },
    shownAt,
    expiresAt: shownAt + 2500,
  });

  it('shows one warning at a time, newest first, and clears it after it expires', () => {
    vi.useFakeTimers();
    let now = 1000;
    const clock = () => now;
    const { rerender } = render(<CueBar cue={warn('First', 1000)} poseLost={false} status="running" now={clock} />);
    expect(screen.getAllByTestId('warning-cue')).toHaveLength(1);
    expect(screen.getByTestId('warning-cue').textContent).toMatch(/First/);
    rerender(<CueBar cue={warn('Second', 1500)} poseLost={false} status="running" now={clock} />);
    expect(screen.getAllByTestId('warning-cue')).toHaveLength(1);
    expect(screen.getByTestId('warning-cue').textContent).toMatch(/Second/);
    now = 4100;
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByTestId('warning-cue')).toBeNull();
    vi.useRealTimers();
  });

  it('shows the pose-lost cue in the polite region', () => {
    render(<CueBar cue={null} poseLost status="running" />);
    expect(screen.getByTestId('polite-cue').textContent).toBe('Step back so I can see you');
    expect(screen.getByTestId('polite-cue').getAttribute('aria-live')).toBe('polite');
  });
});

describe('rattleOffset', () => {
  it('is zero at and after 600 ms, before the start, and under reduced motion', () => {
    expect(rattleOffset(RATTLE_MS, 3)).toEqual({ x: 0, y: 0 });
    expect(rattleOffset(5000, 3)).toEqual({ x: 0, y: 0 });
    expect(rattleOffset(-1, 3)).toEqual({ x: 0, y: 0 });
    for (const t of [0, 10, 100, 300, 599]) expect(rattleOffset(t, 7, true)).toEqual({ x: 0, y: 0 });
  });

  it('decays, is deterministic and moves early on', () => {
    expect(rattleOffset(20, 4)).toEqual(rattleOffset(20, 4));
    const mag = (t: number) => Math.hypot(rattleOffset(t, 4).x, rattleOffset(t, 4).y);
    expect(mag(0)).toBeGreaterThan(5);
    expect(mag(500)).toBeLessThan(mag(0));
  });
});
