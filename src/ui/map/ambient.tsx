import { useEffect, useRef } from 'react';
import { buildingById } from '../../content/buildings.ts';
import { enrolled, SPEED_MULTIPLIER, type GameState, type Placement } from '../../sim/index.ts';
import { MAX_WALKERS, STUDENTS_PER_WALKER } from '../../tuning.ts';
import { wallHeightOf } from './buildingSpec.ts';
import { boxFaces, heightScale, project, type Camera, type Pt } from './iso.ts';
import { doors, findRoute, roadsides, walkGrid, type Waypoint } from './routes.ts';
import { ambientDensity } from './season.ts';
import { useGame } from '../useGame.ts';

// AMBIENT LIFE (DD §6.3): students walking real routes between the
// buildings they use, as many as the enrolment and the term warrant, up to
// a cap. Presentational through and through — derived from sim state,
// never simulated in it, animated on the browser's frame clock with the
// map's own random numbers, and drawn imperatively (one <g> a walker,
// moved by attribute) so sixty of them cost the SVG a few hundred nodes and
// React nothing at all.

// Tiles a second at 1×. The crowd keeps the clock's own pace, so 8× looks
// like 8× rather than like a fast year watched by people out for a stroll
// (Phase 21B). DD §6.3 has them stopping with the clock; this is the rest
// of that sentence.
const WALK_SPEED = 1.35;
const LINGER_MS = [600, 2600] as const; // at a door, before setting off again
const SHIRTS = ['#c94b4b', '#3d6a9c', '#e0b64a', '#5b8a5b', '#8c5a9c', '#e88a4a', '#f2ede2'];

// The map's own randomness (mulberry32), never the sim's stream.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Walker {
  el: SVGGElement;
  route: Waypoint[];
  lengths: number[]; // cumulative, in tiles
  u: number; // distance along the route
  from: { col: number; row: number }; // the tile the route starts on
  at: { col: number; row: number }; // where the route ends (a door tile)
  waitUntil: number;
}

// A building's silhouette on screen: a walker inside it and behind its
// front edge is out of sight.
interface Silhouette {
  minX: number;
  maxX: number;
  minY: number;
  front: Pt[]; // D → C → B, left to right
}

function silhouettes(placements: readonly Placement[]): Silhouette[] {
  const out: Silhouette[] = [];
  for (const p of placements) {
    const def = buildingById(p.buildingId);
    if (def.form === 'grounds') continue;
    const height = p.status === 'open' ? wallHeightOf(def) : Math.max(4, wallHeightOf(def) * 0.16);
    const f = boxFaces(p.col, p.row, p.w, p.h, 0, height);
    const pts = [f.A, f.B, f.C, f.D, f.At, f.Bt, f.Ct, f.Dt];
    const front = [f.D, f.C, f.B].sort((a, b) => a.x - b.x);
    out.push({
      minX: Math.min(...pts.map((q) => q.x)),
      maxX: Math.max(...pts.map((q) => q.x)),
      minY: Math.min(...pts.map((q) => q.y)),
      front,
    });
  }
  return out;
}

