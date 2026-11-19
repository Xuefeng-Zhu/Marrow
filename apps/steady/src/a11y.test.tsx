import 'fake-indexeddb/auto';
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearAll, saveRecord } from './data/history';
import { setAcknowledged } from './data/prefs';
import { buildResult } from './logic/result';
import { TEST_BY_ID, TESTS } from './tests';
import { About } from './ui/About';
import { Countdown } from './ui/Countdown';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Report } from './ui/Report';
import { ResultCard } from './ui/ResultCard';
import { Run } from './ui/Run';
import { Setup } from './ui/Setup';
import { fakeSpeech, stubCanvas } from './ui/testUtils';

const noop = () => undefined;
const voice = { available: true, on: true, set: noop };
const knee = TEST_BY_ID['knee-flexion-left']!;
const stance = TEST_BY_ID['single-leg-stance-left']!;

/**
 * Runs axe on the rendered screen. Colour contrast is off because jsdom has no layout and the
 * token unit test (contrast.test.ts) covers it. `region` is off for single screens that are
 * rendered without the app shell; the full app is checked separately with it on.
 */
async function violations(container: HTMLElement, rules: Record<string, { enabled: boolean }> = {}) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, ...rules },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`);
}

async function seedHistory() {
  const days = ['2025-03-01T10:00:00Z', '2025-03-08T10:00:00Z', '2025-03-15T10:00:00Z'];
  let n = 0;
  for (const takenAt of days) {
    await saveRecord({
      id: `r${n++}`,
      testId: 'knee-flexion-left',
      kind: 'rom-peak',
      side: 'left',
      value: 100 + n * 5,
      unit: 'degrees',
      takenAt,
      source: n === 1 ? 'demo' : 'camera',
      stoppedEarly: false,
    });
  }
}

beforeEach(() => {
  setAcknowledged(true);
  stubCanvas();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  await clearAll();
});

describe('axe-core finds no violations on any screen (R15.9)', () => {
  const screens: [string, () => ReactElement][] = [
    ['about', () => <About onAcknowledge={noop} />],
    ['home', () => <Home mode="demo" onMode={noop} onChoose={noop} onHistory={noop} voice={voice} />],
    [
      'setup (demo)',
      () => (
        <Setup test={knee} mode="demo" safetyConfirmed={false} error={null} voice={voice} onConfirm={noop} onStart={noop} onBack={noop} onUseDemo={noop} onSourceError={noop} />
      ),
    ],
    [
      'setup (camera with error)',
      () => (
        <Setup test={stance} mode="camera" safetyConfirmed error="permission-denied" voice={voice} onConfirm={noop} onStart={noop} onBack={noop} onUseDemo={noop} onSourceError={noop} />
      ),
    ],
    ['countdown', () => <Countdown n={3} onCancel={noop} />],
    [
      'run',
      () => <Run test={knee} snapshot={null} prompt="Bend your left knee" frameRef={{ current: null }} voice={voice} onStop={noop} onDone={noop} />,
    ],
    [
      'result',
      () => (
        <ResultCard model={buildResult({ test: knee, raw: 50, source: 'demo', takenAt: '2025-03-15T10:00:00Z' })} onTryAgain={noop} onBack={noop} />
      ),
    ],
    [
      'result (no value)',
      () => (
        <ResultCard model={buildResult({ test: knee, raw: null, source: 'camera', takenAt: '2025-03-15T10:00:00Z', stop: 'user', stoppedEarly: true })} onTryAgain={noop} onBack={noop} />
      ),
    ],
    ['history (empty)', () => <History onBack={noop} onReport={noop} />],
    ['report (empty)', () => <Report onBack={noop} />],
  ];

  for (const [name, make] of screens) {
    it(name, async () => {
      const { container } = render(make());
      await new Promise((r) => setTimeout(r, 30)); // let IndexedDB reads finish
      expect(await violations(container)).toEqual([]);
    });
  }

  it('history and report with saved results', async () => {
    await seedHistory();
    for (const make of [() => <History onBack={noop} onReport={noop} />, () => <Report onBack={noop} />]) {
      const { container, unmount } = render(make());
      await waitFor(() => expect(container.textContent).toMatch(/Knee flexion, left leg/));
      expect(await violations(container)).toEqual([]);
      unmount();
    }
  });

  it('the whole app page (landmarks on) for about and home', async () => {
    setAcknowledged(false);
    const first = render(<App speech={fakeSpeech()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/About Steady/);
    expect(await violations(first.container, { region: { enabled: true } })).toEqual([]);
    first.unmount();
    setAcknowledged(true);
    const second = render(<App speech={fakeSpeech()} />);
    expect(await violations(second.container, { region: { enabled: true } })).toEqual([]);
  });
});

describe('keyboard order (R15.4)', () => {
  /** Tabs `count` times from the current focus and returns the accessible label of each stop. */
  async function tabLabels(user: ReturnType<typeof userEvent.setup>, count: number): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      const label = (el as HTMLInputElement).labels?.[0]?.textContent;
      out.push((el.getAttribute('aria-label') ?? label ?? el.textContent ?? '').trim());
    }
    return out;
  }

  it('Home: skip link, then source, voice, history, then the tests in order', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    (document.activeElement as HTMLElement).blur();
    const seen = await tabLabels(user, 6);
    expect(seen[0]).toBe('Skip to main content');
    expect(seen[1]).toMatch(/demo clip/i);
    expect(seen[2]).toMatch(/voice prompts/i);
    expect(seen[3]).toBe('History');
    expect(seen[4]).toBe('Shoulder flexion, left arm');
    expect(seen[5]).toBe('Shoulder flexion, right arm');
  });

  it('Setup: heading focus, then safety check, Start, Back', async () => {
    const user = userEvent.setup();
    render(<App speech={fakeSpeech()} />);
    await user.click(screen.getByRole('button', { name: TESTS[2]!.title }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    await user.tab();
    expect((document.activeElement as HTMLInputElement).type).toBe('checkbox');
    await user.click(document.activeElement as HTMLElement);
    const rest = await tabLabels(user, 8);
    expect(rest).toContain('Start');
    expect(rest).toContain('Back');
    expect(rest.indexOf('Start')).toBeLessThan(rest.indexOf('Back'));
  });

  it('Run: Stop comes first, then Done, then the voice switch', async () => {
    const user = userEvent.setup();
    render(<Run test={knee} snapshot={null} prompt="" frameRef={{ current: null }} voice={voice} onStop={noop} onDone={noop} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    const seen = await tabLabels(user, 3);
    expect(seen[0]).toBe('Stop');
    expect(seen[1]).toBe('Done');
    expect(seen[2]).toMatch(/voice prompts/i);
  });

  it('Result: focus is on the heading and Save result is the first tab stop (R9.6 with R15.4)', async () => {
    const user = userEvent.setup();
    const model = buildResult({ test: knee, raw: 50, source: 'demo', takenAt: '2025-03-15T10:00:00Z' });
    render(<ResultCard model={model} onTryAgain={noop} onBack={noop} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    const seen = await tabLabels(user, 3);
    expect(seen).toEqual(['Save result', 'Try again', 'Back to tests']);
  });
});

describe('stylesheets (R15.1, R15.3, R15.7)', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'src', f), 'utf8');
  const global = read('global.css');
  const ui = read('ui/ui.module.css');

  it('turns off transitions and animations under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/.exec(global)?.[1] ?? '';
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transition:\s*none/);
  });

  it('gives every button a hit area of at least 48px (3rem)', () => {
    const btn = /\.btn\s*{([^}]*)}/.exec(global)?.[1] ?? '';
    expect(btn).toMatch(/min-height:\s*3rem/);
    expect(btn).toMatch(/min-width:\s*3rem/);
  });

  it('uses a body font size of at least 1.125rem', () => {
    expect(/--font-size:\s*([\d.]+)rem/.exec(global)?.[1]).toBeDefined();
    expect(Number(/--font-size:\s*([\d.]+)rem/.exec(global)![1])).toBeGreaterThanOrEqual(1.125);
  });

  it('keeps a focus outline of at least 3px', () => {
    expect(/:focus-visible\s*{[^}]*outline:\s*(\d+)px/.exec(global)?.[1]).toBeDefined();
    expect(Number(/:focus-visible\s*{[^}]*outline:\s*(\d+)px/.exec(global)![1])).toBeGreaterThanOrEqual(3);
  });

  it('leaves at least 0.5rem (8px) between neighbouring controls', () => {
    const row = /\.row\s*{([^}]*)}/.exec(ui)?.[1] ?? '';
    const gap = /gap:\s*([\d.]+)rem/.exec(row)?.[1];
    expect(Number(gap)).toBeGreaterThanOrEqual(0.5);
  });

  it('has no fixed pixel widths on layout (200% zoom)', () => {
    for (const css of [read('App.module.css'), ui]) {
      expect(css).not.toMatch(/(?<!max-|min-)\bwidth:\s*\d+px/);
    }
  });

  it('sets the page language', () => {
    expect(readFileSync(join(process.cwd(), 'index.html'), 'utf8')).toMatch(/<html lang="en">/);
  });
});
