import type { BuildingDef, Feature } from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import { ridgeOf, wallHeightOf, type Material } from './buildingSpec.ts';
import { boxFaces, lift, polyPoints, projectedCircle, type BoxFaces, type Pt } from './iso.ts';
import { faceTone } from './light.ts';
import { up } from './scale.ts';
import { shade } from './tint.ts';

// A SILHOUETTE FOR EVERY BUILDING (Phase 44). The forms give a building its
// mass; these are the parts that say what it is for, drawn on top of the
// mass from the catalogue's own list (content/buildings.json `features`):
// a laboratory's flues, a library's lit reading room, a lecture theatre's
// windowless drum, a theatre's fly tower, a dining hall's glazed end, the
// flag over the administration, the stands along a pitch, a modern
// residence's balconies. Everything stays inside the footprint, so
// placement, shadows, depth and the label anchor are untouched. Pure
// presentation: nothing here reads the sim.

const GLASS = '#a9c2d3';
const METAL = '#8b9196';
const FLAG_POLE = '#d8d6cf';
const STAND = '#bdb6a6';

function faces(f: BoxFaces, tone: string, lid?: string) {
  return (
    <>
      <polygon
        points={polyPoints(f.left)}
        fill={faceTone(f.dir.CD, shade(tone, 0.82), shade(tone, 0.7))}
      />
      <polygon
        points={polyPoints(f.right)}
        fill={faceTone(f.dir.BC, shade(tone, 0.82), shade(tone, 0.7))}
      />
      <polygon points={polyPoints(f.top)} fill={lid ?? shade(tone, 1.05)} />
    </>
  );
}

// A point on a wall face [bottom-left, bottom-right, top-right, top-left],
// by how far along (u) and how far up (v).
function onFace(face: Pt[], u: number, v: number): Pt {
  const [bl, br, tr, tl] = face as [Pt, Pt, Pt, Pt];
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  return { x: bottom.x + (top.x - bottom.x) * v, y: bottom.y + (top.y - bottom.y) * v };
}

function inset(face: Pt[], u0: number, u1: number, v0: number, v1: number): Pt[] {
  return [onFace(face, u0, v0), onFace(face, u1, v0), onFace(face, u1, v1), onFace(face, u0, v1)];
}

function Stacks({ p, base, wall }: { p: Box; base: number; wall: string }) {
  const long = Math.max(p.w, p.h);
  const n = Math.max(2, Math.min(5, Math.round(long / 3)));
  const alongCol = p.w >= p.h;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const c = alongCol ? p.col + p.w * t - 0.2 : p.col + p.w / 2 - 0.2;
    const r = alongCol ? p.row + p.h / 2 - 0.2 : p.row + p.h * t - 0.2;
    const f = boxFaces(c, r, 0.4, 0.4, base, base + up(4 + (i % 2) * 1.5));
    out.push(<g key={i}>{faces(f, i % 2 ? METAL : shade(wall, 0.9))}</g>);
  }
  return <>{out}</>;
}

function ReadingRoom({
  p,
  base,
  wall,
  roof,
}: {
  p: Box;
  base: number;
  wall: string;
  roof: string;
}) {
  const m = Math.min(1.2, Math.min(p.w, p.h) / 4);
  const f = boxFaces(p.col + m, p.row + m, p.w - 2 * m, p.h - 2 * m, base, base + up(4.5));
  return (
    <>
      {faces(f, shade(wall, 1.08), shade(roof, 1.1))}
      <polygon points={polyPoints(inset(f.left, 0.06, 0.94, 0.25, 0.8))} fill={GLASS} />
      <polygon points={polyPoints(inset(f.right, 0.06, 0.94, 0.25, 0.8))} fill={GLASS} />
    </>
  );
}

// A drum: the front half of an ellipse, raised, capped.
function Drum({ p, base, height, wall }: { p: Box; base: number; height: number; wall: string }) {
  const cc = p.col + p.w / 2;
  const cr = p.row + p.h / 2;
  const radius = Math.min(p.w, p.h) * 0.36;
  const ring = projectedCircle(cc, cr, radius, 28);
  const low = ring.map((q) => lift(q, base));
  const high = ring.map((q) => lift(q, base + height));
  // The side: every segment of the ring whose lower edge faces the viewer.
  const side: Pt[] = [];
  const maxY = Math.max(...low.map((q) => q.y));
  const minY = Math.min(...low.map((q) => q.y));
  const front = low
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.y >= (maxY + minY) / 2 - 0.001)
    .sort((a, b) => a.q.x - b.q.x);
  for (const { q } of front) side.push(q);
  for (const { i } of [...front].reverse()) side.push(high[i]!);
  return (
    <>
      <polygon points={polyPoints(side)} fill={shade(wall, 0.72)} />
      <polygon points={polyPoints(high)} fill={shade(wall, 0.92)} />
    </>
  );
}

