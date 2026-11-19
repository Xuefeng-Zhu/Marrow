import { useEffect, useMemo, useRef, useState } from 'react';
import { buildResult } from './logic/result';
import { getAcknowledged, getAgeBand, setAcknowledged, useVoicePref } from './data/prefs';
import { createSpeechService, type SpeechService } from './services/speech';
import { initialSession } from './session/machine';
import { useSession } from './session/useSession';
import { TEST_BY_ID } from './tests';
import styles from './App.module.css';
import { About } from './ui/About';
import { Countdown } from './ui/Countdown';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Report } from './ui/Report';
import { ResultCard } from './ui/ResultCard';
import { Run } from './ui/Run';
import { Setup } from './ui/Setup';

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
      screen = <Countdown n={countdown ?? 5} onCancel={session.stop} />;
      break;
    case 'running':
      screen = test && (
        <Run
          test={test}
          snapshot={snapshot}
          prompt={prompt}
          frameRef={session.frameRef}
          voice={voiceProps}
          onStop={session.stop}
          onDone={session.done}
        />
      );
      break;
    case 'result':
      screen = outcome && (
        <ResultCard
          model={buildResult({ ...outcome, ageBand: getAgeBand() })}
          onTryAgain={session.tryAgain}
          onBack={session.back}
        />
      );
      break;
    case 'history':
      screen = <History onBack={session.back} onReport={() => session.goto('report')} />;
      break;
    case 'report':
      screen = <Report onBack={session.back} />;
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
      <a className={`${styles.skip} no-print`} href="#content">
        Skip to main content
      </a>
      <header className={`${styles.header} no-print`}>
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
