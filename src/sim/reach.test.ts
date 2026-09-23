import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import type { Campus, Placement } from './campus.ts';
import { opened } from './colleges.ts';
import { bridgeFits, reachable, reachFromRoad, siteRefusal } from './reach.ts';
import { TERRAIN } from './terrain.ts';

// REACHABILITY (Phase 21L).

const at = (id: string, buildingId: string, col: number, row: number, w: number, h: number) =>
  ({
    id,
    buildingId,
    col,
    row,
    w,
    h,
    status: 'open',
    completesWeek: null,
    openedWeek: 0,
    backlog: 0,
    condition: 1,
  }) satisfies Placement;

const bare = (): Campus => ({ ...opened(4).state.campus, placements: [], trees: {} });

describe('a way to walk there', () => {
  it('reaches the whole dry parcel from the road, far bank included by the road bridge', () => {
    const reach = reachFromRoad([]);
    // East of the stream, near the top of the parcel.
    expect(reach[3 * 64 + 63]).toBe(1);
    // A stream tile is never reached.
    const s = TERRAIN.stream[10]!;
    expect(reach[s.row * 64 + s.col]).toBe(0);
  });

  it('refuses a hall with no way in, and one that would wall another off', () => {
    const campus = bare();
    // A ring of halls round an empty 5×5 court.
    const ring: Placement[] = [
      at('a', 'residence-hall', 10, 10, 9, 4),
      at('b', 'residence-hall', 10, 19, 9, 4),
      at('c', 'dining-hall', 10, 14, 2, 5),
      at('d', 'dining-hall', 17, 14, 2, 5),
    ];
    const walled = { ...campus, placements: ring };
    const lab = buildingById('lab');
    // The court is closed: nothing inside it has a way to the road.
    expect(siteRefusal(walled, lab, 12, 15, 5, 3)).toMatch(/no way to walk/);
    // With one wall missing, the court is open, and the last wall is the
    // one that would shut the lab in.
    const open = { ...campus, placements: [...ring.slice(0, 3), at('l', 'lab', 12, 15, 5, 3)] };
    expect(reachable(reachFromRoad(open.placements), open.placements[3]!)).toBe(true);
    expect(siteRefusal(open, buildingById('dining-hall'), 17, 14, 2, 5)).toMatch(
      /wall off the lab/,
    );
    // A statue in a walled garden is a statue in a walled garden.
    expect(siteRefusal(walled, buildingById('statue'), 13, 16, 1, 1)).toBeNull();
  });
});

describe('the footbridge', () => {
  it('spans the stream and lands on dry ground at both ends', () => {
    const campus = bare();
    const row = 20;
    const water = TERRAIN.stream.filter((t) => t.row === row).map((t) => t.col);
    const west = Math.min(...water) - 1;
    expect(bridgeFits(campus, west, row, 4, 1)).toBe(true);
    // One tile short lands in the water; one along lands in it at the other end.
    expect(bridgeFits(campus, west + 1, row, 4, 1)).toBe(false);
    expect(bridgeFits(campus, west - 1, row, 4, 1)).toBe(false);
    // Nowhere near the stream, it is a very short wall.
    expect(bridgeFits(campus, 20, 20, 4, 1)).toBe(false);
    expect(siteRefusal(campus, buildingById('footbridge'), west, row, 4, 1)).toBeNull();
  });

  it('is walked across', () => {
    const row = 20;
    const water = TERRAIN.stream.filter((t) => t.row === row).map((t) => t.col);
    const bridge = at('fb', 'footbridge', Math.min(...water) - 1, row, 4, 1);
    const reach = reachFromRoad([bridge]);
    for (const c of water) expect(reach[row * 64 + c]).toBe(1);
  });
});
