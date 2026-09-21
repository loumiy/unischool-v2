import { boxFaces, project, type FaceDir, type Pt } from './iso.ts';
import { shade } from './tint.ts';

// THE SUN (ported from v1's light.ts): one light for the whole campus, fixed
// to the WORLD, so a building's lit wall stays lit from every side the
// camera looks from and shadows lie on the same lawn whichever way the view
// stands.

const FROM_ANGLE = (21 * Math.PI) / 180;
export const SUN_FROM = { col: -Math.cos(FROM_ANGLE), row: -Math.sin(FROM_ANGLE) };

const SHADOW_TILES_PER_UNIT = 0.006875;

export function shadowOffset(height: number): { dcol: number; drow: number } {
  return {
    dcol: -SUN_FROM.col * SHADOW_TILES_PER_UNIT * height,
    drow: -SUN_FROM.row * SHADOW_TILES_PER_UNIT * height,
  };
}

export function castShadow(col: number, row: number, w: number, h: number, height: number): Pt[] {
  const { dcol, drow } = shadowOffset(height);
  return boxFaces(col + dcol, row + drow, w, h, 0, 0).top;
}

export function sunScreenDir(): Pt {
  const p = project(SUN_FROM.col, SUN_FROM.row);
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

export const WALL_LIGHT: Record<FaceDir, number> = {
  negCol: 1.14,
  negRow: 1.02,
  posRow: 0.98,
  posCol: 0.78,
};

export function faceTone(dir: FaceDir, posRow: string, posCol: string): string {
  switch (dir) {
    case 'posRow':
      return posRow;
    case 'posCol':
      return posCol;
    case 'negRow':
      return shade(posRow, WALL_LIGHT.negRow / WALL_LIGHT.posRow);
    default:
      return shade(posRow, WALL_LIGHT.negCol / WALL_LIGHT.posRow);
  }
}
