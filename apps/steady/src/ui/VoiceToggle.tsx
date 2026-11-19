import styles from './ui.module.css';

interface Props {
  available: boolean;
  on: boolean;
  onChange: (on: boolean) => void;
}

/** "Voice on / off" control. Hidden when speech is not available (R14.1, R14.4). */
export function VoiceToggle({ available, on, onChange }: Props) {
  if (!available) return null;
  return (
    <button type="button" className={`btn ${styles.voice}`} aria-pressed={on} onClick={() => onChange(!on)}>
      Voice prompts: {on ? 'on' : 'off'}
    </button>
  );
}
