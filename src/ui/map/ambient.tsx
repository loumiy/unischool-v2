import { useEffect, useRef } from 'react';
import {
  effectiveDef,
  enrolled,
  SPEED_MULTIPLIER,
  type GameState,
  type Placement,
} from '../../sim/index.ts';
import { MAX_WALKERS, STUDENTS_PER_WALKER } from '../../tuning.ts';
import { wallHeightOf } from './buildingSpec.ts';
import { boxFaces, cameraAxes, heightScale, project, type Camera, type Pt } from './iso.ts';
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
  el: SVGGElement; // the outermost group: what is appended and removed
  mover: SVGGElement; // the one that carries the walk's transform
  clips: SVGGElement[]; // the groups a building's outline is hung on
  clipIds: (string | null)[]; // what each currently carries, to avoid rewrites
  route: Waypoint[];
  lengths: number[]; // cumulative, in tiles
  u: number; // distance along the route
  from: { col: number; row: number }; // the tile the route starts on
  at: { col: number; row: number }; // where the route ends (a door tile)
  waitUntil: number;
}

// A BUILDING'S SILHOUETTE ON SCREEN, and what it does to a walker behind it
// (DD §6.3: "walkers hide behind the walls they pass").
//
// A walker used to be switched off whole the moment its feet crossed a
// building's front edge, so the crowd popped out of existence at a wall and
// back into it on the far side. What a wall does to a person is CUT them:
// they slide behind it a shoulder at a time, and they are still there when
// half of them shows past its corner. So a walker occluded by a building is
// now clipped by that building's outline rather than hidden — which also
// means the half of a figure that is past the corner, or standing higher up
// the screen than the roof, stays drawn, because it is genuinely in sight.
interface Silhouette {
  // The footprint, for the depth test: which of the two is nearer.
  col: number;
  row: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  hull: Pt[]; // the outline on screen, in order
}

// The convex hull of a projected box IS its silhouette: eight corners, of
// which six make the outline. Monotone chain, since the corners arrive in no
// useful order once the camera has turned.
export function hullOf(pts: Pt[]): Pt[] {
  const ps = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (input: Pt[]) => {
    const out: Pt[] = [];
    for (const q of input) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0)
        out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(ps), ...half([...ps].reverse())];
}

function silhouettes(placements: readonly Placement[]): Silhouette[] {
  const out: Silhouette[] = [];
  for (const p of placements) {
    const def = effectiveDef(p);
    if (def.form === 'grounds') continue;
    const height = p.status === 'open' ? wallHeightOf(def) : Math.max(4, wallHeightOf(def) * 0.16);
    const f = boxFaces(p.col, p.row, p.w, p.h, 0, height);
    const pts = [f.A, f.B, f.C, f.D, f.At, f.Bt, f.Ct, f.Dt];
    out.push({
      col: p.col,
      row: p.row,
      w: p.w,
      h: p.h,
      minX: Math.min(...pts.map((q) => q.x)),
      maxX: Math.max(...pts.map((q) => q.x)),
      minY: Math.min(...pts.map((q) => q.y)),
      maxY: Math.max(...pts.map((q) => q.y)),
      hull: hullOf(pts),
    });
  }
  return out;
}

// Is the building nearer the camera than a walker standing at this tile?
// The same relation depthSort.ts paints the campus by, for a point rather
// than a box: whichever side of the footprint the walker is on, the near
// direction decides.
export function nearerThanWalker(
  s: { col: number; row: number; w: number; h: number },
  wc: number,
  wr: number,
  sinA: number,
  cosA: number,
): boolean {
  if (s.col >= wc) return sinA > 0;
  if (wc >= s.col + s.w) return sinA < 0;
  if (s.row >= wr) return cosA > 0;
  if (wr >= s.row + s.h) return cosA < 0;
  return false; // standing on the footprint: nothing sensible to say
}

// How many buildings may cut one walker. Two covers a figure passing the
// corner of one hall in front of another; a third occluder would have to
// overlap the same few pixels, and pays for a clip group nobody would see.
const CLIPS_PER_WALKER = 2;
// The clip is "everything except this building", so it needs a field big
// enough to be the rest of the world.
const CLIP_FIELD = 1e5;
// How far a figure reaches above the tile it stands on, for deciding which
// outlines could possibly cut it.
const WALKER_REACH = 20;
function clipId(i: number): string {
  return `walker-behind-${i}`;
}

