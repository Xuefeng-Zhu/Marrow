import { useSettings } from './Settings';
import styles from './Toggles.module.css';

/** Voice and sound switches. Both are real buttons with `aria-pressed`, off by default (R7.1, R7.4, R19.7). */
export function Toggles() {
  const { settings, voice, sound, setVoice, setSound } = useSettings();
  return (
    <div className={styles.toggles}>
      <div className={styles.item}>
        <button
          type="button"
          className="btn"
          aria-pressed={settings.voice && voice.supported}
          disabled={!voice.supported}
          aria-describedby={voice.supported ? undefined : 'voice-reason'}
          onClick={() => setVoice(!settings.voice)}
        >
          Voice cues
          <span aria-hidden="true" className={styles.state}>
            {settings.voice && voice.supported ? 'On' : 'Off'}
          </span>
        </button>
        {!voice.supported && (
          <p id="voice-reason" className={styles.reason}>
            Voice is not available in this browser.
          </p>
        )}
      </div>
      <div className={styles.item}>
        <button
          type="button"
          className="btn"
          aria-pressed={settings.sound && sound.supported}
          disabled={!sound.supported}
          aria-describedby={sound.supported ? undefined : 'sound-reason'}
          onClick={() => setSound(!settings.sound)}
        >
          Bone rattle sound
          <span aria-hidden="true" className={styles.state}>
            {settings.sound && sound.supported ? 'On' : 'Muted'}
          </span>
        </button>
        {!sound.supported && (
          <p id="sound-reason" className={styles.reason}>
            Sound is not available in this browser.
          </p>
        )}
      </div>
    </div>
  );
}
