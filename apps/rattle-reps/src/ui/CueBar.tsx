import { useEffect, useState } from 'react';
import type { ActiveCue } from '../session/cues';
import styles from './CueBar.module.css';

export interface CueBarProps {
  cue: ActiveCue | null;
  poseLost: boolean;
  status: 'starting' | 'running' | 'paused' | 'ended' | 'error';
  /** Wall clock in ms, the same one that stamped the cue. */
  now?: () => number;
}

const defaultNow = () => performance.now();

export const POSE_LOST_TEXT = 'Step back so I can see you';

/**
 * Two live regions: warnings are assertive and carry an icon and a text label, so they never rely on
 * color alone (R6.3). Phase and other cues are polite (R6.5). Only one warning shows at a time.
 */
export function CueBar({ cue, poseLost, status, now = defaultNow }: CueBarProps) {
  const [, setTick] = useState(0);
  const expiresAt = cue?.expiresAt ?? null;
  useEffect(() => {
    if (expiresAt === null) return;
    const wait = expiresAt - now();
    if (wait <= 0) return; // already expired: nothing to schedule
    const id = setTimeout(() => setTick((n) => n + 1), wait + 1);
    return () => clearTimeout(id);
  }, [expiresAt, now]);

  const live = cue && (cue.expiresAt === null || now() < cue.expiresAt) ? cue : null;
  const warning = live && live.cue.kind === 'warning' ? live.cue : null;
  const other = live && live.cue.kind !== 'warning' && live.cue.kind !== 'rep' ? live.cue : null;
  const polite = poseLost
    ? POSE_LOST_TEXT
    : status === 'starting'
      ? 'Waking the skeleton...'
      : status === 'paused'
        ? 'Paused'
        : (other?.text ?? '');

  return (
    <div className={styles.bar}>
      <div aria-live="assertive" className={styles.warnRegion}>
        {warning && (
          <p className={styles.warning} data-testid="warning-cue">
            <span aria-hidden="true" className={styles.icon}>
              &#9888;
            </span>
            <span>
              <strong>Form check:</strong> {warning.text}
            </span>
          </p>
        )}
      </div>
      <div aria-live="polite" className={styles.polite} data-testid="polite-cue">
        {polite}
      </div>
    </div>
  );
}