function FlyTower({
  p,
  height,
  wall,
  roof,
}: {
  p: Box;
  height: number;
  wall: string;
  roof: string;
}) {
  const alongCol = p.w >= p.h;
  const tw = alongCol ? p.w * 0.36 : p.w * 0.7;
  const th = alongCol ? p.h * 0.7 : p.h * 0.36;
  const f = boxFaces(p.col + (p.w - tw) / 2, p.row + (p.h - th) / 2, tw, th, 0, height);
  return <>{faces(f, shade(wall, 0.95), shade(roof, 1.05))}</>;
}

function GlazedEnd({ p, wallH }: { p: Box; wallH: number }) {
  const f = boxFaces(p.col, p.row, p.w, p.h, 0, wallH);
  // The shorter of the two walls the camera sees.
  const face = f.spanLeft <= f.spanRight ? f.left : f.right;
  return <polygon points={polyPoints(inset(face, 0.08, 0.92, 0.12, 0.92))} fill={GLASS} />;
}

function Flagpole({ p, wallH }: { p: Box; wallH: number }) {
  const f = boxFaces(p.col, p.row, p.w, p.h, 0, wallH);
  // In front of the corner nearest the viewer, where a flag is flown from.
  const foot = { x: f.C.x, y: f.C.y - 2 };
  const top = lift(foot, wallH + up(9));
  const flagW = 16;
  const flagH = 10;
  return (
    <>
      <line x1={foot.x} y1={foot.y} x2={top.x} y2={top.y} stroke={FLAG_POLE} strokeWidth={1.4} />
      <polygon
        points={polyPoints([
          top,
          { x: top.x + flagW, y: top.y + 2 },
          { x: top.x + flagW, y: top.y + 2 + flagH },
          { x: top.x, y: top.y + flagH },
        ])}
        fill="var(--school-primary)"
        stroke="var(--school-secondary)"
        strokeWidth={0.8}
      />
    </>
  );
}

// Stands along the back of a pitch: a raked bank of seats.
function Stands({ p }: { p: Box }) {
  const alongCol = p.w >= p.h;
  const depth = Math.min(1.6, Math.min(p.w, p.h) * 0.22);
  const c = p.col + (alongCol ? 0.6 : 0);
  const r = p.row + (alongCol ? 0 : 0.6);
  const w = alongCol ? p.w - 1.2 : depth;
  const h = alongCol ? depth : p.h - 1.2;
  const f = boxFaces(c, r, w, h, 0, up(3.2));
  const rows = [];
  for (let i = 1; i < 4; i++) {
    const v = i / 4;
    const a = onFace(f.top, 0, v);
    const b = onFace(f.top, 1, v);
    rows.push(
      <line
        key={i}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={shade(STAND, 0.8)}
        strokeWidth={0.6}
      />,
    );
  }
  return (
    <>
      {faces(f, STAND)}
      {rows}
    </>
  );
}

function Balconies({
  p,
  wallH,
  storeys,
  wall,
}: {
  p: Box;
  wallH: number;
  storeys: number;
  wall: string;
}) {
  const f = boxFaces(p.col, p.row, p.w, p.h, 0, wallH);
  const face = f.spanLeft >= f.spanRight ? f.left : f.right;
  const out = [];
  for (let s = 1; s < storeys; s++) {
    const v = s / storeys;
    const a = onFace(face, 0.04, v);
    const b = onFace(face, 0.96, v);
    out.push(
      <line
        key={s}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={shade(wall, 1.45)}
        strokeWidth={2.2}
      />,
    );
  }
  return <>{out}</>;
}

interface Box {
  col: number;
  row: number;
  w: number;
  h: number;
}

export default function BuildingFeatures({
  def,
  p,
  material,
  motif,
}: {
  def: BuildingDef;
  p: Box;
  material: Material;
  motif: Motif;
}) {
  const list = def.features;
  if (!list || list.length === 0) return null;
  const wallH = wallHeightOf(def);
  const ridge = ridgeOf(def, motif);
  const wall = material.wall;
  return (
    <g className="building-features">
      {list.map((feature: Feature) => {
        switch (feature) {
          case 'stacks':
            return <Stacks key={feature} p={p} base={wallH + ridge * 0.85} wall={wall} />;
          case 'readingRoom':
            return (
              <ReadingRoom
                key={feature}
                p={p}
                base={wallH + ridge * 0.6}
                wall={wall}
                roof={material.roof}
              />
            );
          case 'drum':
            return (
              <Drum
                key={feature}
                p={p}
                base={wallH * 0.6}
                height={wallH * 0.4 + ridge + up(3)}
                wall={wall}
              />
            );
          case 'flytower':
            return (
              <FlyTower
                key={feature}
                p={p}
                height={wallH + ridge + up(7)}
                wall={wall}
                roof={material.roof}
              />
            );
          case 'glazedEnd':
            return <GlazedEnd key={feature} p={p} wallH={wallH} />;
          case 'flagpole':
            return <Flagpole key={feature} p={p} wallH={wallH} />;
          case 'stands':
            return <Stands key={feature} p={p} />;
          case 'balconies':
            return motif === 'modern' ? (
              <Balconies
                key={feature}
                p={p}
                wallH={wallH}
                storeys={Math.max(2, def.storeys)}
                wall={wall}
              />
            ) : null;
        }
        return null;
      })}
    </g>
  );
}
