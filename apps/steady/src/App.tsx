import { useEffect, useMemo, useRef, useState } from 'react';
import { getAcknowledged, setAcknowledged, useVoicePref } from './data/prefs';
import { createSpeechService, type SpeechService } from './services/speech';
import { initialSession } from './session/machine';
import { useSession } from './session/useSession';
import { TEST_BY_ID } from './tests';
import styles from './App.module.css';
import { About } from './ui/About';
import { Home } from './ui/Home';
import { Setup } from './ui/Setup';
import { useHeadingFocus } from './ui/useHeadingFocus';

/** Small skeleton mark: skull, spine and ribs. Decorative. */
function SkeletonMark() {
  return (
    <svg
      className={styles.mark}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="6" r="4" />
      <path d="M16 10v18" />
      <path d="M10 15q6 3 12 0M10 20q6 3 12 0M11 25q5 2 10 0" />
    </svg>
  );
}

/** Placeholder for screens that arrive in a later task. */
function Pending({ title, onBack }: { title: string; onBack: () => void }) {
  const heading = useHeadingFocus();
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      <p>This screen is not available yet.</p>
      <button type="button" className="btn" onClick={onBack}>
        Back to tests
      </button>
    </>
  );
}

interface AppProps {
  /** Injectable so tests can pass a fake. Defaults to the browser speech API. */
  speech?: SpeechService;
}

export function App({ speech: injected }: AppProps = {}) {
  const speech = useMemo(() => injected ?? createSpeechService(), [injected]);
  const [voice, setVoice] = useVoicePref();
  const [start] = useState(() => ({ ...initialSession, screen: getAcknowledged() ? ('home' as const) : ('about' as const) }));
  const session = useSession(start);
  const { state, snapshot, outcome, prompt } = session;
  const voiceOn = useRef(voice);
  voiceOn.current = voice;

  // Speak each new prompt and each countdown number, one at a time (R14.1, R14.2).
  useEffect(() => {
    if (prompt && state.screen === 'running' && voiceOn.current) speech.speak(prompt);
  }, [prompt, state.screen, speech]);
  const countdown = snapshot?.countdown ?? null;
  useEffect(() => {
    if (countdown !== null && state.screen === 'countdown' && voiceOn.current) speech.speak(String(countdown));
  }, [countdown, state.screen, speech]);
  // Leaving the run, or turning the voice off, stops speech (R14.3).
  const inRun = state.screen === 'countdown' || state.screen === 'running';
  useEffect(() => {
    if (!inRun || !voice) speech.cancel();
  }, [inRun, voice, speech]);
  useEffect(() => () => speech.cancel(), [speech]);

  const voiceProps = { available: speech.available, on: voice, set: setVoice };
  const test = state.testId ? TEST_BY_ID[state.testId] : null;

  let screen;
  switch (state.screen) {
    case 'about':
      screen = (
        <About
          onAcknowledge={() => {
            setAcknowledged(true);
            session.back();
          }}
        />
      );
      break;
    case 'setup':
      screen = test && (
        <Setup
          test={test}
          mode={state.mode}
          safetyConfirmed={state.safetyConfirmed}
          error={state.error}
          voice={voiceProps}
          onConfirm={session.confirmSafety}
          onStart={session.start}
          onBack={session.back}
          onUseDemo={session.useDemo}
          onSourceError={session.reportError}
        />
      );
      break;
    case 'countdown':
      screen = <Pending title="Get ready" onBack={session.stop} />;
      break;
    case 'running':
      screen = <Pending title="Running" onBack={session.stop} />;
      break;
    case 'result':
      screen = <Pending title="Your result" onBack={session.back} />;
      break;
    case 'history':
      screen = <Pending title="History" onBack={session.back} />;
      break;
    case 'report':
      screen = <Pending title="Progress report" onBack={session.back} />;
      break;
    default:
      screen = (
        <Home
          mode={state.mode}
          onMode={session.setMode}
          onChoose={(id) => session.chooseTest(id)}
          onHistory={() => session.goto('history')}
          voice={voiceProps}
        />
      );
  }

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <SkeletonMark />
        <p className={styles.brand}>Steady</p>
      </header>
      <main id="content" className={styles.main}>
        {screen}
      </main>
      <footer className={styles.footer}>
        <p>
          Steady is not a medical device and does not give medical advice or a diagnosis. Talk to your physical
          therapist or doctor about your results.
        </p>
        <p>
          Everything runs on your device. No video is uploaded and no landmarks leave your browser. Results are
          saved only in this browser.
        </p>
        {!inRun && state.screen !== 'about' && (
          <button type="button" className="btn" onClick={() => session.goto('about')}>
            About Steady
          </button>
        )}
      </footer>
    </div>
  );
}
