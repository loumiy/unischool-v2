import raw from './placement.json' with { type: 'json' };
import { arr, num, obj, str, uniqueBy, validate } from './schema.ts';

// PLACEMENT CONTENT (DD §6.2): the pairings that are worth something, the
// names the game gives a quad it detects, and the words for the math the
// player is shown. Rules live here, not in code.

export interface PairingDef {
  id: string;
  label: string;
  line: string;
  // A building id or a category (content/buildings.json) on each side.
  from: string;
  to: string;
  // Satisfaction points when every eligible building of the `from` kind has
  // its partner within the radius.
  points: number;
}

const fileSchema = obj({
  pairings: arr(obj({ id: str, label: str, line: str, from: str, to: str, points: num })),
  quadNames: arr(str),
  readings: obj({
    placement: str,
    cap: str,
    quads: str,
    enclosure: str,
    green: str,
    quadWorth: str,
    pairings: str,
    beautySwing: str,
  }),
  lines: obj({
    noQuads: str,
    quadWorth: str,
    renameHint: str,
    capped: str,
    uncapped: str,
    pairingShare: str,
  }),
});

function load() {
  const file = validate(fileSchema, raw, 'content/placement.json');
  const pairings = uniqueBy(
    file.pairings,
    (p) => p.id,
    'content/placement.json.pairings',
  ) as PairingDef[];
  for (const p of pairings) {
    if (p.points <= 0) throw new Error(`content/placement.json: ${p.id} must be worth something`);
  }
  if (file.quadNames.length < 6) throw new Error('content/placement.json: too few quad names');
  return { pairings, quadNames: file.quadNames, readings: file.readings, lines: file.lines };
}

const loaded = load();

export const PAIRINGS: readonly PairingDef[] = loaded.pairings;
export const QUAD_NAMES: readonly string[] = loaded.quadNames;
export const PLACEMENT_READINGS = loaded.readings;
export const PLACEMENT_WORDS = loaded.lines;
