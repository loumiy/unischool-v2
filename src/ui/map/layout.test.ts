import { describe, expect, it } from 'vitest';
import type { Placement } from '../../sim/index.ts';
import { layoutKey } from './layout.ts';

// Phase 52: the map's costly layers hang on what stands where, so a week
// of wear must not change the key and a week of building must.
const hall: Placement = {
  id: 'p1',
  buildingId: 'academic-hall',
  col: 10,
  row: 12,
  w: 6,
  h: 4,
  status: 'open',
  completesWeek: null,
  openedWeek: 3,
  backlog: 0,
  condition: 1,
};

describe('the layout key', () => {
  it('ignores wear', () => {
    const worn = { ...hall, backlog: 250_000, condition: 0.62 };
    expect(layoutKey([worn])).toBe(layoutKey([hall]));
  });

  it('notices building, renovating, moving and adding storeys', () => {
    const base = layoutKey([hall]);
    expect(layoutKey([{ ...hall, status: 'renovating' }])).not.toBe(base);
    expect(layoutKey([{ ...hall, col: 11 }])).not.toBe(base);
    expect(layoutKey([{ ...hall, storeysAdded: 1 }])).not.toBe(base);
    expect(layoutKey([hall, { ...hall, id: 'p2', col: 20 }])).not.toBe(base);
  });
});
