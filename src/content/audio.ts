import raw from './audio.json' with { type: 'json' };
import {
  arr,
  ContentError,
  int,
  num,
  obj,
  oneOf,
  optional,
  str,
  uniqueBy,
  validate,
} from './schema.ts';

// THE SOUND OF THE PLACE (DD §13.4). Everything the ear gets is written
// here as data and synthesised at run time (ui/audio/engine.ts): four
// themes the music switches between on the college's fortunes, the
// effects the journal's entries cue, and the levels of the campus's own
// ambience. No recordings ship; a theme is a key, a tempo, a progression
// of scale degrees and two voices, and an effect is a handful of
// enveloped oscillators or a burst of filtered noise.

export const THEME_IDS = ['founding', 'growth', 'distress', 'ceremonial'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type Wave = (typeof WAVES)[number];

export interface ThemeDef {
  id: ThemeId;
  label: string;
  root: number; // MIDI note of the tonic
  scale: string;
  bpm: number;
  progression: number[]; // scale degrees, one chord every two bars
  pad: { wave: Wave; gain: number; cutoff: number; attack: number };
  arp: { wave: Wave; gain: number; octave: number; decay: number };
  pattern: number[]; // eight eighths: a chord tone (0–3), or −1 for a rest
  bass: boolean;
}

export interface VoiceDef {
  wave: Wave | 'noise';
  freq: number; // Hz; for noise, the band's centre
  to?: number; // a pitch drop, Hz
  attack: number;
  decay: number;
  gain: number;
  delay?: number;
}

export interface SfxDef {
  id: string;
  voices: VoiceDef[];
}

const wave = oneOf(WAVES);
const schema = obj({
  scales: (v: unknown, p: string) => {
    if (typeof v !== 'object' || v === null) throw new ContentError(p, 'expected an object');
    const out: Record<string, number[]> = {};
    for (const [k, steps] of Object.entries(v)) out[k] = arr(int)(steps, `${p}.${k}`);
    return out;
  },
  themes: arr(
    obj({
      id: oneOf(THEME_IDS),
      label: str,
      root: int,
      scale: str,
      bpm: num,
      progression: arr(int),
      pad: obj({ wave, gain: num, cutoff: num, attack: num }),
      arp: obj({ wave, gain: num, octave: int, decay: num }),
      pattern: arr(int),
      bass: (v: unknown, p: string) => {
        if (typeof v !== 'boolean') throw new ContentError(p, 'expected a boolean');
        return v;
      },
    }),
  ),
  sfx: arr(
    obj({
      id: str,
      voices: arr(
        obj({
          wave: oneOf([...WAVES, 'noise'] as const),
          freq: num,
          to: optional(num),
          attack: num,
          decay: num,
          gain: num,
          delay: optional(num),
        }),
      ),
    }),
  ),
  cues: (v: unknown, p: string) => {
    if (typeof v !== 'object' || v === null) throw new ContentError(p, 'expected an object');
    const out: Record<string, string> = {};
    for (const [k, id] of Object.entries(v)) out[k] = str(id, `${p}.${k}`);
    return out;
  },
  ambience: obj({
    crowd: obj({ gain: num, fullAt: num, summer: num }),
    wind: obj({ gain: num }),
    birds: obj({ perSecond: num, gain: num }),
    roar: obj({ gain: num }),
  }),
  words: obj({
    sound: str,
    mute: str,
    unmute: str,
    master: str,
    music: str,
    ambience: str,
    sfx: str,
    hint: str,
  }),
});

function load() {
  const file = validate(schema, raw, 'content/audio.json');
  const themes = uniqueBy(file.themes, (t) => t.id, 'content/audio.json.themes') as ThemeDef[];
  for (const id of THEME_IDS) {
    if (!themes.some((t) => t.id === id))
      throw new ContentError('content/audio.json', `no ${id} theme`);
  }
  for (const t of themes) {
    const at = `content/audio.json.themes.${t.id}`;
    const scale = file.scales[t.scale];
    if (!scale || scale.length !== 7)
      throw new ContentError(at, `no seven-note scale "${t.scale}"`);
    if (t.progression.length === 0) throw new ContentError(at, 'a theme needs chords');
    if (t.progression.some((d) => d < 0 || d > 6)) throw new ContentError(at, 'a degree is 0–6');
    if (t.pattern.length !== 8) throw new ContentError(at, 'a pattern is eight eighths');
    if (t.pattern.some((n) => n < -1 || n > 3)) throw new ContentError(at, 'a step is −1 to 3');
    if (t.bpm < 30 || t.bpm > 200) throw new ContentError(at, 'a tempo a person could play');
  }
  const sfx = uniqueBy(file.sfx, (s) => s.id, 'content/audio.json.sfx') as SfxDef[];
  for (const s of sfx) {
    for (const v of s.voices) {
      if (v.gain <= 0 || v.gain > 1)
        throw new ContentError(`content/audio.json.sfx.${s.id}`, 'gain 0–1');
    }
  }
  for (const [kind, id] of Object.entries(file.cues)) {
    if (!sfx.some((s) => s.id === id)) {
      throw new ContentError(`content/audio.json.cues.${kind}`, `no effect "${id}"`);
    }
  }
  return { ...file, themes, sfx };
}

const loaded = load();

export const SCALES: Readonly<Record<string, number[]>> = loaded.scales;
export const THEMES: readonly ThemeDef[] = loaded.themes;
export const SFX: readonly SfxDef[] = loaded.sfx;
export const CUES: Readonly<Record<string, string>> = loaded.cues;
export const AMBIENCE = loaded.ambience;
export const AUDIO_WORDS = loaded.words;

export function themeById(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id)!;
}

export function sfxById(id: string): SfxDef | undefined {
  return SFX.find((s) => s.id === id);
}

// The MIDI notes of a theme's chord on a scale degree: a triad from the
// scale, and its seventh, for the arpeggio to reach.
export function chordNotes(theme: ThemeDef, degree: number): number[] {
  const scale = SCALES[theme.scale]!;
  return [0, 2, 4, 6].map((step) => {
    const i = degree + step;
    return theme.root + scale[i % 7]! + 12 * Math.floor(i / 7);
  });
}

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
