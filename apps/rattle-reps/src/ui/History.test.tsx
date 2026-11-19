import 'fake-indexeddb/auto';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '../storage/codec';
import { createRattleStore } from '../storage/store';
import { History, weekTotals } from './History';

afterEach(cleanup);

// Wednesday 2025-01-15. The week runs Monday 2025-01-13 to Sunday 2025-01-19.
const TODAY = '2025-01-15';

function entry(id: string, day: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    movementId: 'squat',
    kind: 'reps',
    reps: 10,
    cleanReps: 9,
    cleanPct: 90,
    holdMs: 0,
    tutMs: 12_000,
    warnings: [],
    mode: 'camera',
    startedAt: Date.parse(`${day}T12:00:00Z`),
    day,
    ...over,
  };
}

beforeEach(() => createRattleStore().clearAll());

const props = (store = createRattleStore()) => ({ store, today: TODAY, onStart: vi.fn(), onBack: vi.fn() });

describe('weekTotals', () => {
  it('counts only the entries of the week of today', () => {
    const list = [
      entry('a', '2025-01-12'), // Sunday before
      entry('b', '2025-01-13'),
      entry('c', '2025-01-19', { kind: 'hold', reps: 0, cleanReps: 0, holdMs: 30_000 }),
      entry('d', '2025-01-20'), // Monday after
    ];
    expect(weekTotals(list, TODAY)).toEqual({ sets: 2, reps: 10, holdMs: 30_000 });
  });
});

describe('History screen', () => {
  it('lists newest first with a Demo label, and shows streaks and week totals', async () => {
    const store = createRattleStore();
    await store.addEntry(entry('old', '2025-01-02', { movementId: 'lunge' }));
    await store.addEntry(entry('new', '2025-01-15', { movementId: 'push-up', mode: 'demo' }));
    await store.addEntry(entry('mid', '2025-01-08', { movementId: 'plank', kind: 'hold', reps: 0, cleanReps: 0, holdMs: 20_000 }));
    render(<History {...props(store)} />);
    const items = await screen.findAllByRole('listitem');
    expect(items.map((i) => /Lunge|Push-up|Plank/.exec(i.textContent ?? '')?.[0])).toEqual(['Push-up', 'Plank', 'Lunge']);
    expect(within(items[0]!).getByText('Demo')).toBeTruthy();
    expect(within(items[1]!).queryByText('Demo')).toBeNull();
    expect(screen.getByText('Current streak').nextSibling?.textContent).toBe('2 weeks');
    expect(screen.getByText('Longest streak').nextSibling?.textContent).toBe('2 weeks');
    expect(screen.getByText(/1 set, 10 reps, 0 s of holds/)).toBeTruthy();
  });

  it('shows the empty state with a button to start', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<History {...p} />);
    await user.click(await screen.findByRole('button', { name: 'Start a workout' }));
    expect(p.onStart).toHaveBeenCalled();
  });

  it('asks for confirmation before clearing, and then empties storage', async () => {
    const store = createRattleStore();
    await store.addEntry(entry('a', TODAY));
    const user = userEvent.setup();
    render(<History {...props(store)} />);
    await user.click(await screen.findByRole('button', { name: 'Clear all data' }));
    expect((await store.loadHistory()).length).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((await store.loadHistory()).length).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Clear all data' }));
    await user.click(screen.getByRole('button', { name: /Yes, delete everything/ }));
    expect(await screen.findByText(/No sets yet/)).toBeTruthy();
    expect(await store.loadHistory()).toEqual([]);
  });

  it('shows the no-persistence notice when storage is not available', async () => {
    const store = {
      persistent: false,
      loadHistory: async () => [entry('a', TODAY)],
      clearAll: async () => undefined,
    };
    render(<History {...props(store as never)} />);
    expect(await screen.findByText(/will not be saved/i)).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('works with the in-memory fallback when IndexedDB throws', async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      const store = createRattleStore();
      await store.addEntry(entry('a', TODAY));
      render(<History {...props(store)} />);
      expect(await screen.findAllByRole('listitem')).toHaveLength(1);
      expect(screen.getByText(/will not be saved/i)).toBeTruthy();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, configurable: true });
    }
  });
});

describe('module graph', () => {
  it('History does not import the session, fixtures or camera code', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+'(\.[^']*)'/g)) {
        const target = resolve(dirname(file), m[1]!);
        for (const ext of ['.ts', '.tsx']) {
          try {
            visit(target + ext);
            break;
          } catch {
            // try the next extension, or a non-code file (css, json)
          }
        }
      }
    };
    visit(resolve(root, 'ui/History.tsx'));
    const names = [...seen].map((f) => f.slice(root.length + 1));
    expect(names).toContain('ui/History.tsx');
    for (const n of names) {
      expect(n).not.toMatch(/^(session|fixtures)\//);
      expect(n).not.toMatch(/Session\.tsx$/);
    }
  });
});
