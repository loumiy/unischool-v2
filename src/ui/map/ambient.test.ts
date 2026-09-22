import { describe, expect, it } from 'vitest';
import { hullOf, nearerThanWalker } from './ambient.tsx';
import { occludes } from './depthSort.ts';
import { boxFaces, cameraAxes, DEFAULT_CAMERA, setCamera, type Pt } from './iso.ts';

// WALKERS HIDE BEHIND THE WALLS THEY PASS (DD §6.3, Phase 21D). A walker
// used to be switched off whole the moment its feet crossed a building's
// front edge. It is clipped by the building's outline now, so half a figure
// past a corner is half a figure, which is two pieces of geometry: the
// outline itself, and the question of which of the two is in front.

const TURNS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((t) => ({
  azimuth: DEFAULT_CAMERA.azimuth + t,
  pitch: DEFAULT_CAMERA.pitch,
}));

function cornersOf(col: number, row: number, w: number, h: number, height: number): Pt[] {
  const f = boxFaces(col, row, w, h, 0, height);
  return [f.A, f.B, f.C, f.D, f.At, f.Bt, f.Ct, f.Dt];
}

// Which side of the directed edge a→b the point is on. The hull is wound so
// that its inside is the positive side (screen y runs downward, so this is
// the mirror of the usual convention).
function side(a: Pt, b: Pt, q: Pt): number {
  return (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
}

describe('a building’s outline on screen', () => {
  it('is convex, and encloses every corner of the box', () => {
    for (const camera of TURNS) {
      setCamera(camera);
      const pts = cornersOf(20, 20, 7, 5, 40);
      const hull = hullOf(pts);
      expect(hull.length).toBeGreaterThanOrEqual(4);
      expect(hull.length).toBeLessThanOrEqual(6);
      // Every corner is inside or on it, which is what makes it a silhouette
      // rather than one face of the box.
      for (const q of pts) {
        for (let i = 0; i < hull.length; i++) {
          const a = hull[i]!;
          const b = hull[(i + 1) % hull.length]!;
          expect(side(a, b, q)).toBeGreaterThanOrEqual(-1e-6);
        }
      }
    }
    setCamera(DEFAULT_CAMERA);
  });

  it('is wound one way, with no repeated corner', () => {
    setCamera(DEFAULT_CAMERA);
    const hull = hullOf(cornersOf(10, 10, 4, 4, 30));
    const seen = new Set(hull.map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`));
    expect(seen.size).toBe(hull.length);
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]!;
      const b = hull[(i + 1) % hull.length]!;
      const c = hull[(i + 2) % hull.length]!;
      expect(side(a, b, c)).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('which of a walker and a wall is in front', () => {
  it('answers what the painter’s order answers, from every camera', () => {
    const box = { col: 20, row: 20, w: 6, h: 4 };
    for (const camera of TURNS) {
      setCamera(camera);
      const { sinA, cosA } = cameraAxes();
      // Tile centres, so no sample straddles a footprint edge: a walker
      // standing exactly on the wall line is a question neither answers.
      for (let c = 16; c <= 30; c++) {
        for (let r = 16; r <= 28; r++) {
          const wc = c + 0.5;
          const wr = r + 0.5;
          const inside =
            wc > box.col && wc < box.col + box.w && wr > box.row && wr < box.row + box.h;
          if (inside) continue;
          const walker = { col: wc - 0.2, row: wr - 0.2, w: 0.4, h: 0.4 };
          const painted = occludes(box, walker, { sinA, cosA });
          // The painter can decline (no overlap on screen); where it does
          // not, the clip must agree with it.
          if (painted !== 0) {
            expect(
              nearerThanWalker(box, wc, wr, sinA, cosA),
              `camera ${camera.azimuth.toFixed(2)} at ${wc},${wr}`,
            ).toBe(painted === 1);
          }
        }
      }
    }
    setCamera(DEFAULT_CAMERA);
  });

  it('puts a walker standing on the near side in front, and the far side behind', () => {
    setCamera(DEFAULT_CAMERA);
    const { sinA, cosA } = cameraAxes();
    const box = { col: 20, row: 20, w: 6, h: 4 };
    // A higher column is nearer the camera when sinA is positive, which is
    // the same rule depthSort paints by.
    const nearCol = sinA > 0 ? box.col + box.w + 2 : box.col - 2;
    const farCol = sinA > 0 ? box.col - 2 : box.col + box.w + 2;
    expect(nearerThanWalker(box, nearCol, 22.5, sinA, cosA)).toBe(false);
    expect(nearerThanWalker(box, farCol, 22.5, sinA, cosA)).toBe(true);
  });
});
