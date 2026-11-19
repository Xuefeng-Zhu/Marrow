import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAcknowledged,
  getAgeBand,
  getVoice,
  setAcknowledged,
  setAgeBand,
  setVoice,
  useVoicePref,
} from './prefs';

beforeEach(() => localStorage.clear());

describe('prefs', () => {
  it('voice defaults to on and is saved', () => {
    expect(getVoice()).toBe(true);
    setVoice(false);
    expect(getVoice()).toBe(false);
    expect(localStorage.getItem('steady:voice')).toBe('off');
    setVoice(true);
    expect(getVoice()).toBe(true);
  });

  it('age band is optional and validated', () => {
    expect(getAgeBand()).toBeNull();
    setAgeBand('70-74');
    expect(getAgeBand()).toBe('70-74');
    localStorage.setItem('steady:ageBand', 'ancient');
    expect(getAgeBand()).toBeNull();
    setAgeBand(null);
    expect(localStorage.getItem('steady:ageBand')).toBeNull();
  });

  it('acknowledgement is saved', () => {
    expect(getAcknowledged()).toBe(false);
    setAcknowledged(true);
    expect(getAcknowledged()).toBe(true);
    setAcknowledged(false);
    expect(getAcknowledged()).toBe(false);
  });
});

describe('useVoicePref', () => {
  it('reads and saves the choice', () => {
    const { result } = renderHook(() => useVoicePref());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('steady:voice')).toBe('off');
    const again = renderHook(() => useVoicePref());
    expect(again.result.current[0]).toBe(false);
  });
});
