import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { RunOutcome } from '../logic/result';
import { TEST_BY_ID, type TestId } from '../tests';
import { createRunController, type RunController, type RunSnapshot } from './controller';
import { initialSession, reduce, type SourceMode } from './machine';

const CLOCK_MS = 250;

/** React wiring for the session machine and the run controller. */
export function useSession(initial = initialSession) {
  const [state, dispatch] = useReducer(reduce, initial);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [prompt, setPrompt] = useState('');
  const controller = useRef<RunController | null>(null);

  const stopController = useCallback(() => {
    controller.current?.stop();
    controller.current = null;
  }, []);

  const start = useCallback(() => {
    if (state.screen !== 'setup' || !state.safetyConfirmed || state.testId === null) return;
    stopController();
    setOutcome(null);
    setPrompt('');
    dispatch({ type: 'start' });
    const c = createRunController({
      test: TEST_BY_ID[state.testId],
      mode: state.mode,
      onUpdate: setSnapshot,
      onPrompt: setPrompt,
      onCountdown: (n) => {
        if (n === 5) setSnapshot(null);
      },
      onSourceError: (e) => dispatch({ type: 'source-error', code: e.code }),
      onEnd: (o) => {
        setOutcome(o);
        dispatch({ type: 'run-ended' });
      },
    });
    controller.current = c;
    c.start();
  }, [state.screen, state.safetyConfirmed, state.testId, state.mode, stopController]);

  // The controller reports the end of the countdown through its snapshot phase.
  useEffect(() => {
    if (snapshot?.phase === 'running' && state.screen === 'countdown') dispatch({ type: 'countdown-done' });
  }, [snapshot?.phase, state.screen]);

  // Keeps the on-screen clock moving between frames.
  useEffect(() => {
    if (state.screen !== 'running') return;
    const id = setInterval(() => {
      if (controller.current) setSnapshot(controller.current.snapshot());
    }, CLOCK_MS);
    return () => clearInterval(id);
  }, [state.screen]);

  // Leaving the screens releases the source (R4.7).
  useEffect(() => stopController, [stopController]);

  return {
    state,
    snapshot,
    outcome,
    prompt,
    chooseTest: (testId: TestId, mode?: SourceMode) => dispatch({ type: 'choose-test', testId, ...(mode ? { mode } : {}) }),
    setMode: (mode: SourceMode) => dispatch({ type: 'set-mode', mode }),
    confirmSafety: (confirmed: boolean) => dispatch({ type: 'confirm-safety', confirmed }),
    useDemo: () => dispatch({ type: 'use-demo' }),
    start,
    stop: () => {
      // Stop during the countdown cancels the run without onEnd, so leave the countdown screen here.
      const cancelled = controller.current?.snapshot().phase === 'countdown';
      stopController();
      if (cancelled) dispatch({ type: 'back' });
    },
    done: () => controller.current?.done(),
    back: () => {
      stopController();
      dispatch({ type: 'back' });
    },
    tryAgain: () => dispatch({ type: 'try-again' }),
    goto: (screen: 'home' | 'about' | 'history' | 'report') => dispatch({ type: 'goto', screen }),
  };
}
