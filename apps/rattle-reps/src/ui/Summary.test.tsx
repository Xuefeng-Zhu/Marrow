import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StepResult } from '../circuits/sequencer';
import type { SetSummary } from '../summary/summarize';
import { CircuitSummary } from './CircuitSummary';
import { Summary, type SummaryProps } from './Summary';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const base: SetSummary = {
  movementId: 'squat',
  kind: 'reps',
  reps: 10,
  cleanReps: 8,
  cleanPct: 80,
  holdMs: 0,
  tutMs: 12_000,
  warnings: [{ ruleId: 'knees', message: 'Knees caving in', count: 2 }],
};

function props(over: Partial<SummaryProps> = {}): SummaryProps {
  return {
    summary: base,
    mode: 'camera',
    saved: true,
    streakGain: false,
    streakWeeks: 0,
    persistent: true,
    inCircuit: false,
    circuitDone: false,
    onAgain: vi.fn(),
    onNext: vi.fn(),
    onHome: vi.fn(),
    ...over,
  };
}

describe('Summary', () => {
  it('shows the values of the summary and the warnings by rule', () => {
    render(<Summary {...props()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Squat/);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('12 s')).toBeTruthy();
    expect(screen.getByText(/Knees caving in: 2 times/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('shows the streak gain and a notice when storage does not persist', () => {
    render(<Summary {...props({ streakGain: true, streakWeeks: 3, persistent: false })} />);
    expect(screen.getByText(/streak extended: 3 weeks/i)).toBeTruthy();
    expect(screen.getByText(/will not be saved/i)).toBeTruthy();
  });

  it('shows the demo note for demo sets', () => {
    render(<Summary {...props({ mode: 'demo' })} />);
    expect(screen.getByText(/does not count toward your streak/i)).toBeTruthy();
  });

  it('shows "No reps yet" with retry and home, and shows n/a for clean', async () => {
    const user = userEvent.setup();
    const p = props({ summary: { ...base, reps: 0, cleanReps: 0, cleanPct: 0, warnings: [] }, saved: false });
    render(<Summary {...p} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No reps yet');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(p.onAgain).toHaveBeenCalled();
    expect(p.onHome).toHaveBeenCalled();
  });

  it('offers Next inside a circuit only when the circuit is done, and Skip rest during a rest', async () => {
    const user = userEvent.setup();
    const done = props({ inCircuit: true, circuitDone: true });
    const { unmount } = render(<Summary {...done} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(done.onNext).toHaveBeenCalled();
    unmount();
    const onSkip = vi.fn();
    render(<Summary {...props({ inCircuit: true, rest: { restSec: 20, nextName: 'Push-up', onSkip, onDone: vi.fn() } })} />);
    expect(screen.queryByRole('button', { name: 'Again' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Skip rest' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('counts down and announces the rest at its start and end only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onDone = vi.fn();
    render(<Summary {...props({ inCircuit: true, rest: { restSec: 3, nextName: 'Push-up', onSkip: vi.fn(), onDone } })} />);
    const status = () => screen.getAllByRole('status').map((n) => n.textContent);
    expect(status()).toContain('Rest, 3 seconds');
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      act(() => void vi.advanceTimersByTime(250));
      status().forEach((t) => seen.add(t ?? ''));
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    expect([...seen].sort()).toEqual(['Next: Push-up', 'Rest, 3 seconds']);
  });
});

describe('CircuitSummary', () => {
  it('lists the steps in order with skipped and totals', () => {
    const results: StepResult[] = [
      { index: 0, movementId: 'squat', summary: base },
      { index: 1, movementId: 'push-up', summary: null },
      { index: 2, movementId: 'plank', summary: { ...base, movementId: 'plank', kind: 'hold', reps: 0, holdMs: 20_000, cleanPct: 100 } },
    ];
    render(<CircuitSummary circuitId="spooky-starter" results={results} onHome={vi.fn()} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('th')?.textContent)).toEqual(['1. Squat', '2. Push-up', '3. Plank']);
    expect(rows[1]!.textContent).toMatch(/Skipped/);
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });
});
