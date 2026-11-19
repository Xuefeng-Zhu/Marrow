import type { TestId } from '../tests';

export type Screen = 'home' | 'about' | 'history' | 'report' | 'setup' | 'countdown' | 'running' | 'result';
export type SourceMode = 'camera' | 'demo';

export interface SessionState {
  screen: Screen;
  testId: TestId | null;
  mode: SourceMode;
  /** The user confirmed the safety notice for the current setup (R3.3). */
  safetyConfirmed: boolean;
  /** Typed camera error code shown on the setup screen, with the demo offered (R3.5). */
  error: string | null;
}

export type SessionAction =
  | { type: 'goto'; screen: 'home' | 'about' | 'history' | 'report' }
  | { type: 'choose-test'; testId: TestId; mode?: SourceMode }
  | { type: 'set-mode'; mode: SourceMode }
  | { type: 'confirm-safety'; confirmed: boolean }
  | { type: 'start' }
  | { type: 'countdown-done' }
  | { type: 'run-ended' }
  | { type: 'source-error'; code: string }
  | { type: 'use-demo' }
  | { type: 'back' }
  | { type: 'try-again' };

export const initialSession: SessionState = {
  screen: 'home',
  testId: null,
  mode: 'demo',
  safetyConfirmed: false,
  error: null,
};

/**
 * Pure reducer for the screens and run states. `running` is reachable only from `countdown`, and
 * `countdown` only from `setup` with the safety notice confirmed (R3.3). Actions that do not apply
 * to the current screen leave the state unchanged.
 */
export function reduce(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'goto':
      if (s.screen === 'countdown' || s.screen === 'running') return s;
      return { ...s, screen: a.screen, safetyConfirmed: false, error: null };
    case 'choose-test':
      if (s.screen !== 'home') return s;
      return { ...s, screen: 'setup', testId: a.testId, mode: a.mode ?? s.mode, safetyConfirmed: false, error: null };
    case 'set-mode':
      if (s.screen !== 'home' && s.screen !== 'setup') return s;
      return { ...s, mode: a.mode, error: null };
    case 'confirm-safety':
      if (s.screen !== 'setup') return s;
      return { ...s, safetyConfirmed: a.confirmed };
    case 'start':
      if (s.screen !== 'setup' || !s.safetyConfirmed || s.testId === null) return s;
      return { ...s, screen: 'countdown', error: null };
    case 'countdown-done':
      return s.screen === 'countdown' ? { ...s, screen: 'running' } : s;
    case 'run-ended':
      return s.screen === 'running' ? { ...s, screen: 'result' } : s;
    case 'source-error':
      if (s.screen !== 'setup' && s.screen !== 'countdown' && s.screen !== 'running') return s;
      return { ...s, screen: 'setup', safetyConfirmed: false, error: a.code };
    case 'use-demo':
      if (s.screen !== 'setup') return s;
      return { ...s, mode: 'demo', error: null };
    case 'back':
      if (s.screen === 'setup') return { ...s, screen: 'home', testId: null, safetyConfirmed: false, error: null };
      if (s.screen === 'countdown') return { ...s, screen: 'setup', safetyConfirmed: false };
      if (s.screen === 'result') return { ...s, screen: 'home', testId: null, safetyConfirmed: false };
      if (s.screen === 'about' || s.screen === 'history' || s.screen === 'report') return { ...s, screen: 'home' };
      return s;
    case 'try-again':
      return s.screen === 'result' ? { ...s, screen: 'setup', safetyConfirmed: false } : s;
  }
}
