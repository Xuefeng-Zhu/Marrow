import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    set(next: boolean) {
      matches = next;
      for (const fn of [...listeners]) fn({ matches: next } as MediaQueryListEvent);
    },
    count: () => listeners.size,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReducedMotion (R18.3)', () => {
  it('follows a change of the media query and unsubscribes on unmount', () => {
    const mm = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => mm.set(true));
    expect(result.current).toBe(true);
    act(() => mm.set(false));
    expect(result.current).toBe(false);
    unmount();
    expect(mm.count()).toBe(0);
  });

  it('starts true when the preference is already set', () => {
    mockMatchMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('is false when matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });
});
