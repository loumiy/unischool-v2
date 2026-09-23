import { memo } from 'react';
import type { BuildingDef } from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import { ridgeOf, wallHeightOf } from './buildingSpec.ts';
import { boxFaces, polyPoints, type BoxFaces, type Pt } from './iso.ts';

// AGE YOU CAN SEE (Phase 46). Condition was a colour filter; now it is
// drawn. A worn building is streaked; a weathered one is stained, has lost
// slates and boarded a window; a derelict one is boarded up, its glass
// broken, a fence at its door and weeds against its walls. The other end
// too: a historic building gathers ivy as it ages. The stage is the same
// one the filter reads (CampusMap's conditionClass), so the drawing and
// the overlay can never disagree. Pure presentation; the marks are placed
// from the building's id, the same on every reload.

export type AgeStage = 'worn' | 'weathered' | 'derelict' | null;

const STAIN = 'rgba(40, 34, 26, 0.28)';
const BOARD = '#8c6a44';
const DARK_GLASS = '#2c3033';
const WEED = '#6f8a3c';
const IVY = '#3f6b33';
const FENCE = '#b9b3a6';

function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A point on a wall face [bottom-left, bottom-right, top-right, top-left].
function on(face: Pt[], u: number, v: number): Pt {
  const [bl, br, tr, tl] = face as [Pt, Pt, Pt, Pt];
  const bx = bl.x + (br.x - bl.x) * u;
  const by = bl.y + (br.y - bl.y) * u;
  const tx = tl.x + (tr.x - tl.x) * u;
  const ty = tl.y + (tr.y - tl.y) * u;
  return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
}

function quad(face: Pt[], u0: number, u1: number, v0: number, v1: number): string {
  return polyPoints([on(face, u0, v0), on(face, u1, v0), on(face, u1, v1), on(face, u0, v1)]);
}

function Streaks({ f, n, random }: { f: BoxFaces; n: number; random: () => number }) {
  const out = [];
  for (const [k, face] of [f.left, f.right].entries()) {
    for (let i = 0; i < n; i++) {
      const u = 0.08 + random() * 0.84;
      out.push(
        <polygon
          key={`${k}-${i}`}
          points={quad(face, u, u + 0.025, 0.25 + random() * 0.3, 0.98)}
          fill={STAIN}
        />,
      );
    }
  }
  return <>{out}</>;
}

function Boards({
  f,
  n,
  random,
  broken,
}: {
  f: BoxFaces;
  n: number;
  random: () => number;
  broken: boolean;
}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const face = i % 2 ? f.right : f.left;
    const u = 0.1 + random() * 0.72;
    const v = 0.2 + random() * 0.5;
    out.push(<polygon key={`b${i}`} points={quad(face, u, u + 0.1, v, v + 0.22)} fill={BOARD} />);
    if (broken && i % 2 === 0) {
      const u2 = 0.1 + random() * 0.72;
      const v2 = 0.2 + random() * 0.5;
      out.push(
        <polygon
          key={`g${i}`}
          points={quad(face, u2, u2 + 0.05, v2, v2 + 0.12)}
          fill={DARK_GLASS}
        />,
      );
    }
  }
  return <>{out}</>;
}

function MissingSlates({ f, n, random }: { f: BoxFaces; n: number; random: () => number }) {
  // Patches on the roof's lid, where slates or felt have gone.
  const [a, b, c, d] = f.top as [Pt, Pt, Pt, Pt];
  const at = (u: number, v: number): Pt => {
    const x1 = a.x + (b.x - a.x) * u;
    const y1 = a.y + (b.y - a.y) * u;
    const x2 = d.x + (c.x - d.x) * u;
    const y2 = d.y + (c.y - d.y) * u;
    return { x: x1 + (x2 - x1) * v, y: y1 + (y2 - y1) * v };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = 0.15 + random() * 0.6;
    const v = 0.15 + random() * 0.6;
    out.push(
      <polygon
        key={i}
        points={polyPoints([at(u, v), at(u + 0.08, v), at(u + 0.08, v + 0.1), at(u, v + 0.1)])}
        fill="rgba(30, 28, 26, 0.45)"
      />,
    );
  }
  return <>{out}</>;
}

