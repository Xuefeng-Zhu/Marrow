import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { ActiveCue } from '../session/cues';
import { createSource, type CreateSourceOptions } from '../session/sourceFactory';
import { replay } from 'marrow-core';
import { getFixture } from '../fixtures';
import { memorySettingsStore, ScriptedSource } from '../session/testSupport';
import { createRattleStore } from '../storage/store';
import { CueBar } from './CueBar';
import { History } from './History';
import { SettingsProvider, useSettings } from './Settings';
import { RATTLE_MS, SkeletonCanvas } from './SkeletonCanvas';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CueBar expiry', () => {
  it('schedules nothing for a cue that has already expired', () => {
    vi.useFakeTimers();
    const cue: ActiveCue = { cue: { kind: 'warning', text: 'x', ruleId: 'x' }, shownAt: 0, expiresAt: 2500 };
    // The default clock (performance.now) is far past the expiry once timers are faked at a later time.
    vi.setSystemTime(10_000);
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    render(<CueBar cue={cue} poseLost={false} status="paused" />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reschedule after the expiry timeout fires', () => {
    vi.useFakeTimers();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const cue: ActiveCue = { cue: { kind: 'warning', text: 'x', ruleId: 'x' }, shownAt: 1000, expiresAt: 3500 };
    render(<CueBar cue={cue} poseLost={false} status="running" />);
    expect(vi.getTimerCount()).toBe(1);
    t = 3600;
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByTestId('warning-cue')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SkeletonCanvas', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('clears the reduced-motion flash after the rattle time', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const sub = () => () => undefined;
    const { container, rerender } = render(<SkeletonCanvas subscribe={sub} reps={0} cue={null} />);
    const canvas = container.querySelector('canvas')!;
    const base = canvas.className;
    rerender(<SkeletonCanvas subscribe={sub} reps={1} cue={null} />);
    expect(canvas.className).not.toBe(base);
    act(() => {
      vi.advanceTimersByTime(RATTLE_MS + 10);
    });
    expect(canvas.className.trim()).toBe(base.trim());
    vi.unstubAllGlobals();
  });

  it('sizes the canvas to the camera aspect ratio', () => {
    const sub = () => () => undefined;
    const { container } = render(<SkeletonCanvas subscribe={sub} reps={0} cue={null} aspect={16 / 9} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });
});

describe('History clear all', () => {
  it('resets the active settings and does not write them back later', async () => {
    const user = userEvent.setup();
    const saved = { voice: true, sound: true, showVideo: true };
    const settingsStore = memorySettingsStore(saved);
    const store = createRattleStore();
    const voice = { supported: true, speak: vi.fn(), cancel: vi.fn() };
    const sound = { supported: true, active: true, unlock: vi.fn(() => true), rattle: vi.fn(), close: vi.fn() };
    function Probe() {
      const { settings } = useSettings();
      return <p data-testid="probe">{JSON.stringify(settings)}</p>;
    }
    render(
      <SettingsProvider store={settingsStore} engines={{ voice, sound }}>
        <Probe />
        <History store={store} today="2025-01-15" onStart={() => undefined} onBack={() => undefined} />
      </SettingsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('"sound":true'));
    await user.click(await screen.findByRole('button', { name: 'Clear all data' }));
    await user.click(screen.getByRole('button', { name: /Yes, delete everything/ }));
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe(
      JSON.stringify({ voice: false, sound: false, showVideo: false }),
    ));
    expect(sound.close).toHaveBeenCalled();
    expect(voice.cancel).toHaveBeenCalled();
  });
});

describe('App flow fixes', () => {
  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await createRattleStore().clearAll();
  });

  const fastDemo = (o: CreateSourceOptions) =>
    createSource({
      ...o,
      clock: {
        base: {
          setTimeout: (fn) => globalThis.setTimeout(fn, 0),
          clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
        },
        now: () => 0,
      },
    });

  it('unlocks restored sound from the click that starts the session', async () => {
    const user = userEvent.setup();
    const unlock = vi.fn(() => true);
    const AudioCtx = vi.fn();
    vi.stubGlobal('AudioContext', AudioCtx);
    // The default engines are used here, so check the browser-level effect: a context is created on click.
    AudioCtx.mockImplementation(function (this: Record<string, unknown>) {
      this.resume = unlock;
      this.close = () => Promise.resolve();
    });
    const store = createRattleStore();
    await store.saveSettings({ voice: false, sound: true, showVideo: false });
    render(<App store={store} createSource={fastDemo} />);
    await user.click(screen.getByRole('button', { name: /^Squat/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Bone rattle sound/ }).getAttribute('aria-pressed')).toBe('true'),
    );
    expect(AudioCtx).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    expect(AudioCtx).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('skip step keeps the reps done so far', async () => {
    const user = userEvent.setup();
    const store = createRattleStore();
    const source = new ScriptedSource();
    const scripted = async () => ({ source, pause: () => undefined, resume: () => undefined });
    render(<App store={store} createSource={scripted} />);
    await user.click(screen.getByRole('button', { name: /^Spooky Starter/ }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    await waitFor(() => expect(source.started).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false));
    const frames = [...replay(getFixture('squat')!)];
    for (const frame of frames.slice(0, Math.floor(frames.length / 2))) act(() => source.emit(frame));
    await user.click(screen.getByRole('button', { name: 'Skip step' }));
    await waitFor(async () => expect((await store.loadHistory()).length).toBe(1), { timeout: 8000 });
    expect((await store.loadHistory())[0]).toMatchObject({ movementId: 'squat', circuitId: 'spooky-starter' });
  });

  it('does not retry the camera while a demo fallback set is being saved', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    vi.stubGlobal('isSecureContext', true);
    const store = createRattleStore();
    const realAdd = store.addEntry.bind(store);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(store, 'addEntry').mockImplementation(async (e) => {
      await gate;
      return realAdd(e);
    });
    const modes: string[] = [];
    const source = new ScriptedSource();
    const make = async (o: CreateSourceOptions) => {
      modes.push(o.mode);
      if (o.mode === 'camera') throw new Error('no camera');
      return { source, pause: () => undefined, resume: () => undefined };
    };
    render(<App store={store} createSource={make} />);
    await user.click(screen.getByRole('button', { name: /^Squat/ }));
    await user.click(screen.getByRole('button', { name: 'Camera' }));
    await user.click(await screen.findByRole('button', { name: 'Use demo clip' }));
    await waitFor(() => expect(source.started).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false));
    for (const frame of [...replay(getFixture('squat')!)]) act(() => source.emit(frame));
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(modes).toEqual(['camera', 'demo']);
    release();
    expect(await screen.findByRole('heading', { level: 1, name: /set summary/ })).toBeTruthy();
    expect(modes).toEqual(['camera', 'demo']);
    vi.unstubAllGlobals();
  });
});
