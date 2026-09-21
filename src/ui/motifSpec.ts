import type { Motif } from '../sim/index.ts';
import { MOTIF_STYLES, NO_STONE, type ApexPart, type EntrancePart } from './map/buildingSpec.ts';

// The founding screen's view of a motif: the founding hall's wall and roof,
// the trim, the glass, the gilding, what crowns the landmark and what stands
// at its door. A thin reading of map/buildingSpec.ts's full style tables, so
// the facade on the startup screen and the hall on the map can never drift.

export interface MotifSpec {
  wall: string;
  roof: string;
  trim: string | null;
  gilt: string | null;
  towerStone: string;
  glass: string;
  apex: ApexPart;
  entrance: EntrancePart;
}

function specOf(m: Motif): MotifSpec {
  const s = MOTIF_STYLES[m];
  return {
    wall: s.materials.brickRed.wall,
    roof: s.materials.brickRed.roof,
    trim: s.stone.trim === NO_STONE ? null : s.stone.trim,
    gilt: s.stone.gilt === NO_STONE ? null : s.stone.gilt,
    towerStone: s.stone.towerStone,
    glass: s.stone.glass,
    apex: s.parts.apex,
    entrance: s.parts.entrance.hall ?? 'none',
  };
}

export const MOTIF_SPECS: Readonly<Record<Motif, MotifSpec>> = {
  georgian: specOf('georgian'),
  gothic: specOf('gothic'),
  classical: specOf('classical'),
  mission: specOf('mission'),
  modern: specOf('modern'),
};

export { shade } from './map/tint.ts';
