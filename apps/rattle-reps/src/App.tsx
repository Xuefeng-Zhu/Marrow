import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getCircuit } from './circuits/presets';
import type { CreateSourceOptions, SessionSource } from './session/sourceFactory';
import { computeStreak } from './streak/streak';
import { History } from './ui/History';
import { localDayKey, recordSet } from './session/recordSet';
import type { SessionResult } from './session/sessionController';
import { CircuitSummary } from './ui/CircuitSummary';
import { Summary } from './ui/Summary';
import { getWorkout } from './movements/registry';
import { currentMovementId, INITIAL_SCREEN, screenReducer, type Run } from './session/screenReducer';
import { createRattleStore, type Store } from './storage/store';
import { Layout } from './ui/Layout';
import { Mode } from './ui/Mode';
import { Picker } from './ui/Picker';
import { SettingsProvider } from './ui/Settings';

/** The live session pulls in the pipeline, so it is its own chunk (R21.4). */
const Session = lazy(() => import('./ui/Session'));

function stepIndex(run: Run): number {
  return run.seq && run.seq.phase !== 'done' ? run.seq.index : 0;
}

export interface AppProps {
  /** Replaces the browser storage (tests). */
  store?: Store;
  /** Replaces the real pose source (tests). */
  createSource?: (o: CreateSourceOptions) => Promise<SessionSource>;
}

export function App({ store, createSource }: AppProps = {}) {
  const [own] = useState<Store>(() => store ?? createRattleStore());
  return (
    <SettingsProvider store={own}>
      <Screens store={own} createSource={createSource} />
    </SettingsProvider>
  );
}

function Screens({
  store,
  createSource,
}: {
  store: Store;
  createSource?: AppProps['createSource'];
}) {
  const [screen, dispatch] = useReducer(screenReducer, INITIAL_SCREEN);
  /** After a camera failure the same run continues with the demo clip. */
  const [demoFallback, setDemoFallback] = useState(false);

  const streakWeeks = useRef(0);
  const nextId = useRef(0);
  /** Mode of the set that just ended, which can differ from the run after a camera failure. */
  const lastMode = useRef<'camera' | 'demo'>('demo');

  const onEnd = useCallback(
    async (result: SessionResult, run: Run, mode: 'camera' | 'demo') => {
      setDemoFallback(false);
      lastMode.current = mode;
      const { summary, startT, stopT } = result;
      const startedAt = Date.now() - Math.max(0, stopT - startT);
      const id = `${startedAt}-${nextId.current++}`;
      const recorded = await recordSet(
        store,
        {
          summary,
          mode,
          circuitId: run.choice.kind === 'circuit' ? run.choice.id : undefined,
          startedAt,
          offsetMinutes: -new Date(startedAt).getTimezoneOffset(),
        },
        id,
      );
      streakWeeks.current = recorded.streakWeeks;
      dispatch({ type: 'setEnded', summary, saved: recorded.saved, streakGain: recorded.streakGain });
    },
    [store],
  );

  const [streakBadge, setStreakBadge] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (screen.name !== 'picker') return;
    let alive = true;
    store.loadHistory().then(
      (list) => {
        if (!alive) return;
        const { current } = computeStreak(list, localDayKey(Date.now()));
        setStreakBadge(current > 0 ? `Weekly streak: ${current} ${current === 1 ? 'week' : 'weeks'}` : undefined);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [screen.name, store]);

  const homeButton = (
    <button type="button" className="btn" onClick={() => dispatch({ type: 'home' })}>
      Home
    </button>
  );

  switch (screen.name) {
    case 'picker':
      return (
        <Picker
          onPickWorkout={(id) => dispatch({ type: 'pickWorkout', id })}
          onPickCircuit={(id) => dispatch({ type: 'pickCircuit', id })}
          onOpenHistory={() => dispatch({ type: 'openHistory' })}
          streakBadge={streakBadge}
        />
      );
    case 'mode':
      return (
        <Mode
          choice={screen.choice}
          onChoose={(mode) => dispatch({ type: 'chooseMode', mode })}
          onBack={() => dispatch({ type: 'back' })}
        />
      );
    case 'session': {
      const { run } = screen;
      const workout = getWorkout(currentMovementId(run) ?? '');
      if (!workout) return <Layout title="Something went wrong">{homeButton}</Layout>;
      const mode = demoFallback ? 'demo' : run.mode;
      return (
        <Suspense fallback={<Layout title="Loading">{null}</Layout>}>
          <Session
            key={`${workout.id}-${mode}-${stepIndex(run)}`}
            workout={workout}
            mode={mode}
            target={run.target}
            onEnd={(result) => void onEnd(result, run, mode)}
            onSkipStep={
              run.choice.kind === 'circuit'
                ? () => {
                    setDemoFallback(false);
                    dispatch({ type: 'skipStep' });
                  }
                : undefined
            }
            onHome={() => {
              setDemoFallback(false);
              dispatch({ type: 'home' });
            }}
            createSource={createSource}
            onUseDemo={() => setDemoFallback(true)}
          />
        </Suspense>
      );
    }
    case 'summary': {
      const { run, summary } = screen;
      const circuit = run.choice.kind === 'circuit' ? getCircuit(run.choice.id) : undefined;
      const seq = run.seq;
      const nextStep = seq && seq.phase === 'rest' ? circuit?.steps[seq.index + 1] : undefined;
      const rest =
        seq && seq.phase === 'rest' && circuit && nextStep
          ? {
              restSec: circuit.steps[seq.index]?.restSec ?? 0,
              nextName: getWorkout(nextStep.movementId)?.name ?? nextStep.movementId,
              onSkip: () => dispatch({ type: 'next' }),
              onDone: () => dispatch({ type: 'next' }),
            }
          : undefined;
      return (
        <Summary
          summary={summary}
          mode={lastMode.current}
          saved={screen.saved}
          streakGain={screen.streakGain}
          streakWeeks={streakWeeks.current}
          persistent={store.persistent}
          inCircuit={run.choice.kind === 'circuit'}
          rest={rest}
          circuitDone={seq?.phase === 'done'}
          onAgain={() => dispatch({ type: 'again' })}
          onNext={() => dispatch({ type: 'next' })}
          onHome={() => dispatch({ type: 'home' })}
        />
      );
    }
    case 'circuitSummary':
      return (
        <CircuitSummary
          circuitId={screen.run.choice.id}
          results={screen.run.seq?.results ?? []}
          onHome={() => dispatch({ type: 'home' })}
        />
      );
    case 'history':
      return (
        <History
          store={store}
          today={localDayKey(Date.now())}
          onStart={() => dispatch({ type: 'back' })}
          onBack={() => dispatch({ type: 'back' })}
        />
      );
  }
}
