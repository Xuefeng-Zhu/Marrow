import { useHeadingFocus } from './useHeadingFocus';
import styles from './ui.module.css';

interface Props {
  onAcknowledge: () => void;
}

export function About({ onAcknowledge }: Props) {
  const heading = useHeadingFocus();
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        About Steady
      </h1>
      <p className={styles.notice}>Steady is not a medical device. It does not diagnose or treat any condition.</p>
      <p className={styles.notice}>Everything runs on your device. No video or landmarks leave your browser.</p>
      <p>
        Steady guides you through simple range-of-motion and balance checks and keeps your results in this browser, so
        you can show them to your physical therapist. Talk to your physical therapist or doctor about your results.
      </p>
      <button type="button" className="btn btn-primary" onClick={onAcknowledge}>
        I understand
      </button>
    </>
  );
}