function hiddenBy(s: Silhouette, p: Pt): boolean {
  if (p.x < s.minX || p.x > s.maxX || p.y < s.minY) return false;
  const [a, b, c] = s.front as [Pt, Pt, Pt];
  const seg = p.x <= b.x ? [a, b] : [b, c];
  const t = seg[1]!.x === seg[0]!.x ? 0 : (p.x - seg[0]!.x) / (seg[1]!.x - seg[0]!.x);
  const frontY = seg[0]!.y + (seg[1]!.y - seg[0]!.y) * Math.max(0, Math.min(1, t));
  return p.y < frontY;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// A walker stands up, so it answers the tilt like the trees do: as the
// camera leans overhead the body squats and widens into shoulders and the
// head becomes most of what is left, which is what a person is from the
// air. It keeps a fifth of its height whatever the view, because a figure
// that foreshortens to nothing takes the crowd off the lawn with it.
const WALKER_FLOOR = 0.22;
const WALKER_SPREAD = 0.55;
const WALKER_HALF_W = 3.1;

function shapeWalker(g: SVGGElement): void {
  const standing = Math.max(0, Math.min(1, heightScale()));
  const s = WALKER_FLOOR + (1 - WALKER_FLOOR) * standing;
  const half = WALKER_HALF_W * (1 + (1 - s) * WALKER_SPREAD);
  const n = (v: number) => v.toFixed(2);
  g.querySelector('.walker-body')?.setAttribute(
    'd',
    `M${n(-half)},0 L${n(-half)},${n(-8.5 * s)} Q0,${n(-11 * s)} ${n(half)},${n(-8.5 * s)} L${n(half)},0 Z`,
  );
  const head = g.querySelector('.walker-head');
  head?.setAttribute('cy', n(-12.6 * s));
  head?.setAttribute('r', n(3 * (1 + (1 - s) * 0.18)));
}

function makeWalker(shirt: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'walker');
  const shadow = document.createElementNS(SVG_NS, 'ellipse');
  shadow.setAttribute('class', 'walker-shadow');
  shadow.setAttribute('rx', '4.2');
  shadow.setAttribute('ry', '2.1');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('class', 'walker-body');
  body.setAttribute('fill', shirt);
  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('class', 'walker-head');
  g.append(shadow, body, head);
  shapeWalker(g);
  return g;
}

function measure(route: Waypoint[]): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    out.push(out[i - 1]! + Math.hypot(b.col - a.col, b.row - a.row));
  }
  return out;
}

function along(route: Waypoint[], lengths: number[], u: number): { col: number; row: number } {
  const total = lengths[lengths.length - 1] ?? 0;
  if (total === 0 || u <= 0) return route[0]!;
  if (u >= total) return route[route.length - 1]!;
  let i = 1;
  while (lengths[i]! < u) i++;
  const a = route[i - 1]!;
  const b = route[i]!;
  const t = (u - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!);
  return { col: a.col + (b.col - a.col) * t, row: a.row + (b.row - a.row) * t };
}

