import type { SchoolColors } from '../sim/identity.ts';
import raw from './palettes.json' with { type: 'json' };
import { arr, ContentError, int, obj, optional, str, uniqueBy, validate } from './schema.ts';

// The authored colour pairs (DD §14: 8 palettes at 1.0). Pairs with names,
// not two colour pickers: "Maroon and gold" is an identity a player
// recognises, a hex value is not. Every pair passes the contrast rule
// below, which the content test pins.

export interface PaletteChoice extends SchoolColors {
  id: string;
  name: string;
  // A cosmetic unlock (DD §12.3, Phase 28): offered once this many runs
  // hang in the hall of fame. Absent, it is there from the start.
  unlockAfter?: number;
}

const HEX = /^#[0-9a-f]{6}$/;

const schema = obj({
  palettes: arr(
    obj({ id: str, name: str, primary: str, secondary: str, unlockAfter: optional(int) }),
  ),
});

function load(): PaletteChoice[] {
  const file = validate(schema, raw, 'content/palettes.json');
  const list = uniqueBy(file.palettes, (p) => p.id, 'content/palettes.json.palettes');
  for (const [i, p] of list.entries()) {
    for (const key of ['primary', 'secondary'] as const) {
      if (!HEX.test(p[key])) {
        throw new ContentError(`content/palettes.json.palettes[${i}].${key}`, 'expected #rrggbb');
      }
    }
    if (!pairIsReadable(p)) {
      throw new ContentError(`content/palettes.json.palettes[${i}]`, 'fails the contrast rule');
    }
  }
  return list;
}

// What text on the primary is drawn in, for every pair: the register's
// cream (ui/tokens.css's --cream / --school-on-primary).
export const TEXT_ON_PRIMARY = '#f7f2e8';
export const MIN_CONTRAST = 4.5;

export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Both pairings the register leans on constantly: cream text on the
// primary (the dock), and the primary as text on the secondary (the active
// tab, the primary button).
export function pairIsReadable(c: SchoolColors): boolean {
  return (
    contrastRatio(TEXT_ON_PRIMARY, c.primary) >= MIN_CONTRAST &&
    contrastRatio(c.primary, c.secondary) >= MIN_CONTRAST
  );
}

export const PALETTES: readonly PaletteChoice[] = load();

// The pair the game wears before anyone has picked one; also tokens.css's
// literal defaults, so an unthemed page already matches it.
export const DEFAULT_PALETTE: PaletteChoice = PALETTES[0]!;

// The pairs on offer to a player with this many runs in the hall.
export function unlockedPalettes(runs: number): PaletteChoice[] {
  return PALETTES.filter((p) => (p.unlockAfter ?? 0) <= runs);
}

export function paletteById(id: string): PaletteChoice | undefined {
  return PALETTES.find((p) => p.id === id);
}
