import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { OUTCOMES, type ClipId } from '../clips/outcomes';
import { clearAll, listRecords } from '../data/history';
import { setAcknowledged } from '../data/prefs';
import { TESTS } from '../tests';
import { Countdown } from './Countdown';
import { fakeSpeech, stubCanvas } from './testUtils';

/**
 * Testing Library drains a `setTimeout(0)` after each user-event call and only advances it itself when
 * it detects Jest fake timers. This shim lets it advance the Vitest fake clock the same way.
 */
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

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets IndexedDB (fake-indexeddb) finish while timers are faked. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await advance(20);
}

async function untilResult(): Promise<void> {
  for (let t = 0; t < 120000 && !screen.queryByRole('heading', { name: 'Your result' }); t += 500) await advance(500);
}

function setup() {
  const speech = fakeSpeech();
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App speech={speech} />);
  return { speech, user };
}

async function startDemo(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole('button', { name: title }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Start' }));
}

describe('demo flow from Home to a saved result (R13.3)', () => {
  for (const test of TESTS) {
    it(test.id, async () => {
      const { user } = setup();
      await startDemo(user, test.title);
      expect(screen.getByRole('heading', { name: 'Get ready' })).toBeTruthy();
      expect(screen.getByTestId('countdown-number').textContent).toBe('5');
      await advance(1000);
      expect(screen.getByTestId('countdown-number').textContent).toBe('4');
      await advance(4000);
      expect(screen.getByRole('heading', { name: test.title })).toBeTruthy();
      await untilResult();
      expect(screen.getByRole('heading', { name: 'Your result' })).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
      const card = screen.getByRole('article');
      expect(card.textContent).toMatch(/Demo clip/);
      expect(card.textContent).toMatch(/This is not a diagnosis/);
      await user.click(screen.getByRole('button', { name: 'Save result' }));
      await settle();
      expect(screen.getByRole('status').textContent).toMatch(/saved/i);
      const saved = await listRecords();
      expect(saved).toHaveLength(1);
      expect(saved[0]!.testId).toBe(test.id);
      expect(saved[0]!.source).toBe('demo');
      const designed = OUTCOMES[test.id as ClipId];
      if (designed.kind === 'count') expect(saved[0]!.value).toBe(designed.stands);
      if (designed.kind === 'rom-peak') expect(Math.abs(saved[0]!.value - designed.result)).toBeLessThanOrEqual(2);
      if (designed.kind === 'seconds') expect(Math.abs(saved[0]!.value - designed.seconds)).toBeLessThanOrEqual(0.3);
    });
  }
});

describe('run screen', () => {
  it('shows prompts in a polite status region and Stop is reachable by keyboard', async () => {
    const { user } = setup();
    await startDemo(user, 'Knee flexion, left leg');
    await advance(5500);
    const prompt = screen
      .getAllByRole('status')
      .find((r) => r.getAttribute('aria-live') === 'polite' && /knee/i.test(r.textContent ?? ''));
    expect(prompt).toBeTruthy();
    expect(screen.getByRole('img', { name: /skeleton/i })).toBeTruthy();
    const stop = screen.getByRole('button', { name: 'Stop' });
    for (let i = 0; i < 10 && document.activeElement !== stop; i++) await user.tab();
    expect(document.activeElement).toBe(stop);
    await user.keyboard('{Enter}');
    await advance(100);
    expect(screen.getByRole('heading', { name: 'Your result' })).toBeTruthy();
    expect(screen.getByText('Stopped early')).toBeTruthy();
  });

  it('offers Done for range of motion tests only', async () => {
    const { user } = setup();
    await startDemo(user, '30-second chair stand');
    await advance(5500);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
  });

  it('speaks the countdown and prompts, and cancels speech on leaving the run', async () => {
    const { user, speech } = setup();
    await startDemo(user, 'Knee flexion, left leg');
    for (let i = 0; i < 5; i++) await advance(1000);
    expect(speech.spoken.slice(0, 5)).toEqual(['5', '4', '3', '2', '1']);
    await advance(500);
    expect(speech.spoken.some((t) => /bend your left knee/i.test(t))).toBe(true);
    const before = speech.cancelled.count;
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(speech.cancelled.count).toBeGreaterThan(before);
  });

  it('does not speak when the voice is off', async () => {
    const { user, speech } = setup();
    await user.click(screen.getByRole('button', { name: 'Voice prompts: on' }));
    await startDemo(user, 'Knee flexion, left leg');
    await advance(6000);
    expect(speech.spoken).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Stop' }));
  });

  it('Try again returns to setup and Back to tests returns home', async () => {
    const { user } = setup();
    await startDemo(user, 'Knee flexion, left leg');
    await advance(5500);
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { level: 1, name: /Get set/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
  });

  it('Cancel during the countdown returns to setup', async () => {
    const { user } = setup();
    await startDemo(user, 'Knee flexion, left leg');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { level: 1, name: /Get set/ })).toBeTruthy();
  });
});

describe('countdown and reduced motion (R15.7)', () => {
  function mockMatchMedia(reduced: boolean) {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduced && q.includes('reduce'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  it('animates the number by default', () => {
    mockMatchMedia(false);
    render(<Countdown n={3} onCancel={() => undefined} />);
    expect(screen.getByTestId('countdown-number').className).not.toBe('');
  });

  it('swaps numbers with no animation class when reduced motion is set', () => {
    mockMatchMedia(true);
    render(<Countdown n={3} onCancel={() => undefined} />);
    expect(screen.getByTestId('countdown-number').className).toBe('');
  });

  it('is announced politely', () => {
    render(<Countdown n={4} onCancel={() => undefined} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('4');
  });
});
