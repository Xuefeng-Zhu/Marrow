import styles from './App.module.css';

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

export function App() {
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
        <h1>Choose a test</h1>
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
      </footer>
    </div>
  );
}
