import { TREE_SEED_RANGE } from './terrain.ts';

// WHAT KIND OF TREE A SEED IS (DD §6.2). A tree on the campus is one
// integer and nothing else: its species, its size and where in its own tile
// it stands all come back out of that seed, so a wood is varied without the
// state carrying anything per tree. The hash lives here, in the sim, rather
// than in the renderer that draws it, because from Phase 21A the player can
// ask for a particular kind — and the only honest way to honour that
// without widening the save is to hand back a seed that already means it.

export type Species = 'canopy' | 'conifer' | 'ornamental';

// The mix a random seed draws from: mostly canopy, some conifer, the
// ornamentals sparse enough to read as deliberate when one appears.
export const SPECIES_MIX: readonly Species[] = [
  'canopy',
  'canopy',
  'canopy',
  'conifer',
  'conifer',
  'ornamental',
];

export const SPECIES: readonly Species[] = ['canopy', 'conifer', 'ornamental'];

// One seeded value per (seed, salt): the renderer takes its size and offset
// from the same function, so a tree is identical in every frame, forever.
export function roll(seed: number, salt: number): number {
  let h = (seed ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function speciesOf(seed: number): Species {
  return SPECIES_MIX[Math.floor(roll(seed, 1) * SPECIES_MIX.length)]!;
}

// A seed that means the species asked for, found by walking forward from
// the one the run's dice gave us rather than by drawing again. That matters
// for replay: planting consumes exactly one number from the stream whether
// or not a species was asked for, so an action log replays the same either
// way, and a save made before the picker existed is unaffected.
//
// The search is bounded. Nothing in the mix is rarer than one in six, so it
// lands in a handful of steps; the cap is there so that a species the mix
// no longer contains degrades to "whatever the dice said" instead of
// hanging the tick.
const SPECIES_SEARCH_CAP = 256;

export function seedForSpecies(seed: number, species: Species | null | undefined): number {
  if (!species) return seed;
  for (let i = 0; i < SPECIES_SEARCH_CAP; i++) {
    const candidate = (seed + i) % TREE_SEED_RANGE;
    if (speciesOf(candidate) === species) return candidate;
  }
  return seed;
}