export default function AmbientLayer({ state, camera }: { state: GameState; camera: Camera }) {
  const { speed } = useGame();
  const layerRef = useRef<SVGGElement>(null);
  const walkersRef = useRef<Walker[]>([]);
  const randomRef = useRef(rng(0x5eed));
  const density = ambientDensity(state.clock);
  const students = enrolled(state);
  const { campus } = state;
  const running = speed !== 'paused';
  // How fast the crowd walks: the clock's own multiplier, so the lawn is as
  // busy as the year is fast. Held in a ref and read inside the frame loop,
  // because changing speed should change the pace of the walk in progress,
  // not tear the crowd down and build a new one.
  const gaitRef = useRef(SPEED_MULTIPLIER[speed]);
  useEffect(() => {
    gaitRef.current = SPEED_MULTIPLIER[speed];
  }, [speed]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const random = randomRef.current;
    const grid = walkGrid(campus);
    const stops = doors(campus, grid);
    const edges = roadsides(grid);
    if (stops.length === 0 && edges.length === 0) return;
    const shapes = silhouettes(campus.placements);
    const routes = new Map<string, Waypoint[] | null>();
    const routeBetween = (a: { col: number; row: number }, b: { col: number; row: number }) => {
      const key = `${a.col},${a.row}-${b.col},${b.row}`;
      let r = routes.get(key);
      if (r === undefined) {
        r = findRoute(grid, a, b);
        routes.set(key, r);
      }
      return r;
    };
    // Somewhere to go: a door, weighted, or the roadside when the campus
    // has nothing else (or one in five times regardless: town).
    const pickStop = (notAt: { col: number; row: number } | null) => {
      const pool = stops.filter(
        (s) => !notAt || s.door.col !== notAt.col || s.door.row !== notAt.row,
      );
      if (pool.length === 0 || (edges.length > 0 && random() < 0.2)) {
        const e = edges[Math.floor(random() * edges.length)];
        if (e) return { col: e.col, row: e.row };
        if (pool.length === 0) return null;
      }
      const total = pool.reduce((t, s) => t + s.weight, 0);
      let pick = random() * total;
      for (const s of pool) {
        pick -= s.weight;
        if (pick <= 0) return { col: s.door.col, row: s.door.row };
      }
      return { col: pool[pool.length - 1]!.door.col, row: pool[pool.length - 1]!.door.row };
    };
    const setOff = (w: Walker, from: { col: number; row: number } | null, now: number) => {
      for (let tries = 0; tries < 6; tries++) {
        const a = from ?? pickStop(null);
        const b = pickStop(a);
        if (!a || !b) break;
        const route = routeBetween(a, b);
        if (route && route.length > 1) {
          w.route = route;
          w.lengths = measure(route);
          w.u = 0;
          w.from = a;
          w.at = b;
          w.waitUntil = now + LINGER_MS[0] + random() * (LINGER_MS[1] - LINGER_MS[0]);
          return true;
        }
        from = null;
      }
      return false;
    };
    // The crowd: the enrolment by the term, a few visitors before it exists.
    const want = Math.min(
      MAX_WALKERS,
      Math.max(students > 0 ? 0 : 3, Math.round((students / STUDENTS_PER_WALKER) * density)),
    );
    const walkers = walkersRef.current;
    while (walkers.length > want) walkers.pop()!.el.remove();
    while (walkers.length < want) {
      const el = makeWalker(SHIRTS[Math.floor(random() * SHIRTS.length)]!);
      layer.append(el);
      const w: Walker = {
        el,
        route: [],
        lengths: [0],
        u: 0,
        from: { col: 0, row: 0 },
        at: { col: 0, row: 0 },
        waitUntil: 0,
      };
      if (!setOff(w, null, performance.now())) {
        el.remove();
        break;
      }
      // Start partway along, so a fresh crowd is not one queue at a door.
      w.u = random() * (w.lengths[w.lengths.length - 1] ?? 0);
      walkers.push(w);
    }
    // Figures already on the lawn are kept across a re-run, so a new tilt
    // has to reach them here rather than waiting for them to be replaced.
    for (const w of walkers) shapeWalker(w.el);
    // Routes may have gone stale (a building placed, a path paved): a
    // walker whose way is blocked sets off afresh; one whose route merely
    // changed takes the new one from where it stands.
    for (const w of walkers) {
      const fresh = w.route.length >= 2 ? routeBetween(w.from, w.at) : null;
      if (!fresh) setOff(w, null, performance.now());
      else if (fresh !== w.route) {
        w.route = fresh;
        w.lengths = measure(fresh);
        w.u = Math.min(w.u, w.lengths[w.lengths.length - 1] ?? 0);
      }
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const w of walkers) {
        const total = w.lengths[w.lengths.length - 1] ?? 0;
        if (running) {
          if (w.u >= total) {
            if (now >= w.waitUntil) setOff(w, w.at, now);
          } else {
            w.u = Math.min(total, w.u + WALK_SPEED * gaitRef.current * dt);
            if (w.u >= total)
              w.waitUntil = now + LINGER_MS[0] + random() * (LINGER_MS[1] - LINGER_MS[0]);
          }
        }
        const pos = along(w.route, w.lengths, w.u);
        const p = project(pos.col, pos.row);
        const hidden = shapes.some((s) => hiddenBy(s, p));
        w.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
        w.el.setAttribute('visibility', hidden ? 'hidden' : 'visible');
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // The camera changes the projection the silhouettes are built on.
  }, [campus, students, density, running, camera]);

  return <g ref={layerRef} className="campus-ambient" aria-hidden="true" />;
}
