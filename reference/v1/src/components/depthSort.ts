// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Painter's order for the campus map: which of two things on the grid has to
// be drawn on top of the other.
//
// On an angled map the draw ORDER *is* the occlusion — there is no depth
// buffer, so a thing nearer the camera is simply drawn later. Getting that
// order wrong does not look like a sorting bug, it looks like a building made
// of glass: something behind paints over something in front of it.
//
// WHY THIS ISN'T A SORT KEY. The map used to sort on one scalar, the
// footprint's far corner (`row + h + col + w`). That is exactly right for two
// POINTS and cannot be right for two RECTANGLES, because whether A occludes B
// depends on how the two are SEPARATED, not on where their far corners land.
// A 12-wide hall on rows 0-1 scores 13; a 2x2 lab standing directly in front
// of its left end, on rows 1-3, scores 5 — so the lab is drawn first and the
// hall paints straight over it. Measured against the real footprint catalogue,
// the scalar mis-ordered about 15% of the pairs that overlap on screen.
//
// No scalar can fix that, so this module doesn't look for a better one. It
// states the occlusion relation directly and produces an order that satisfies
// it — a topological sort, with the OLD scalar kept as the tie-break. Where
// the relation leaves the order free (which is most pairs) the scene therefore
// falls back to exactly what it drew before: this is a repair of the previous
// order, not a different-looking map.
//
// It is also what camera rotation needs. `row + h + col + w` hard-codes the
// camera — it assumes increasing col runs down-right and increasing row
// down-left. Turn the camera 90 degrees and that key is not 15% wrong, it is
// inverted. `occludes` below takes the camera's axes as an input instead of
// baking them into an arithmetic expression, which is the difference between
// a rotating camera being a transform and being a rewrite.
//
// Pure geometry: no React, no game state, no colour, same as isoProjection.ts.
// The camera enters as two numbers (which way each grid axis runs on screen),
// defaulting to the projection's current camera so the map need not pass it.

import { cameraAxes } from './isoProjection';

// The tiles a thing stands on. Whole tiles for a placed Buildable, a single
// tile for a tree, a fraction of one for a hedge or a fountain — the relation
// below never assumes integers.
export interface DepthBox {
  col: number; row: number; w: number; h: number;
}

// Could the CAMERA see these two overlap at all? The screen axes are a
// rotation of the grid axes by the camera's azimuth (see isoProjection's
// cameraAxes: across-screen is col * cosA - row * sinA, down-screen is
// col * sinA + row * cosA), so this asks whether the two footprints' extents
// overlap on both — a handful of multiplications, no allocation. At the
// default 45-degree camera those two axes are (col - row) and (col + row).
//
// CONSERVATIVE ON PURPOSE. The image of a grid rectangle is a rhombus, so
// testing its extent on those two axes tests its BOUNDING box, not the
// rhombus itself: two footprints that only touch along an edge are admitted
// as overlapping. That is the safe direction to be wrong in. An extra pair
// admitted only costs an ordering constraint that was already true; a pair
// wrongly rejected would leave a real occlusion unordered.
//
// What the gate must never admit is a pair separated on BOTH grid axes with
// the two axes disagreeing about which is nearer (at the default camera: one
// up-left of the other, one down-right). Those get two contradictory answers
// out of `occludes`, and they are allowed to, because they sit on opposite
// sides of the screen's across axis and never touch. It cannot admit them:
// the two separations push their across-screen extents apart in the same
// direction, so those extents cannot strictly overlap and the gate rejects.
// Consistency comes from that, and it is why the topological sort below never
// finds a cycle at any azimuth — the standard result that axis-parallel boxes
// always admit a painter's order under any orthographic view.
//
// This gate is about GROUND rhombuses, and a building is taller than its
// ground. That is safe too, and worth stating because it looks like it
// shouldn't be. Two footprints this rejects are separated along one of the two
// screen axes. Separated ACROSS the screen, no amount of height can bring them
// together, because height only moves a mass UP — so no order is needed.
// Separated DOWN the screen, height genuinely can carry the nearer mass over
// the farther one's base — but then the nearer footprint's whole extent lies
// beyond the farther one's far corner, so `nearest` below already orders the
// two correctly and the tie-break is not a guess. Either way the answer comes
// out right without the gate having to know how tall anything is.
interface Axes { cosA: number; sinA: number; }
function overlapsOnScreen(a: DepthBox, b: DepthBox, ax: Axes): boolean {
  const { cosA, sinA } = ax;
  // Extents of a's rhombus on the across axis (X) and the down axis (Y).
  const aX = a.col * cosA - a.row * sinA; const aY = a.col * sinA + a.row * cosA;
  const bX = b.col * cosA - b.row * sinA; const bY = b.col * sinA + b.row * cosA;
  const awx = a.w * cosA; const ahx = -a.h * sinA; const awy = a.w * sinA; const ahy = a.h * cosA;
  const bwx = b.w * cosA; const bhx = -b.h * sinA; const bwy = b.w * sinA; const bhy = b.h * cosA;
  const aX0 = aX + Math.min(0, awx) + Math.min(0, ahx); const aX1 = aX + Math.max(0, awx) + Math.max(0, ahx);
  const bX0 = bX + Math.min(0, bwx) + Math.min(0, bhx); const bX1 = bX + Math.max(0, bwx) + Math.max(0, bhx);
  if (!(aX0 < bX1 && bX0 < aX1)) return false;
  const aY0 = aY + Math.min(0, awy) + Math.min(0, ahy); const aY1 = aY + Math.max(0, awy) + Math.max(0, ahy);
  const bY0 = bY + Math.min(0, bwy) + Math.min(0, bhy); const bY1 = bY + Math.max(0, bwy) + Math.max(0, bhy);
  return aY0 < bY1 && bY0 < aY1;
}

