import { describe, expect, it } from 'vitest';
import { READING_NAMES } from '../content/conditions.ts';
import { EVENT_CONDITIONS } from '../content/events.ts';
import { dispatch, newRun, tickRunWeeks, defaultResolution } from '../sim/index.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { leverLine, measureClause } from './measure.ts';

// WHAT THE SCREENS SAY (Phase 21F).

// Every string the game ships, from the content files and the screens.
const content = import.meta.glob('../content/*.json', { eager: true, import: 'default' });
const screens = import.meta.glob('./**/*.tsx', { eager: true, query: '?raw', import: 'default' });

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

describe('the development plan stays out of the game', () => {
  it('names no phase in any content a player can read', () => {
    const offenders: string[] = [];
    for (const [file, json] of Object.entries(content)) {
      for (const s of strings(json)) if (/\bPhase \d+/.test(s)) offenders.push(`${file}: ${s}`);
    }
    expect(offenders).toEqual([]);
  });

  it('names no phase on any screen', () => {
    const offenders: string[] = [];
    for (const [file, src] of Object.entries(screens)) {
      // Only what is rendered: string literals and JSX text, not comments.
      const code = (src as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/Arrives in Phase|arrives in Phase|· Phase \{/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('a promise, as a measurement', () => {
  it('has words for every condition the vocabulary carries', () => {
    for (const c of EVENT_CONDITIONS) expect(READING_NAMES[c]?.label, c).toBeTruthy();
  });

  it('reads a goal as where the college is against where it said it would be', () => {
    const run = tickRunWeeks(
      dispatch(
        dispatch(newRun(4), {
          type: 'found',
          name: 'Blackmoor',
          motif: 'georgian',
          paletteId: DEFAULT_PALETTE.id,
          colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
        }),
        { type: 'placeBuilding', buildingId: 'founders-hall', col: 28, row: 28, rotated: false },
      ),
      6,
      defaultResolution,
    );
    const floor = measureClause(run.state, 'buildingsOver', 3);
    expect(floor.text).toBe('Buildings open 1 of 3');
    expect(floor.met).toBe(false);
    expect(floor.progress).toBeCloseTo(1 / 3, 5);
    const ceiling = measureClause(run.state, 'debtUnder', 5_000_000);
    expect(ceiling.text).toMatch(/^Debt \$0, under \$5M$/);
    expect(ceiling.met).toBe(true);
    expect(ceiling.progress).toBeUndefined();
  });

  it('says what a promise costs in the levers’ own names', () => {
    expect(leverLine({ confidence: -7, warmth: 4 })).toBe('board confidence −7, alumni warmth +4');
    expect(leverLine({ cash: -120000 })).toMatch(/^operating funds -?−?\$120k$/);
  });
});

describe('the ticker under a question (Phase 21G)', () => {
  it('prints a dateline, not the question again', async () => {
    const { dateline } = await import('../content/busLines.ts');
    const body =
      'The student newspaper has asked for funding, an office, and an undertaking that the college will not read it before it is printed. The editor is nineteen.';
    const line = dateline(body);
    expect(line.length).toBeLessThanOrEqual(65);
    expect(line.endsWith('…')).toBe(true);
    expect(body.startsWith(line.slice(0, -1))).toBe(true);
    expect(dateline('A short one.')).toBe('A short one.');
  });
});
