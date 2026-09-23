import { useEffect, useRef, useState } from 'react';
import { SFX, THEMES, type ThemeId } from '../../content/audio.ts';
import { audio } from './engine.ts';

// THE LISTENING BENCH (Phase 50), in the debug panel: the mix has never been
// heard by a person, and this is where a person hears it. Solo and loop
// each theme, solo a layer (music, ambience, effects), fire each effect,
// set the season's ambience by hand, and take the scripted tour — the four
// themes and the seasons in turn — so a listener can set the levels in
// content/audio.json and flag anything harsh, repetitive or wrong.

const LAYERS = ['music', 'ambience', 'sfx'] as const;
const SEASONS = [
  { label: 'Summer', a: { crowd: 0.4, wind: 0, birds: 0.8, roar: false } },
  { label: 'Term', a: { crowd: 1, wind: 0.1, birds: 0.3, roar: false } },
  { label: 'Winter', a: { crowd: 0.6, wind: 1, birds: 0, roar: false } },
  { label: 'Game day', a: { crowd: 1, wind: 0.2, birds: 0.1, roar: true } },
];
const TOUR_SECONDS = 24;

export default function AudioBench() {
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [touring, setTouring] = useState(false);
  const saved = useRef(audio.getSettings());
  const tour = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (tour.current) clearInterval(tour.current);
    },
    [],
  );

  const play = (id: ThemeId) => {
    audio.unlock();
    audio.setTheme(id);
    setTheme(id);
  };
  const solo = (layer: (typeof LAYERS)[number] | null) => {
    audio.unlock();
    const s = saved.current;
    audio.setSettings({
      music: layer === null || layer === 'music' ? s.music : 0,
      ambience: layer === null || layer === 'ambience' ? s.ambience : 0,
      sfx: layer === null || layer === 'sfx' ? s.sfx : 0,
    });
  };
  const startTour = () => {
    audio.unlock();
    let i = 0;
    const next = () => {
      const t = THEMES[i % THEMES.length]!;
      const season = SEASONS[i % SEASONS.length]!;
      audio.setTheme(t.id);
      audio.setAmbience(season.a);
      setTheme(t.id);
      i += 1;
    };
    next();
    tour.current = setInterval(next, TOUR_SECONDS * 1000);
    setTouring(true);
  };
  const stopTour = () => {
    if (tour.current) clearInterval(tour.current);
    tour.current = null;
    setTouring(false);
  };

  return (
    <section>
      <h3>Listening bench</h3>
      <div className="row">
        {THEMES.map((t) => (
          <button key={t.id} className={theme === t.id ? 'active' : ''} onClick={() => play(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="row">
        {LAYERS.map((l) => (
          <button key={l} onClick={() => solo(l)}>
            solo {l}
          </button>
        ))}
        <button onClick={() => solo(null)}>all layers</button>
      </div>
      <div className="row">
        {SEASONS.map((s) => (
          <button key={s.label} onClick={() => (audio.unlock(), audio.setAmbience(s.a))}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="row">
        {SFX.map((s) => (
          <button key={s.id} onClick={() => (audio.unlock(), audio.play(s.id))}>
            {s.id}
          </button>
        ))}
      </div>
      <div className="row">
        {touring ? (
          <button onClick={stopTour}>stop the tour</button>
        ) : (
          <button onClick={startTour}>tour: themes × seasons, {TOUR_SECONDS}s each</button>
        )}
      </div>
    </section>
  );
}