// Which of two footprints is nearer the camera: 1 if `a` is (so `a` is painted
// AFTER `b`), -1 if `b` is, 0 if they never overlap and the order is free.
//
// THE SEPARATING AXIS IS THE WHOLE ANSWER. Two disjoint axis-aligned
// rectangles are always separated along at least one axis — that is just the
// separating-axis theorem for boxes — and the camera says which way each grid
// axis runs toward it: increasing col is nearer when sinA > 0, increasing row
// when cosA > 0 (at the default camera both are, so greater col is down-right
// and greater row down-left). So whichever box sits further along the axis
// that separates them, in the direction that axis runs toward the camera, is
// the nearer one, and that is the entire test. At an exact cardinal azimuth
// one axis runs straight across the screen and says nothing about depth; two
// boxes separated on it are then side by side and the gate has already
// rejected them.
//
// Footprints of placed Buildables are disjoint by construction (see
// campusMap.ts's footprintIsClear), and a tree is only ever on an unbuilt
// tile, so the disjointness this relies on is enforced upstream rather than
// assumed here. Two boxes that genuinely overlap fall through to 0 and keep
// whatever order the tie-break gives them, which is the only sane answer for
// two things occupying the same ground.
export function occludes(a: DepthBox, b: DepthBox, ax: Axes = cameraAxes()): -1 | 0 | 1 {
  if (!overlapsOnScreen(a, b, ax)) return 0;
  const colNear = Math.sign(ax.sinA) as -1 | 0 | 1;
  const rowNear = Math.sign(ax.cosA) as -1 | 0 | 1;
  if (a.col >= b.col + b.w) return colNear;
  if (b.col >= a.col + a.w) return -colNear as -1 | 0 | 1;
  if (a.row >= b.row + b.h) return rowNear;
  if (b.row >= a.row + a.h) return -rowNear as -1 | 0 | 1;
  return 0;
}

