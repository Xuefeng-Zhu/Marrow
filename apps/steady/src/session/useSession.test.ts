import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './useSession';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useSession stop during the countdown', () => {
  it('returns to setup so the run can be started again', () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.chooseTest('chair-stand', 'demo'));
    act(() => result.current.confirmSafety(true));
    act(() => result.current.start());
    expect(result.current.state.screen).toBe('countdown');
    act(() => result.current.stop());
    expect(result.current.state.screen).toBe('setup');
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.state.screen).toBe('setup');
    act(() => result.current.confirmSafety(true));
    act(() => result.current.start());
    expect(result.current.state.screen).toBe('countdown');
    act(() => result.current.stop());
  });
});
