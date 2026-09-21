import raw from './terrain.json' with { type: 'json' };
import { arr, int, num, obj, validate } from './schema.ts';

// THE PARCEL'S FRAME (DD §6.1): one fixed map for every run. A road along the
// south frontage, a stream down the east edge, a tree line along the north
// and west, and a clearing in the middle to found in. Authored as shapes
// here and expanded to tiles deterministically in sim/terrain.ts — the same
// tiles every run, which is what "no procedural variation" means.

export interface TerrainContent {
  seed: number;
  road: { rows: [number, number] };
  stream: { width: number; points: [number, number][] };
  woodland: {
    clearing: { col: number; row: number; radius: number };
    scatterPerTile: number;
    groves: { col: number; row: number; radius: number; trees: number }[];
  };
}

const pair = (v: unknown, p: string): [number, number] => {
  const list = arr(int)(v, p);
  if (list.length !== 2) throw new Error(`${p}: expected [col, row]`);
  return [list[0]!, list[1]!];
};

const schema = obj({
  seed: int,
  road: obj({ rows: pair }),
  stream: obj({ width: int, points: arr(pair) }),
  woodland: obj({
    clearing: obj({ col: int, row: int, radius: num }),
    scatterPerTile: num,
    groves: arr(obj({ col: int, row: int, radius: num, trees: int })),
  }),
});

export const TERRAIN_CONTENT: TerrainContent = validate(schema, raw, 'content/terrain.json');
