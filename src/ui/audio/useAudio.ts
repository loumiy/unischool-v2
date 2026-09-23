import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameState } from '../../sim/index.ts';
import { ambienceFor, cuesFor, entriesSince, lastSeq, themeFor } from './director.ts';
import { audio } from './engine.ts';
import type { AudioSettings } from './settings.ts';

// The glue between the snapshot and the speaker. The engine starts on the
// first gesture anywhere on the page; after that every new snapshot sets
// the theme and the ambience, and the journal's new entries cue their
// effects. A loaded save or a new run is heard from where it stands, not
// replayed from its first week.

// More than this many new entries at once is a load, not a week.
const CATCH_UP = 60;

export function useAudioDirector(state: GameState | null): void {
  const heard = useRef<number | null>(null);

  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    audio.setTheme(themeFor(state));
    audio.setAmbience(ambienceFor(state));
    if (!state) return;
    const seq = lastSeq(state);
    const from = heard.current;
    heard.current = seq;
    if (from === null || seq < from || seq - from > CATCH_UP) return;
    for (const id of cuesFor(entriesSince(state, from))) audio.play(id);
  }, [state]);
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(audio.subscribe, audio.getSettings);
}