// The old scalar key, demoted to a TIE-BREAK. Everywhere the occlusion
// relation is indifferent, the scene keeps drawing in the order it always did.
//
// It is the down-screen coordinate of the footprint's NEAREST corner, up to a
// positive rescaling: the row and col ends nearest the camera, weighted by
// how steeply each axis runs toward it. At the default camera the two weights
// are equal and this is `row + h + col + w` — in that exact arithmetic, so two
// boxes that shared the ground and tied on the old key still tie here and
// keep the order they had.
function nearest(b: DepthBox, ax: Axes): number {
  const { cosA, sinA } = ax;
  const rowEnd = cosA >= 0 ? b.row + b.h : b.row;
  const colEnd = sinA >= 0 ? b.col + b.w : b.col;
  if (Math.abs(cosA) >= Math.abs(sinA)) {
    const t = ratio(sinA, cosA);
    if (t === 1 && sinA > 0) return (rowEnd + b.col) + b.w;   // the old key, to the bit
    return Math.sign(cosA) * (rowEnd + colEnd * t);
  }
  const t = ratio(cosA, sinA);
  return Math.sign(sinA) * (colEnd + rowEnd * t);
}
// a / b, snapped to an integer where floating point put it within an ulp or
// two of one — sin and cos of the same 45-degree angle differ in their last
// digit, and the tie-break above wants their ratio to be exactly 1 there.
function ratio(a: number, b: number): number {
  const v = a / b;
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

// Anything this size or smaller is treated as standing on a point rather than
// covering ground: one tile is the tree, the hedge, the fountain, the rooftop
// unit. It matters because a small thing can only be occluded by another small
// thing in its immediate neighbourhood (two boxes of at most a tile overlap on
// screen only if their origins are within a tile of each other on both axes),
// which is what keeps this from being O(n^2) over eight hundred trees.
const SMALL = 1;
function isSmall(b: DepthBox): boolean {
  return b.w <= SMALL && b.h <= SMALL;
}
// How far the neighbourhood scan reaches, in tiles. Two, not one: the boxes
// are placed at fractional coordinates, so two that are within a tile of each
// other can still land in buckets two apart. The bound holds at every
// azimuth: the screen bounding box of a one-tile footprint is at most sqrt2
// tiles a side, so two that overlap on screen have origins under two tiles
// apart on each grid axis.
const NEIGHBOURHOOD = 2;

// A binary heap of item indices ordered by the tie-break key, so Kahn's
// algorithm below releases ready items in the old scalar order rather than in
// whatever order they happened to become ready. Small enough to spell out; a
// sorted array would be O(n^2) on a scene of this size.
function keyHeap(keyOf: (i: number) => number) {
  const h: number[] = [];
  const swap = (a: number, b: number) => { const t = h[a]; h[a] = h[b]; h[b] = t; };
  return {
    get size(): number { return h.length; },
    push(i: number): void {
      h.push(i);
      for (let c = h.length - 1; c > 0;) {
        const p = (c - 1) >> 1;
        if (keyOf(h[p]) <= keyOf(h[c])) break;
        swap(p, c);
        c = p;
      }
    },
    pop(): number {
      const top = h[0];
      const last = h.pop()!;
      if (h.length > 0) {
        h[0] = last;
        for (let p = 0;;) {
          const l = p * 2 + 1; const r = l + 1;
          let m = p;
          if (l < h.length && keyOf(h[l]) < keyOf(h[m])) m = l;
          if (r < h.length && keyOf(h[r]) < keyOf(h[m])) m = r;
          if (m === p) break;
          swap(p, m);
          p = m;
        }
      }
      return top;
    },
  };
}

// The scene in painter's order: back to front, ready to map straight into
// elements. Returns the SAME objects it was given, reordered — the caller
// carries whatever it likes on them.
//
// Two tiers, because the scene has two kinds of thing in it and treating them
// alike is what would make this too slow to run. The masses — at most a few
// dozen placed buildings — get compared with each other pairwise. The small
// things — hundreds of trees and props — are compared with every mass, but
// with each other only across the handful of tiles close enough to overlap
// them on screen. A full scene (about seventy buildings and eight hundred
// trees) costs a few milliseconds, and the caller memoises it on the state it
// reads, so it runs when the campus changes rather than when the mouse moves.
export function depthOrder<T extends DepthBox>(items: readonly T[], ax: Axes = cameraAxes()): T[] {
  const n = items.length;
  if (n < 2) return items.slice();

  // after[i] holds the items that must be drawn AFTER item i.
  const after: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Uint32Array(n);
  const link = (first: number, second: number) => {
    after[first].push(second);
    indegree[second] += 1;
  };
  const relate = (i: number, j: number) => {
    const v = occludes(items[i], items[j], ax);
    if (v === 1) link(j, i);
    else if (v === -1) link(i, j);
  };

  const large: number[] = [];
  const small: number[] = [];
  for (let i = 0; i < n; i++) (isSmall(items[i]) ? small : large).push(i);

  // Mass against mass, and every small thing against every mass.
  for (let a = 0; a < large.length; a++) {
    for (let b = a + 1; b < large.length; b++) relate(large[a], large[b]);
  }
  for (const s of small) for (const l of large) relate(s, l);

  // Small against small, but only within a tile or two — see NEIGHBOURHOOD.
  // Without this a tree that happens to be free of every building could be
  // released ahead of one waiting behind a hall, and land in front of it.
  const buckets = new Map<string, number[]>();
  for (const s of small) {
    const key = `${Math.floor(items[s].row)},${Math.floor(items[s].col)}`;
    const at = buckets.get(key);
    if (at) at.push(s); else buckets.set(key, [s]);
  }
  for (const s of small) {
    const r0 = Math.floor(items[s].row); const c0 = Math.floor(items[s].col);
    for (let dr = -NEIGHBOURHOOD; dr <= NEIGHBOURHOOD; dr++) {
      for (let dc = -NEIGHBOURHOOD; dc <= NEIGHBOURHOOD; dc++) {
        for (const o of buckets.get(`${r0 + dr},${c0 + dc}`) ?? []) {
          if (o > s) relate(s, o);   // each pair once
        }
      }
    }
  }

  const ready = keyHeap((i) => nearest(items[i], ax));
  for (let i = 0; i < n; i++) if (indegree[i] === 0) ready.push(i);

  const out: T[] = [];
  const drawn = new Uint8Array(n);
  while (out.length < n) {
    if (ready.size === 0) {
      // Unreachable for the footprints this map can produce: the screen-overlap
      // gate in `occludes` is what makes the relation consistent, and a sweep
      // over random layouts of the whole catalogue finds no cycle (see
      // test/depth-sort.test.ts). Kept anyway, and kept CHEAP, because the
      // alternative to a defensive release here is dropping a building off the
      // map — release whatever is left in the old scalar order and carry on.
      let fallback = -1;
      for (let i = 0; i < n; i++) {
        if (drawn[i]) continue;
        if (fallback < 0 || nearest(items[i], ax) < nearest(items[fallback], ax)) fallback = i;
      }
      if (fallback < 0) break;
      indegree[fallback] = 0;
      ready.push(fallback);
    }
    const u = ready.pop();
    if (drawn[u]) continue;
    drawn[u] = 1;
    out.push(items[u]);
    for (const v of after[u]) {
      indegree[v] -= 1;
      if (indegree[v] === 0 && !drawn[v]) ready.push(v);
    }
  }
  return out;
}