function Weeds({ f, random }: { f: BoxFaces; random: () => number }) {
  const out = [];
  for (const [k, face] of [f.left, f.right].entries()) {
    for (let i = 0; i < 5; i++) {
      const p = on(face, 0.05 + random() * 0.9, 0);
      out.push(
        <path key={`${k}-${i}`} d={`M${p.x - 4},${p.y}q2,-9 4,-10q1,6 4,10z`} fill={WEED} />,
      );
    }
  }
  return <>{out}</>;
}

function Fence({ f }: { f: BoxFaces }) {
  // Hoarding along the foot of the two walls the camera sees, a little proud.
  const posts = [];
  for (const face of [f.left, f.right]) {
    for (let i = 0; i <= 8; i++) {
      const p = on(face, i / 8, 0);
      posts.push(`M${p.x.toFixed(1)},${(p.y + 3).toFixed(1)}l0,-6`);
    }
    const a = on(face, 0, 0);
    const b = on(face, 1, 0);
    posts.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  return <path d={posts.join('')} stroke={FENCE} strokeWidth={1.1} fill="none" />;
}

function Ivy({ f, reach, random }: { f: BoxFaces; reach: number; random: () => number }) {
  const out = [];
  for (const [k, face] of [f.left, f.right].entries()) {
    const n = 3 + Math.round(reach * 4);
    for (let i = 0; i < n; i++) {
      const u = 0.02 + random() * 0.85;
      const w = 0.1 + random() * 0.12;
      const top = 0.3 + reach * (0.35 + 0.3 * random());
      out.push(
        <polygon
          key={`${k}-${i}`}
          points={polyPoints([
            on(face, u, 0),
            on(face, u + w, 0),
            on(face, u + w * 0.7, top),
            on(face, u + w * 0.2, top * 0.8),
          ])}
          fill={IVY}
          opacity={0.85}
        />,
      );
    }
  }
  return <>{out}</>;
}

function AgeMarks({
  id,
  def,
  p,
  motif,
  stage,
  ivy,
}: {
  id: string;
  def: BuildingDef;
  p: { col: number; row: number; w: number; h: number };
  motif: Motif;
  stage: AgeStage;
  // How far the ivy has climbed a historic building, 0–1; 0 for none.
  ivy: number;
}) {
  if (!stage && ivy <= 0) return null;
  // Massless things (a field, a statue) have no walls to mark.
  if (def.storeys === 0 && def.form !== 'hangar') return null;
  const wallH = wallHeightOf(def);
  const f = boxFaces(p.col, p.row, p.w, p.h, 0, wallH);
  const lid = boxFaces(p.col, p.row, p.w, p.h, 0, wallH + ridgeOf(def, motif) * 0.5);
  const random = seeded(id);
  return (
    <g className="age-marks" aria-hidden="true">
      {ivy > 0 && <Ivy f={f} reach={ivy} random={random} />}
      {stage && <Streaks f={f} n={stage === 'worn' ? 2 : 4} random={random} />}
      {(stage === 'weathered' || stage === 'derelict') && (
        <MissingSlates f={lid} n={stage === 'derelict' ? 6 : 3} random={random} />
      )}
      {(stage === 'weathered' || stage === 'derelict') && (
        <Boards
          f={f}
          n={stage === 'derelict' ? 6 : 1}
          random={random}
          broken={stage === 'derelict'}
        />
      )}
      {stage === 'derelict' && <Weeds f={f} random={random} />}
      {stage === 'derelict' && <Fence f={f} />}
    </g>
  );
}

export default memo(AgeMarks);
