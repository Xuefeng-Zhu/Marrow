import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createSound, type Sound } from '../audio/sound';
import { createVoice, type Voice } from '../audio/voice';
import { DEFAULT_SETTINGS, type Settings } from '../storage/codec';
import type { Store } from '../storage/store';

export interface SettingsApi {
  settings: Settings;
  voice: Voice;
  sound: Sound;
  setVoice(on: boolean): void;
  /** Turning sound on creates the `AudioContext`, so call it from the click handler itself. */
  setSound(on: boolean): void;
  setShowVideo(on: boolean): void;
  /** Back to the defaults without writing them (the stored settings were just deleted). */
  reset(): void;
}

const INERT_VOICE: Voice = { supported: false, speak: () => undefined, cancel: () => undefined };
const INERT_SOUND: Sound = { supported: false, active: false, unlock: () => false, rattle: () => undefined, close: () => undefined };

const SettingsContext = createContext<SettingsApi>({
  settings: DEFAULT_SETTINGS,
  voice: INERT_VOICE,
  sound: INERT_SOUND,
  setVoice: () => undefined,
  setSound: () => undefined,
  setShowVideo: () => undefined,
  reset: () => undefined,
});

export function useSettings(): SettingsApi {
  return useContext(SettingsContext);
}

export interface SettingsProviderProps {
  store: Pick<Store, 'loadSettings' | 'saveSettings'>;
  /** Replaces the browser engines (tests). */
  engines?: { voice: Voice; sound: Sound };
  children: ReactNode;
}

/** Holds voice, sound and show-video choices. Defaults are off and muted, and saved choices are restored (R7.8). */
export function SettingsProvider({ store, engines, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const current = useRef(settings);
  current.current = settings;
  const [voice] = useState<Voice>(() => engines?.voice ?? createVoice());
  const [sound] = useState<Sound>(() => engines?.sound ?? createSound({ lazy: () => current.current.sound }));
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    store.loadSettings().then(
      (loaded) => {
        // A choice made before the load finished wins over the stored one.
        if (alive && !touched.current) setSettings(loaded);
      },
      () => undefined, // unreadable: stay on the muted defaults
    );
    return () => {
      alive = false;
    };
  }, [store]);

  useEffect(() => () => sound.close(), [sound]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      touched.current = true;
      const next = { ...current.current, ...patch };
      current.current = next;
      setSettings(next);
      void store.saveSettings(next).catch(() => undefined);
    },
    [store],
  );

  const api = useMemo<SettingsApi>(
    () => ({
      settings,
      voice,
      sound,
      setVoice: (on) => {
        if (on && !voice.supported) return;
        if (!on) voice.cancel();
        update({ voice: on });
      },
      setSound: (on) => {
        if (on && !sound.unlock()) return;
        update({ sound: on });
      },
      setShowVideo: (on) => update({ showVideo: on }),
      reset: () => {
        touched.current = true;
        voice.cancel();
        sound.close();
        current.current = DEFAULT_SETTINGS;
        setSettings(DEFAULT_SETTINGS);
      },
    }),
    [settings, voice, sound, update],
  );

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}
