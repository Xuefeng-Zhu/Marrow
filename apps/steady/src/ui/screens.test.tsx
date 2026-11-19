import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setAcknowledged } from '../data/prefs';
import { createSource } from '../services/source';
import { fakeSpeech, stubCanvas } from './testUtils';

vi.mock('../services/source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/source')>();
  return { ...actual, createSource: vi.fn(actual.createSource) };
});

const createSourceMock = vi.mocked(createSource);

beforeEach(() => {
  setAcknowledged(true);
  stubCanvas();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  createSourceMock.mockClear();
});

describe('Home', () => {
  it('lists the tests with left and right choices and a disclaimer', () => {
    render(<App speech={fakeSpeech()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
    for (const name of [
      'Shoulder flexion, left arm',
      'Shoulder flexion, right arm',
      'Knee flexion, left leg',
      'Knee flexion, right leg',
      '30-second chair stand',
      'Single-leg stance, left leg',
      'Single-leg stance, right leg',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('contentinfo').textContent).toMatch(/not a medical device/i);
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
  });

  it('moves focus to the h1', () => {
    render(<App speech={fakeSpeech()} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('hides the voice control and shows a note when speech is unavailable', () => {
    render(<App speech={fakeSpeech(false)} />);
    expect(screen.queryByRole('button', { name: /voice prompts/i })).toBeNull();
    expect(screen.getByText(/voice prompts are not available/i)).toBeTruthy();
  });

  it('saves the voice choice', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('button', { name: 'Voice prompts: on' }));
    expect(screen.getByRole('button', { name: 'Voice prompts: off' })).toBeTruthy();
    expect(localStorage.getItem('steady:voice')).toBe('off');
  });
});

describe('Setup', () => {
  it('keeps Start disabled until the safety notice is confirmed', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('button', { name: '30-second chair stand' }));
    expect(screen.getByRole('heading', { level: 1, name: /chair stand/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    expect(screen.getByText(/have someone nearby/i)).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    expect(start.disabled).toBe(false);
    await user.click(screen.getByRole('checkbox'));
    expect(start.disabled).toBe(true);
  });

  it('shows the setup steps for the chosen test and goes back to home', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('button', { name: 'Knee flexion, right leg' }));
    expect(screen.getByText(/side-on to the camera with your right leg/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
  });

  it('can be driven with the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    const tabTo = async (el: HTMLElement) => {
      for (let i = 0; i < 40 && document.activeElement !== el; i++) await user.tab();
      expect(document.activeElement).toBe(el);
    };
    await tabTo(screen.getByRole('button', { name: 'Shoulder flexion, left arm' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: /shoulder flexion/i })).toBeTruthy();
    await tabTo(screen.getByRole('checkbox'));
    await user.keyboard(' ');
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    await tabTo(start);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Get ready' })).toBeTruthy();
  });

  it('runs the demo without creating a camera source', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('button', { name: 'Single-leg stance, left leg' }));
    expect(screen.getByText(/no camera is used/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(createSourceMock).toHaveBeenCalled();
    expect(createSourceMock.mock.calls.every(([mode]) => mode === 'demo')).toBe(true);
  });

  it('shows a typed camera error with the demo offered, then uses the demo', async () => {
    const user = userEvent.setup();
    createSourceMock.mockImplementationOnce(async () => ({
      start: async () => undefined,
      stop: () => undefined,
      onFrame: () => () => undefined,
      onPoseLost: () => () => undefined,
      onError: (fn) => {
        queueMicrotask(() => fn({ code: 'camera-denied', message: 'denied' }));
        return () => undefined;
      },
    }));
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('radio', { name: 'Use camera' }));
    await user.click(screen.getByRole('button', { name: 'Knee flexion, left leg' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/camera permission was not given/i);
    await user.click(within(alert).getByRole('button', { name: /demo clip/i }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/no camera is used/i)).toBeTruthy();
  });
});

describe('About', () => {
  it('appears on first launch, once, and can be reopened from the footer', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const { unmount } = render(<App speech={fakeSpeech()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'About Steady' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    expect(screen.getByRole('main').textContent).toMatch(/not a medical device/i);
    expect(screen.getByRole('main').textContent).toMatch(/no video or landmarks leave your browser/i);
    await user.click(screen.getByRole('button', { name: 'I understand' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
    unmount();

    render(<App speech={fakeSpeech()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'About Steady' }));
    expect(screen.getByRole('heading', { level: 1, name: 'About Steady' })).toBeTruthy();
    await act(async () => undefined);
  });
});
