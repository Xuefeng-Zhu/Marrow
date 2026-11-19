import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PRESET_CIRCUITS } from './circuits/presets';
import { createSource, type CreateSourceOptions } from './session/sourceFactory';
import { createRattleStore } from './storage/store';

/** The real demo source, with every timer shortened so that a whole clip plays in milliseconds. */
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

beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  await createRattleStore().clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const h1 = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('set and circuit flow in demo mode', () => {
  it('saves a demo set, shows the summary and does not count it toward the streak', async () => {
    const store = createRattleStore();
    const user = userEvent.setup();
    render(<App store={store} createSource={fastDemo} />);
    await user.click(screen.getByRole('button', { name: /^Squat/ }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Squat: set summary/ }, { timeout: 8000 })).toBeTruthy();
    const saved = await store.loadHistory();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ mode: 'demo', movementId: 'squat' });
    expect(screen.getByText(/does not count toward your streak/i)).toBeTruthy();
    expect(screen.queryByText(/streak extended/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Again' }));
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeTruthy();
  }, 15_000);

  it('runs every step of a circuit in order with its own clip, and keeps the sets', async () => {
    const circuit = PRESET_CIRCUITS.find((c) => c.id === 'spooky-starter')!;
    const store = createRattleStore();
    const user = userEvent.setup();
    render(<App store={store} createSource={fastDemo} />);
    await user.click(screen.getByRole('button', { name: /^Spooky Starter/ }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    for (let i = 0; i < circuit.steps.length; i++) {
      await screen.findByRole('heading', { level: 1, name: /set summary/ }, { timeout: 8000 });
      if (i < circuit.steps.length - 1) {
        expect(screen.getByRole('button', { name: 'Skip rest' })).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Skip rest' }));
        await screen.findByRole('button', { name: 'Stop' });
      } else {
        await user.click(screen.getByRole('button', { name: 'Next' }));
      }
    }
    expect(await screen.findByRole('heading', { level: 1, name: /Spooky Starter: done/ })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('th')?.textContent)).toEqual(['1. Squat', '2. Push-up', '3. Plank']);
    const list = await store.loadHistory();
    expect(list.map((e) => e.movementId)).toEqual(['squat', 'push-up', 'plank']);
    expect(list.every((e) => e.circuitId === 'spooky-starter' && e.mode === 'demo')).toBe(true);
  }, 30_000);

  it('skips a step without saving a set, and leaving midway keeps the sets so far', async () => {
    const store = createRattleStore();
    const user = userEvent.setup();
    render(<App store={store} createSource={fastDemo} />);
    await user.click(screen.getByRole('button', { name: /^Spooky Starter/ }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    await user.click(await screen.findByRole('button', { name: 'Skip step' }));
    await waitFor(() => expect(h1()).toMatch(/Push-up/));
    expect(await screen.findByRole('heading', { level: 1, name: /Push-up: set summary/ }, { timeout: 8000 })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(h1()).toBe('Pick your torment');
    expect((await store.loadHistory()).map((e) => e.movementId)).toEqual(['push-up']);
  }, 20_000);
});

describe('history and streak on the picker', () => {
  it('opens the history screen from the picker and goes back', async () => {
    const user = userEvent.setup();
    render(<App store={createRattleStore()} />);
    await user.click(screen.getByRole('button', { name: /History and streak/ }));
    expect(h1()).toBe('History and streak');
    await user.click(await screen.findByRole('button', { name: 'Start a workout' }));
    expect(h1()).toBe('Pick your torment');
  });

  it('shows the live streak on the picker', async () => {
    const store = createRattleStore();
    const now = Date.now();
    const day = new Date(now);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    await store.addEntry({
      id: 'x', movementId: 'squat', kind: 'reps', reps: 10, cleanReps: 10, cleanPct: 100, holdMs: 0,
      tutMs: 1000, warnings: [], mode: 'camera', startedAt: now, day: key,
    });
    render(<App store={store} />);
    await waitFor(() => expect(screen.getByTestId('streak-badge').textContent).toBe('Weekly streak: 1 week'));
  });
});

describe('demo clip mode for every movement', () => {
  it.each(['Squat', 'Push-up', 'Lunge', 'Jumping jack', 'Plank'])('%s runs to a summary with no camera', async (name) => {
    const user = userEvent.setup();
    render(<App store={createRattleStore()} createSource={fastDemo} />);
    await user.click(screen.getByRole('button', { name: new RegExp(`^${name}`, 'i') }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    expect(await screen.findByRole('heading', { level: 1, name: /set summary/ }, { timeout: 8000 })).toBeTruthy();
  }, 15_000);
});
