// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import type { SchoolColors } from '../state/types';

// ---------------------------------------------------------------------
// THE SCHOOL'S COLOURS (Plan 18's PR B). A university has a colour pair the
// way it has a vernacular: chosen at founding, worn everywhere, changed
// never. The pair is the game's THEME — styles.css's --school-primary and
// --school-secondary are written from it (see components/theme.ts) and every
// chrome surface reads them — so a maroon-and-gold school gets a maroon dock
// and gold chips, and a navy-and-orange one gets navy and orange.
//
// AUTHORED AS PAIRS WITH NAMES, not as two colour pickers. The startup
// screen offers "Maroon and gold", "Navy and orange", "Black and gold" —
// real collegiate pairings a player recognises as identities — rather than
// a hex value, because the question is "what school is this" and not "what
// colour do you like". Eight, which is enough to pick from and few enough
// to pick between, and EIGHT EXACTLY because the startup screen lays them
// out as one even row (see .startup-colors): a row that wraps unevenly
// reads as a row with a chip missing. The table once held ten; "Teal and
// gold" sat next to "Forest and gold" and "Scarlet and grey" next to
// "Crimson and silver", and a pick between two chips that read as the same
// pair is not a pick. Navy and royal blue stay: side by side they are
// plainly two blues.
//
// EVERY PAIR PASSES A CONTRAST RULE, and test/school-colors.test.ts pins it:
// cream text on the primary at 4.5:1 or better, and the primary as text on
// the secondary at 4.5:1 or better. Those are the two pairings the register
// draws constantly (the dock's text; the active tab and the primary button)
// and a pair that fails either would put an unreadable control on every
// screen. "Burnt orange and cream" and "Slate and copper" were tried and
// failed the second test; they are not offered.
//
// The secondary is never the cream the register's ground is. A cream
// secondary would vanish as an active chip on a cream screen, and the focus
// ring — drawn in the secondary — would vanish with it.
// ---------------------------------------------------------------------

export interface SchoolColorChoice extends SchoolColors {
  id: string;
  name: string; // "Maroon and gold" — how the startup screen labels it
}

export const SCHOOL_COLOR_PAIRS: SchoolColorChoice[] = [
  { id: 'maroon-gold', name: 'Maroon and gold', primary: '#7b1e2b', secondary: '#f2c14e' },
  { id: 'navy-gold', name: 'Navy and gold', primary: '#1f3a6b', secondary: '#e6b84a' },
  { id: 'forest-gold', name: 'Forest and gold', primary: '#1f5a3a', secondary: '#f2c14e' },
  { id: 'crimson-silver', name: 'Crimson and silver', primary: '#9b1c2e', secondary: '#d9d4c7' },
  { id: 'navy-orange', name: 'Navy and orange', primary: '#1b2a4a', secondary: '#f28c28' },
  { id: 'purple-gold', name: 'Purple and gold', primary: '#4a2a6a', secondary: '#e6b84a' },
  { id: 'black-gold', name: 'Black and gold', primary: '#1f1b17', secondary: '#e6b84a' },
  { id: 'royal-gold', name: 'Royal blue and gold', primary: '#1d3f86', secondary: '#e6b84a' },
];

// The pair the game wears before anyone has picked one — the startup
// screen's initial selection, and what createInitialState defaults to for
// the tests and the sim, which are not about the picture. The first row,
// which is also the pair styles.css carries as its literal defaults, so a
// page that has not had the theme applied yet already matches it.
export const FOUNDING_COLORS: SchoolColorChoice = SCHOOL_COLOR_PAIRS[0];

// The pair's two colours and nothing else — what University and Rival
// store. The id and the name are the startup screen's, not the save's.
export function schoolColorsOf(choice: SchoolColorChoice): SchoolColors {
  return { primary: choice.primary, secondary: choice.secondary };
}

// A rival's pair, DERIVED from its id the way its athletic strength and its
// two standings are (see rivalData.ts's hashUnit and the reasoning there):
// 99 hand-picked pairs would be a table of arithmetic nobody keeps
// consistent, and a deterministic pick off the id is stable across a run.
// Two rivals sharing a pair is what happens in a real conference too.
//
// Unread by anything today — Plan 18's PR E draws the playoff bracket in
// both schools' colours, and the annual report's rows after it.
export function rivalColorsFor(id: string): SchoolColors {
  return schoolColorsOf(SCHOOL_COLOR_PAIRS[hashIndex(id, SCHOOL_COLOR_PAIRS.length)]);
}

// Which pair a rival wears, by name, for a caller that wants the label.
export function colorPairName(colors: SchoolColors): string | null {
  return SCHOOL_COLOR_PAIRS.find((p) => p.primary === colors.primary && p.secondary === colors.secondary)?.name ?? null;
}

// The same FNV-style hash rivalData.ts uses for its derived axes, bucketed.
// Duplicated rather than imported so this module has no dependency on the
// rival table it is itself consulted by.
function hashIndex(id: string, buckets: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) % buckets;
}

// ---------------------------------------------------------------------
// The contrast rule, as WCAG writes it, so the test and the picker agree
// on what "readable" means. Relative luminance of an sRGB hex, then the
// ratio of the lighter to the darker with the 0.05 flare term.
// ---------------------------------------------------------------------

// What text on the primary is drawn in, for every pair: the register's
// cream (styles.css's --cream / --school-on-primary). Named here so the
// contrast test checks the colour the game actually uses.
export const TEXT_ON_PRIMARY = '#f7f2e8';
export const MIN_CONTRAST = 4.5;

export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Both pairings the register leans on, at the minimum or better.
export function pairIsReadable(c: SchoolColors): boolean {
  return contrastRatio(TEXT_ON_PRIMARY, c.primary) >= MIN_CONTRAST
    && contrastRatio(c.primary, c.secondary) >= MIN_CONTRAST;
}
