import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '../audio/sound';
import type { Voice } from '../audio/voice';
import { memorySettingsStore } from '../session/testSupport';
import { SettingsProvider } from './Settings';
import { Toggles } from './Toggles';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function engines(opts: { voice?: boolean; sound?: boolean } = {}) {
  const voice: Voice = {
    supported: opts.voice ?? true,
    speak: vi.fn(),
    cancel: vi.fn(),
  };
  const sound: Sound = {
    supported: opts.sound ?? true,
    active: false,
    unlock: vi.fn(() => true),
    rattle: vi.fn(),
    close: vi.fn(),
  };
  return { voice, sound };
}

describe('Toggles', () => {
  it('start off and muted, with accessible names and a pressed state', async () => {
    const user = userEvent.setup();
    const store = memorySettingsStore();
    const e = engines();
    render(
      <SettingsProvider store={store} engines={e}>
        <Toggles />
      </SettingsProvider>,
    );
    const voice = screen.getByRole('button', { name: /Voice cues/ });
    const sound = screen.getByRole('button', { name: /Bone rattle sound/ });
    expect(voice.getAttribute('aria-pressed')).toBe('false');
    expect(sound.getAttribute('aria-pressed')).toBe('false');
    expect(e.sound.unlock).not.toHaveBeenCalled();
    await user.click(sound);
    expect(e.sound.unlock).toHaveBeenCalledTimes(1);
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    await user.click(voice);
    expect(voice.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(store.writes.at(-1)).toMatchObject({ voice: true, sound: true }));
    await user.click(voice);
    expect(e.voice.cancel).toHaveBeenCalled();
  });

  it('restores saved choices', async () => {
    render(
      <SettingsProvider store={memorySettingsStore({ voice: true, sound: true })} engines={engines()}>
        <Toggles />
      </SettingsProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Voice cues/ }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: /Bone rattle sound/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('falls back to muted defaults when the saved value cannot be read', async () => {
    const store = { ...memorySettingsStore(), loadSettings: () => Promise.reject(new Error('bad')) };
    render(
      <SettingsProvider store={store} engines={engines()}>
        <Toggles />
      </SettingsProvider>,
    );
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: /Bone rattle sound/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('disables unsupported toggles and says why', () => {
    render(
      <SettingsProvider store={memorySettingsStore()} engines={engines({ voice: false, sound: false })}>
        <Toggles />
      </SettingsProvider>,
    );
    const voice = screen.getByRole('button', { name: /Voice cues/ }) as HTMLButtonElement;
    const sound = screen.getByRole('button', { name: /Bone rattle sound/ }) as HTMLButtonElement;
    expect(voice.disabled).toBe(true);
    expect(sound.disabled).toBe(true);
    expect(document.getElementById(voice.getAttribute('aria-describedby')!)?.textContent).toMatch(/not available/);
    expect(document.getElementById(sound.getAttribute('aria-describedby')!)?.textContent).toMatch(/not available/);
  });

  it('creates no AudioContext before the unmute click (real engine)', async () => {
    const made: unknown[] = [];
    class Ctx {
      constructor() {
        made.push(this);
      }
      resume = async () => undefined;
      close = async () => undefined;
    }
    vi.stubGlobal('AudioContext', Ctx);
    const user = userEvent.setup();
    render(
      <SettingsProvider store={memorySettingsStore()}>
        <Toggles />
      </SettingsProvider>,
    );
    await act(async () => undefined);
    expect(made).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /Bone rattle sound/ }));
    expect(made).toHaveLength(1);
  });
});
