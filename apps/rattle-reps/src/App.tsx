import { useReducer } from 'react';
import { INITIAL_SCREEN, screenReducer } from './session/screenReducer';
import { Layout } from './ui/Layout';
import { Mode } from './ui/Mode';
import { Picker } from './ui/Picker';

export function App() {
  const [screen, dispatch] = useReducer(screenReducer, INITIAL_SCREEN);

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
    default:
      // The remaining screens arrive in later tasks.
      return (
        <Layout title="Coming soon">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'home' })}>
            Home
          </button>
        </Layout>
      );
  }
}
