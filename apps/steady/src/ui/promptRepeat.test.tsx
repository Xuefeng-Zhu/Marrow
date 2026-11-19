import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { clearAll } from '../data/history';
import { setAcknowledged } from '../data/prefs';
import { createRunController } from '../session/controller';
import { fakeSpeech, stubCanvas } from './testUtils';

type Options = Parameters<typeof createRunController>[0];
const captured: { options: Options | null } = { options: null };

vi.mock('../session/controller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/controller')>();
  return {
    ...actual,
    createRunController: vi.fn((options: Options) => {
      captured.options = options;
      return actual.createRunController(options);
    }),
  };
});

const jestShim = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };

beforeEach(() => {
  vi.stubGlobal('jest', jestShim);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  setAcknowledged(true);
  stubCanvas();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  await clearAll();
});

describe('prompt speech', () => {
  it('speaks an identical prompt again when it is emitted again', async () => {
    const speech = fakeSpeech();
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<App speech={speech} />);
    await user.click(screen.getByRole('button', { name: 'Knee flexion, left leg' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    const before = speech.spoken.length;
    await act(async () => captured.options!.onPrompt!('Hold steady.'));
    await act(async () => captured.options!.onPrompt!('Hold steady.'));
    expect(speech.spoken.slice(before)).toEqual(['Hold steady.', 'Hold steady.']);
    await user.click(screen.getByRole('button', { name: 'Stop' }));
  });
});
