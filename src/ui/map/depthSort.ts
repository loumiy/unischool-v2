import { cameraAxes } from './iso.ts';

// Painter's order for the campus map (ported from v1's depthSort.ts): which
// of two things on the grid has to be drawn on top of the other. Not a sort
// key — no scalar is right for two rectangles — but the occlusion relation
// stated directly, and a topological sort that satisfies it, with the old
// far-corner scalar as the tie-break.

export interface DepthBox {
  col: number;
  row: number;
  w: number;
  h: number;
}

interface Axes {
  cosA: number;
  sinA: number;
}

function overlapsOnScreen(a: DepthBox, b: DepthBox, ax: Axes): boolean {
  const { cosA, sinA } = ax;
  const aX = a.col * cosA - a.row * sinA;
  const aY = a.col * sinA + a.row * cosA;
  const bX = b.col * cosA - b.row * sinA;
  const bY = b.col * sinA + b.row * cosA;
  const awx = a.w * cosA;
  const ahx = -a.h * sinA;
  const awy = a.w * sinA;
  const ahy = a.h * cosA;
  const bwx = b.w * cosA;
  const bhx = -b.h * sinA;
  const bwy = b.w * sinA;
  const bhy = b.h * cosA;
  const aX0 = aX + Math.min(0, awx) + Math.min(0, ahx);
  const aX1 = aX + Math.max(0, awx) + Math.max(0, ahx);
  const bX0 = bX + Math.min(0, bwx) + Math.min(0, bhx);
  const bX1 = bX + Math.max(0, bwx) + Math.max(0, bhx);
  if (!(aX0 < bX1 && bX0 < aX1)) return false;
  const aY0 = aY + Math.min(0, awy) + Math.min(0, ahy);
  const aY1 = aY + Math.max(0, awy) + Math.max(0, ahy);
  const bY0 = bY + Math.min(0, bwy) + Math.min(0, bhy);
  const bY1 = bY + Math.max(0, bwy) + Math.max(0, bhy);
  return aY0 < bY1 && bY0 < aY1;
}

// 1 if `a` is nearer the camera (painted after `b`), -1 if `b` is, 0 if the
// order is free.
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

function ratio(a: number, b: number): number {
  const v = a / b;
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

function nearest(b: DepthBox, ax: Axes): number {
  const { cosA, sinA } = ax;
  const rowEnd = cosA >= 0 ? b.row + b.h : b.row;
  const colEnd = sinA >= 0 ? b.col + b.w : b.col;
  if (Math.abs(cosA) >= Math.abs(sinA)) {
    const t = ratio(sinA, cosA);
    if (t === 1 && sinA > 0) return rowEnd + b.col + b.w;
    return Math.sign(cosA) * (rowEnd + colEnd * t);
  }
  const t = ratio(cosA, sinA);
  return Math.sign(sinA) * (colEnd + rowEnd * t);
}

const SMALL = 1;
function isSmall(b: DepthBox): boolean {
  return b.w <= SMALL && b.h <= SMALL;
}
const NEIGHBOURHOOD = 2;

function keyHeap(keyOf: (i: number) => number) {
  const h: number[] = [];
  const swap = (a: number, b: number) => {
    const t = h[a]!;
    h[a] = h[b]!;
    h[b] = t;
  };
  return {
    get size(): number {
      return h.length;
    },
    push(i: number): void {
      h.push(i);
      for (let c = h.length - 1; c > 0;) {
        const p = (c - 1) >> 1;
        if (keyOf(h[p]!) <= keyOf(h[c]!)) break;
        swap(p, c);
        c = p;
      }
    },
    pop(): number {
      const top = h[0]!;
      const last = h.pop()!;
      if (h.length > 0) {
        h[0] = last;
        for (let p = 0; ;) {
          const l = p * 2 + 1;
          const r = l + 1;
          let m = p;
          if (l < h.length && keyOf(h[l]!) < keyOf(h[m]!)) m = l;
          if (r < h.length && keyOf(h[r]!) < keyOf(h[m]!)) m = r;
          if (m === p) break;
          swap(p, m);
          p = m;
        }
      }
      return top;
    },
  };
}

// The scene in painter's order: back to front. Returns the SAME objects,
// reordered. Masses are compared pairwise; small things (trees, props) are
// compared with every mass but with each other only within a tile or two.
export function depthOrder<T extends DepthBox>(items: readonly T[], ax: Axes = cameraAxes()): T[] {
  const n = items.length;
  if (n < 2) return items.slice();

  const after: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Uint32Array(n);
  const link = (first: number, second: number) => {
    after[first]!.push(second);
    indegree[second]! += 1;
  };
  const relate = (i: number, j: number) => {
    const v = occludes(items[i]!, items[j]!, ax);
    if (v === 1) link(j, i);
    else if (v === -1) link(i, j);
  };

  const large: number[] = [];
  const small: number[] = [];
  for (let i = 0; i < n; i++) (isSmall(items[i]!) ? small : large).push(i);

  for (let a = 0; a < large.length; a++) {
    for (let b = a + 1; b < large.length; b++) relate(large[a]!, large[b]!);
  }
  for (const s of small) for (const l of large) relate(s, l);

  const buckets = new Map<string, number[]>();
  for (const s of small) {
    const key = `${Math.floor(items[s]!.row)},${Math.floor(items[s]!.col)}`;
    const at = buckets.get(key);
    if (at) at.push(s);
    else buckets.set(key, [s]);
  }
  for (const s of small) {
    const r0 = Math.floor(items[s]!.row);
    const c0 = Math.floor(items[s]!.col);
    for (let dr = -NEIGHBOURHOOD; dr <= NEIGHBOURHOOD; dr++) {
      for (let dc = -NEIGHBOURHOOD; dc <= NEIGHBOURHOOD; dc++) {
        for (const o of buckets.get(`${r0 + dr},${c0 + dc}`) ?? []) {
          if (o > s) relate(s, o);
        }
      }
    }
  }

  const ready = keyHeap((i) => nearest(items[i]!, ax));
  for (let i = 0; i < n; i++) if (indegree[i] === 0) ready.push(i);

  const out: T[] = [];
  const drawn = new Uint8Array(n);
  while (out.length < n) {
    if (ready.size === 0) {
      let fallback = -1;
      for (let i = 0; i < n; i++) {
        if (drawn[i]) continue;
        if (fallback < 0 || nearest(items[i]!, ax) < nearest(items[fallback]!, ax)) fallback = i;
      }
      if (fallback < 0) break;
      indegree[fallback] = 0;
      ready.push(fallback);
    }
    const u = ready.pop();
    if (drawn[u]) continue;
    drawn[u] = 1;
    out.push(items[u]!);
    for (const v of after[u]!) {
      indegree[v]! -= 1;
      if (indegree[v] === 0 && !drawn[v]) ready.push(v);
    }
  }
  return out;
}
