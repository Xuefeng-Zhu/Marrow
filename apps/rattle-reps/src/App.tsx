import { lazy, Suspense, useReducer, useState } from 'react';
import { getWorkout } from './movements/registry';
import { currentMovementId, INITIAL_SCREEN, screenReducer, type Run } from './session/screenReducer';
import { Layout } from './ui/Layout';
import { Mode } from './ui/Mode';
import { Picker } from './ui/Picker';

/** The live session pulls in the pipeline, so it is its own chunk (R21.4). */
const Session = lazy(() => import('./ui/Session'));

function stepIndex(run: Run): number {
  return run.seq && run.seq.phase !== 'done' ? run.seq.index : 0;
}

export function App() {
  const [screen, dispatch] = useReducer(screenReducer, INITIAL_SCREEN);
  /** After a camera failure the same run continues with the demo clip. */
  const [demoFallback, setDemoFallback] = useState(false);

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
            onEnd={(result) => {
              setDemoFallback(false);
              dispatch({ type: 'setEnded', summary: result.summary });
            }}
            onHome={() => {
              setDemoFallback(false);
              dispatch({ type: 'home' });
            }}
            onUseDemo={() => setDemoFallback(true)}
          />
        </Suspense>
      );
    }
    default:
      // The remaining screens arrive in later tasks.
      return (
        <Layout title="Coming soon">
          {homeButton}
        </Layout>
      );
  }
}
