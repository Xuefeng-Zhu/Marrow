import { useHeadingFocus, usePrefersReducedMotion } from './useHeadingFocus';
import styles from './ui.module.css';

interface Props {
  /** Number shown, 5 to 1. */
  n: number;
  onCancel: () => void;
}

/** One large number per second. With reduced motion the numbers swap with no animation (R15.7). */
export function Countdown({ n, onCancel }: Props) {
  const heading = useHeadingFocus();
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Get ready
      </h1>
      <p role="status" aria-live="polite" aria-atomic="true" className={styles.count}>
        <span key={n} className={reduced ? undefined : styles.pulse} data-testid="countdown-number">
          {n}
        </span>
      </p>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </>
  );
}
