import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialSession, reduce, type SessionAction, type SessionState } from './machine';

function run(actions: SessionAction[], from: SessionState = initialSession): SessionState {
  return actions.reduce(reduce, from);
}

const toSetup: SessionAction[] = [{ type: 'choose-test', testId: 'chair-stand' }];

describe('session machine (R3.3)', () => {
  it('cannot start before the safety confirmation', () => {
    const s = run([...toSetup, { type: 'start' }]);
    expect(s.screen).toBe('setup');
  });

  it('starts after the confirmation and reaches running only through the countdown', () => {
    const a = run([...toSetup, { type: 'confirm-safety', confirmed: true }, { type: 'start' }]);
    expect(a.screen).toBe('countdown');
    expect(run([{ type: 'countdown-done' }], a).screen).toBe('running');
    expect(run([{ type: 'countdown-done' }]).screen).toBe('home');
    expect(run([...toSetup, { type: 'countdown-done' }]).screen).toBe('setup');
  });

  it('un-confirming the notice disables Start again', () => {
    const s = run([...toSetup, { type: 'confirm-safety', confirmed: true }, { type: 'confirm-safety', confirmed: false }, { type: 'start' }]);
    expect(s.screen).toBe('setup');
  });

  it('a run ends in the result screen only from running', () => {
    expect(run([...toSetup, { type: 'run-ended' }]).screen).toBe('setup');
    const running = run([...toSetup, { type: 'confirm-safety', confirmed: true }, { type: 'start' }, { type: 'countdown-done' }]);
    expect(run([{ type: 'run-ended' }], running).screen).toBe('result');
  });

  it('a camera error returns to setup with the typed code and clears the confirmation (R3.5)', () => {
    const running = run([{ type: 'choose-test', testId: 'chair-stand', mode: 'camera' }, { type: 'confirm-safety', confirmed: true }, { type: 'start' }]);
    const s = reduce(running, { type: 'source-error', code: 'camera-denied' });
    expect(s).toMatchObject({ screen: 'setup', error: 'camera-denied', safetyConfirmed: false, mode: 'camera' });
    expect(reduce(s, { type: 'use-demo' })).toMatchObject({ mode: 'demo', error: null });
  });

  it('Back from setup returns home (R3.6)', () => {
    expect(run([...toSetup, { type: 'back' }]).screen).toBe('home');
  });

  it('property: running is only ever entered from countdown, and countdown only from a confirmed setup', () => {
    const action = fc.constantFrom<SessionAction>(
      { type: 'choose-test', testId: 'chair-stand' },
      { type: 'confirm-safety', confirmed: true },
      { type: 'confirm-safety', confirmed: false },
      { type: 'start' },
      { type: 'countdown-done' },
      { type: 'run-ended' },
      { type: 'source-error', code: 'camera-denied' },
      { type: 'use-demo' },
      { type: 'back' },
      { type: 'try-again' },
      { type: 'goto', screen: 'history' },
      { type: 'goto', screen: 'home' },
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        let s = initialSession;
        for (const a of actions) {
          const next = reduce(s, a);
          if (next.screen === 'running' && s.screen !== 'running') expect(s.screen).toBe('countdown');
          if (next.screen === 'countdown' && s.screen !== 'countdown') {
            expect(s.screen).toBe('setup');
            expect(s.safetyConfirmed).toBe(true);
          }
          s = next;
        }
      }),
    );
  });
});
