import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Effects, EFFECT_LIFE_MS } from './Effects';
import { repEffect, setEffect, streakEffect, type EffectRequest } from './effectTriggers';

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduce,
    media: '',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const req = (key: number, kind: EffectRequest['kind'] = 'milestone', text = `Rep ${key}!`): EffectRequest => ({
  key,
  kind,
  text,
});

describe('Effects', () => {
  it('cleans itself up within 2 s', () => {
    render(<Effects request={req(1)} />);
    expect(screen.getAllByTestId('effect')).toHaveLength(1);
    expect(EFFECT_LIFE_MS).toBeLessThanOrEqual(2000);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.queryAllByTestId('effect')).toHaveLength(0);
    expect(screen.getByTestId('effects').children).toHaveLength(0);
  });

  it('starts no more than 3 effects in any second, and again once the window has passed', () => {
    const { rerender } = render(<Effects request={null} />);
    for (let k = 1; k <= 10; k++) {
      rerender(<Effects request={req(k, 'rep')} />);
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    expect(screen.getAllByTestId('effect')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    rerender(<Effects request={req(99, 'rep')} />);
    expect(screen.getAllByTestId('effect').length).toBeGreaterThanOrEqual(1);
  });

  it('ignores a repeated key', () => {
    const { rerender } = render(<Effects request={req(1)} />);
    rerender(<Effects request={req(1)} />);
    expect(screen.getAllByTestId('effect')).toHaveLength(1);
  });

  it('is hidden from assistive tech, takes no pointer events and has no focusable content', () => {
    render(<Effects request={req(1, 'streak', 'Streak: 3 weeks')} />);
    const root = screen.getByTestId('effects');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.style.pointerEvents).toBe('none');
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
    expect(root.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('under reduced motion: no movement classes and no particles, and the text badge remains', () => {
    stubMotion(true);
    render(<Effects request={req(5, 'milestone', 'Rep 5!')} />);
    const effect = screen.getByTestId('effect');
    expect(effect.className).toMatch(/still/);
    expect(effect.className).not.toMatch(/moving/);
    expect(effect.querySelectorAll('svg')).toHaveLength(0);
    expect(effect.textContent).toBe('Rep 5!');
    act(() => {
      vi.advanceTimersByTime(EFFECT_LIFE_MS + 1);
    });
    expect(screen.queryAllByTestId('effect')).toHaveLength(0);
  });

  it('with motion on, the effect has movement classes and particles', () => {
    render(<Effects request={req(5, 'milestone', 'Rep 5!')} />);
    const effect = screen.getByTestId('effect');
    expect(effect.className).toMatch(/moving/);
    expect(effect.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('clears its timers on unmount', () => {
    const { unmount } = render(<Effects request={req(1)} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('effect triggers', () => {
  it('reps celebrate, and every 5th and the final rep are milestones', () => {
    expect(repEffect(1, 10).kind).toBe('rep');
    expect(repEffect(5, 10)).toEqual({ kind: 'milestone', text: 'Rep 5!' });
    expect(repEffect(8, 8).kind).toBe('milestone');
    expect(repEffect(3).kind).toBe('rep');
  });

  it('a set with at least 80% clean reps celebrates', () => {
    expect(setEffect({ reps: 10, cleanPct: 80 })?.kind).toBe('clean-set');
    expect(setEffect({ reps: 10, cleanPct: 79 })).toBeNull();
    expect(setEffect({ reps: 0, cleanPct: 0 })).toBeNull();
  });

  it('a streak increase has a text form', () => {
    expect(streakEffect(3)).toEqual({ kind: 'streak', text: 'Streak: 3 weeks' });
    expect(streakEffect(1).text).toBe('Streak: 1 week');
  });
});
