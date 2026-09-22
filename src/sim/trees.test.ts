import { describe, expect, it } from 'vitest';

import { applyAction, canApply } from './actions.ts';
import { opened } from './colleges.ts';
import { newRun, dispatch, tickRunWeeks, type Run } from './run.ts';
import { SPECIES, speciesOf, seedForSpecies } from './trees.ts';
import { tileKey } from './terrain.ts';

// Phase 21A: the player may ask for a kind of tree. The seed still carries
// everything, so the sim honours the request by handing back a seed that
// already means it.

const ground = { col: 12, row: 12 };

function running(): Run {
  return tickRunWeeks(opened(4242), 40);
}

describe('planting a chosen tree (Phase 21A)', () => {
  it('finds a seed for every species in the mix', () => {
    for (const species of SPECIES) {
      for (const seed of [0, 1, 7, 99991, 1 << 19]) {
        expect(speciesOf(seedForSpecies(seed, species)), `${species} from ${seed}`).toBe(species);
      }
    }
  });

  it('leaves the seed alone when nothing was asked for', () => {
    for (const seed of [0, 1, 7, 99991]) {
      expect(seedForSpecies(seed, null)).toBe(seed);
      expect(seedForSpecies(seed, undefined)).toBe(seed);
    }
  });

  it('plants the species the player asked for', () => {
    const run = running();
    for (const species of SPECIES) {
      const next = applyAction(run.state, {
        type: 'paint',
        tool: 'plant',
        col: ground.col,
        row: ground.row,
        species,
      });
      const seed = next.campus.trees[tileKey(ground.col, ground.row)];
      expect(seed, `no tree planted for ${species}`).toBeDefined();
      expect(speciesOf(seed!)).toBe(species);
    }
  });

  // The reason for searching forward from the drawn seed rather than
  // drawing again: a run's dice must not depend on what the player felt
  // like planting, or two runs with the same log would diverge.
  it('costs the run exactly one number from the stream, whatever is asked for', () => {
    const run = running();
    const plain = applyAction(run.state, {
      type: 'paint',
      tool: 'plant',
      col: ground.col,
      row: ground.row,
    });
    for (const species of SPECIES) {
      const asked = applyAction(run.state, {
        type: 'paint',
        tool: 'plant',
        col: ground.col,
        row: ground.row,
        species,
      });
      expect(asked.rng, `${species} moved the stream differently`).toEqual(plain.rng);
    }
  });

  it('replays identically from the action log', () => {
    const action = {
      type: 'paint',
      tool: 'plant',
      col: ground.col,
      row: ground.row,
      species: 'ornamental',
    } as const;
    const a = dispatch(running(), action);
    const b = dispatch(running(), action);
    expect(a.state.campus.trees).toEqual(b.state.campus.trees);
    expect(speciesOf(a.state.campus.trees[tileKey(ground.col, ground.row)]!)).toBe('ornamental');
  });

  it('still refuses ground it refused before', () => {
    const fresh = newRun(4242);
    expect(
      canApply(fresh.state, {
        type: 'paint',
        tool: 'plant',
        col: ground.col,
        row: ground.row,
        species: 'conifer',
      }).ok,
    ).toBe(false);
  });
});