// One clipPath per building: the whole field with the building's outline
// punched out of it, so anything clipped by it is drawn everywhere EXCEPT
// where that building stands.
function writeClips(layer: SVGGElement, shapes: Silhouette[]): void {
  let defs = layer.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    layer.prepend(defs);
  }
  defs.textContent = '';
  const field = `M${-CLIP_FIELD},${-CLIP_FIELD} H${CLIP_FIELD} V${CLIP_FIELD} H${-CLIP_FIELD} Z`;
  for (const [i, s] of shapes.entries()) {
    const cp = document.createElementNS(SVG_NS, 'clipPath');
    cp.setAttribute('id', clipId(i));
    cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('clip-rule', 'evenodd');
    // The same rule as fill, so the shape can be queried (isPointInFill)
    // as well as clipped with.
    path.setAttribute('fill-rule', 'evenodd');
    const outline = s.hull.map(
      (q, j) => `${j === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`,
    );
    path.setAttribute('d', `${field} ${outline.join(' ')} Z`);
    cp.append(path);
    defs.append(cp);
  }
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

// A walker is a stack: the clip groups outermost, because a clip in user
// space must not be dragged around by the transform that moves the figure,
// then the mover, then the figure itself.
function makeWalker(shirt: string): {
  el: SVGGElement;
  mover: SVGGElement;
  clips: SVGGElement[];
} {
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
  const clips: SVGGElement[] = [];
  let outer: SVGGElement = g;
  for (let i = 0; i < CLIPS_PER_WALKER; i++) {
    const c = document.createElementNS(SVG_NS, 'g');
    c.append(outer);
    clips.push(c);
    outer = c;
  }
  return { el: outer, mover: g, clips };
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
    const ax = cameraAxes();
    writeClips(layer, shapes);
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
      const made = makeWalker(SHIRTS[Math.floor(random() * SHIRTS.length)]!);
      layer.append(made.el);
      const w: Walker = {
        el: made.el,
        mover: made.mover,
        clips: made.clips,
        clipIds: made.clips.map(() => null),
        route: [],
        lengths: [0],
        u: 0,
        from: { col: 0, row: 0 },
        at: { col: 0, row: 0 },
        waitUntil: 0,
      };
      if (!setOff(w, null, performance.now())) {
        made.el.remove();
        break;
      }
      // Start partway along, so a fresh crowd is not one queue at a door.
      w.u = random() * (w.lengths[w.lengths.length - 1] ?? 0);
      walkers.push(w);
    }
    // Figures already on the lawn are kept across a re-run, so a new tilt
    // has to reach them here rather than waiting for them to be replaced.
    for (const w of walkers) shapeWalker(w.mover);
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
        w.mover.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
        // Whatever stands between this walker and the camera cuts them.
        let slot = 0;
        for (let i = 0; i < shapes.length && slot < CLIPS_PER_WALKER; i++) {
          const s = shapes[i]!;
          if (p.x < s.minX - WALKER_REACH || p.x > s.maxX + WALKER_REACH) continue;
          if (p.y < s.minY - WALKER_REACH || p.y > s.maxY + WALKER_REACH) continue;
          if (!nearerThanWalker(s, pos.col, pos.row, ax.sinA, ax.cosA)) continue;
          const id = `url(#${clipId(i)})`;
          if (w.clipIds[slot] !== id) {
            w.clips[slot]!.setAttribute('clip-path', id);
            w.clipIds[slot] = id;
          }
          slot++;
        }
        for (; slot < CLIPS_PER_WALKER; slot++) {
          if (w.clipIds[slot] !== null) {
            w.clips[slot]!.removeAttribute('clip-path');
            w.clipIds[slot] = null;
          }
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // The camera changes the projection the silhouettes are built on.
  }, [campus, students, density, running, camera]);

  // Gowns on the lawn in the weeks of Convocation and Commencement
  // (Phase 47).
  const c = state.clock;
  const gowned = (c.term === 'fall' || c.term === 'summer') && c.week <= 2;
  return (
    <g ref={layerRef} className={`campus-ambient ${gowned ? 'gowned' : ''}`} aria-hidden="true" />
  );
}
