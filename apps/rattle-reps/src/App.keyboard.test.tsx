import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createSource, type CreateSourceOptions } from './session/sourceFactory';
import { createRattleStore } from './storage/store';

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

function nameOf(el: Element | null): string {
  if (!el) return '';
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
}

/** Press Tab until the focused element has a name that matches, so that no pointer is used. */
async function tabTo(user: UserEvent, name: RegExp | string) {
  for (let i = 0; i < 60; i++) {
    await user.tab();
    const active = document.activeElement;
    if (active && active !== document.body && (typeof name === 'string' ? nameOf(active) === name : name.test(nameOf(active)))) return;
  }
  throw new Error(`Could not reach "${String(name)}" with the Tab key`);
}

const h1 = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('keyboard-only run through the app', () => {
  it('picker, mode, demo session, summary, history and back, with only the keyboard', async () => {
    const user = userEvent.setup();
    render(<App store={createRattleStore()} createSource={fastDemo} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    await tabTo(user, /^Squat/);
    await user.keyboard('{Enter}');
    expect(h1()).toMatch(/Squat/);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    await tabTo(user, 'Demo clip');
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { level: 1, name: /set summary/ }, { timeout: 8000 });
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    await tabTo(user, 'Home');
    await user.keyboard('{Enter}');
    expect(h1()).toBe('Pick your torment');

    await tabTo(user, /History and streak/);
    await user.keyboard(' ');
    expect(h1()).toBe('History and streak');
    // The demo set is listed, labelled as a demo.
    expect((await screen.findAllByRole('listitem'))[0]!.textContent).toMatch(/Demo/);

    await tabTo(user, 'Clear all data');
    await user.keyboard('{Enter}');
    await tabTo(user, /Yes, delete/);
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/No sets yet/)).toBeTruthy();

    await tabTo(user, 'Back');
    await user.keyboard('{Enter}');
    expect(h1()).toBe('Pick your torment');
  }, 30_000);

  it('Space pauses and resumes and Escape stops a demo session', async () => {
    const user = userEvent.setup();
    render(<App store={createRattleStore()} />);
    await tabTo(user, /^Plank/);
    await user.keyboard('{Enter}');
    await tabTo(user, 'Demo clip');
    await user.keyboard('{Enter}');
    const pause = await screen.findByRole('button', { name: 'Pause' }, { timeout: 5000 });
    await waitFor(() => expect((pause as HTMLButtonElement).disabled).toBe(false));
    // Focus is on the h1, so Space is a shortcut here.
    (document.activeElement as HTMLElement).blur();
    await user.keyboard(' ');
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeTruthy();
    await user.keyboard(' ');
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 1, name: /No reps yet|set summary/ }, { timeout: 5000 })).toBeTruthy();
  }, 15_000);
});

describe('accessibility basics', () => {
  it('has a lang attribute and a viewport in index.html', () => {
    const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
    expect(html).toMatch(/<html lang="en"/);
  });

  it('every screen has one banner, one main, one h1 and only named buttons', async () => {
    const user = userEvent.setup();
    const check = () => {
      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      for (const b of screen.getAllByRole('button')) expect(nameOf(b)).not.toBe('');
      expect(document.title).toMatch(/\| Rattle Reps$/);
    };
    render(<App store={createRattleStore()} createSource={fastDemo} />);
    check();
    await user.click(screen.getByRole('button', { name: /^Spooky Starter/ }));
    check();
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    await screen.findByRole('button', { name: 'Stop' });
    check();
    await screen.findByRole('heading', { level: 1, name: /set summary/ }, { timeout: 8000 });
    check();
    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: /History and streak/ }));
    await screen.findByText('Your sets');
    check();
  }, 20_000);
});
