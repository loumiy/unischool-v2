import { describe, expect, it } from 'vitest';
import {
  chordNotes,
  CUES,
  midiToHz,
  sectionAt,
  SFX,
  THEMES,
  themeById,
} from '../../content/audio.ts';
import { played } from '../../sim/colleges.ts';
import { createNewGame, type BusEntry, type GameState } from '../../sim/index.ts';
import { ambienceFor, cuesFor, entriesSince, lastSeq, themeFor } from './director.ts';
import { DEFAULT_AUDIO, normaliseAudio } from './settings.ts';
import { AudioEngine } from './engine.ts';

// THE SOUND OF THE PLACE (DD §13.4, Phase 32). The engine needs a speaker;
// what it is told to play does not, and that is what these check.

const running = played(4, 8).state;

describe('the themes', () => {
  it('writes four themes, each a playable phrase in its key', () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual([
      'ceremonial',
      'distress',
      'founding',
      'growth',
    ]);
    for (const t of THEMES) {
      const chord = chordNotes(t, t.progression[0]!);
      expect(chord).toHaveLength(4);
      // A triad and its seventh, rising.
      expect([...chord].sort((a, b) => a - b)).toEqual(chord);
      expect(midiToHz(chord[0]!)).toBeGreaterThan(80);
      expect(midiToHz(chord[3]! + 12 * t.arp.octave)).toBeLessThan(2000);
    }
    expect(midiToHz(69)).toBe(440);
  });

  it('sets the distress undertone in a minor key', () => {
    const distress = themeById('distress');
    const tonic = chordNotes(distress, 0);
    expect(tonic[1]! - tonic[0]!).toBe(3);
    expect(chordNotes(themeById('growth'), 0)[1]! - chordNotes(themeById('growth'), 0)[0]!).toBe(4);
  });
});

describe('what the college sounds like', () => {
  it('founds to the founding theme, and grows into the growth theme', () => {
    expect(themeFor(null)).toBe('founding');
    expect(themeFor(createNewGame(1))).toBe('founding');
    expect(running.clock.year).toBeGreaterThan(3);
    expect(themeFor({ ...running, distress: { ...running.distress, rung: 0 } })).toBe('growth');
  });

  it('turns to the undertone when the board freezes, and to ceremony at the end', () => {
    const frozen: GameState = { ...running, distress: { ...running.distress, rung: 2 } };
    expect(themeFor(frozen)).toBe('distress');
    const late: GameState = {
      ...running,
      distress: { ...running.distress, rung: 0 },
      clock: { ...running.clock, year: 47 },
    };
    expect(themeFor(late)).toBe('ceremonial');
    const epilogue: GameState = { ...frozen, ending: { ...frozen.ending, epilogue: true } };
    expect(themeFor(epilogue)).toBe('ceremonial');
  });

  it('murmurs with the roll, thins in summer, and blows in winter', () => {
    const fall = ambienceFor({ ...running, clock: { ...running.clock, term: 'fall', week: 4 } });
    const summer = ambienceFor({
      ...running,
      clock: { ...running.clock, term: 'summer', week: 4 },
    });
    expect(fall.crowd).toBeGreaterThan(0);
    expect(summer.crowd).toBeLessThan(fall.crowd);
    const empty = ambienceFor({ ...running, people: { ...running.people, cohorts: [] } });
    expect(empty.crowd).toBe(0);
    const deep = ambienceFor({ ...running, clock: { ...running.clock, term: 'spring', week: 2 } });
    const warm = ambienceFor({ ...running, clock: { ...running.clock, term: 'summer', week: 6 } });
    expect(deep.wind).toBeGreaterThan(warm.wind);
    expect(warm.birds).toBeGreaterThan(deep.birds);
  });

  it('roars on a game week only where there are teams', () => {
    const gameWeek = { ...running.clock, term: 'fall' as const, week: 6 };
    const teams: GameState = {
      ...running,
      clock: gameWeek,
      athletics: { ...running.athletics, varsity: ['soccer'] },
    };
    expect(ambienceFor(teams).roar).toBe(true);
    expect(ambienceFor({ ...teams, athletics: { ...teams.athletics, varsity: [] } }).roar).toBe(
      false,
    );
    expect(ambienceFor({ ...teams, clock: { ...gameWeek, week: 7 } }).roar).toBe(false);
  });
});

describe('the journal cues its effects', () => {
  it('names every cue an effect that exists', () => {
    for (const id of Object.values(CUES))
      expect(
        SFX.some((s) => s.id === id),
        id,
      ).toBe(true);
  });

  it('plays a placement, a bell and a coin once each, whatever the frame held', () => {
    const e = (seq: number, event: Record<string, unknown>) =>
      ({ seq, week: 1, ...event }) as unknown as BusEntry;
    const cues = cuesFor([
      e(1, { kind: 'buildingPlaced', placementId: 'p2', buildingId: 'library' }),
      e(2, { kind: 'yearTurned', year: 2 }),
      e(3, { kind: 'yearTurned', year: 3 }),
      e(4, { kind: 'budgetApproved', year: 2, drawRate: 0.045 }),
      e(5, { kind: 'termBegan', year: 2, term: 'fall' }),
      e(6, { kind: 'seasonClosed', sportId: 'soccer', wins: 9, losses: 1, title: true }),
    ]);
    expect(cues).toEqual(['place', 'yearTurn', 'coin', 'cheer']);
  });

  it('hears only what is new', () => {
    const seq = lastSeq(running);
    expect(seq).toBeGreaterThan(10);
    expect(entriesSince(running, seq)).toEqual([]);
    expect(entriesSince(running, seq - 3)).toHaveLength(3);
  });
});

describe('the settings', () => {
  it('reads back whatever was stored as clamped levels', () => {
    expect(normaliseAudio(null)).toEqual(DEFAULT_AUDIO);
    expect(normaliseAudio({ master: 3, music: -1, sfx: 'loud', muted: true, extra: 1 })).toEqual({
      ...DEFAULT_AUDIO,
      master: 1,
      music: 0,
      muted: true,
    });
  });

  it('is silent, not broken, where there is no Web Audio', () => {
    const engine = new AudioEngine();
    expect(engine.available).toBe(false);
    engine.unlock();
    engine.setTheme('distress');
    engine.play('place');
    engine.setAmbience(ambienceFor(running));
    expect(engine.started).toBe(false);
  });
});

// THE MIX'S VARIATIONS (Phase 50): four hours of any theme never plays the
// same eight bars more than twice in a row.
describe('variations', () => {
  it('never repeats eight bars more than twice running in four hours', () => {
    for (const theme of THEMES) {
      const eighth = 60 / theme.bpm / 2;
      const steps = Math.floor((4 * 3600) / eighth);
      const window = 64; // eight bars of eighths
      let last = '';
      let run = 0;
      let worst = 0;
      for (let start = 0; start + window <= steps; start += window) {
        let sig = '';
        for (let s = start; s < start + window; s++) {
          const n = sectionAt(theme, s);
          sig += `${n.degree}:${n.tone},`;
        }
        run = sig === last ? run + 1 : 1;
        worst = Math.max(worst, run);
        last = sig;
      }
      expect(worst, theme.id).toBeLessThanOrEqual(2);
    }
  });

  it('gives every theme a B section and a second pattern', () => {
    for (const theme of THEMES) {
      expect(theme.progressionB?.length, theme.id).toBeGreaterThan(0);
      expect(theme.patternB?.length, theme.id).toBe(8);
      const b = Array.from({ length: 64 * 8 }, (_, s) => sectionAt(theme, s)).some((n) => n.b);
      expect(b, theme.id).toBe(true);
    }
  });
});
