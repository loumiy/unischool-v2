import { memo, useMemo } from 'react';
import { buildingById } from '../../content/buildings.ts';
import { GRID_WIDTH, TERRAIN, type Campus, type Placement } from '../../sim/index.ts';
import { boxFaces, project, type Camera, type Pt } from './iso.ts';
import { layoutKey } from './layout.ts';
import { doors, walkGrid } from './routes.ts';
import { up } from './scale.ts';

// A CAMPUS THAT IS USED (Phase 47): what the calendar puts on the map
// beyond the walkers. A crowd in the stands in the weeks the teams play, a
// queue at the dining halls while term is on, and traffic on the road as
// heavy as the college is big. All of it read from the calendar and the
// state, drawn from the map's own dice, and deaf to the pointer.

const CROWD = ['#c94b4b', '#3d6a9c', '#e0b64a', '#f2ede2', '#5b8a5b'];
const CAR = ['#b8413c', '#3b5d8a', '#e2dfd6', '#2f3437', '#6b8f5e'];

function Crowd({ p }: { p: Placement }) {
  // The stands run along the back of the pitch (features.tsx's Stands).
  const alongCol = p.w >= p.h;
  const depth = Math.min(1.6, Math.min(p.w, p.h) * 0.22);
  const f = boxFaces(
    p.col + (alongCol ? 0.6 : 0),
    p.row + (alongCol ? 0 : 0.6),
    alongCol ? p.w - 1.2 : depth,
    alongCol ? depth : p.h - 1.2,
    0,
    up(3.2),
  );
  const [a, b, , d] = f.top as [Pt, Pt, Pt, Pt];
  const at = (u: number, v: number): Pt => ({
    x: a.x + (b.x - a.x) * u + (d.x - a.x) * v,
    y: a.y + (b.y - a.y) * u + (d.y - a.y) * v,
  });
  const dots = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 22; i++) {
      const q = at((i + 0.5 + (row % 2) * 0.5) / 23, (row + 0.5) / 3);
      dots.push(
        <circle
          key={`${row}-${i}`}
          cx={q.x}
          cy={q.y - 1.2}
          r={1.1}
          fill={CROWD[(i * 7 + row) % CROWD.length]}
        />,
      );
    }
  }
  return <>{dots}</>;
}

function Traffic({ cars }: { cars: number }) {
  // Down the middle of the road, both ways.
  const rows = TERRAIN.road.map((t) => t.row);
  if (!rows.length || cars <= 0) return null;
  const mid = (Math.min(...rows) + Math.max(...rows) + 1) / 2;
  const east = [project(-2, mid - 0.3), project(GRID_WIDTH + 2, mid - 0.3)];
  const west = [project(GRID_WIDTH + 2, mid + 0.3), project(-2, mid + 0.3)];
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const out = [];
  for (let i = 0; i < cars; i++) {
    const [from, to] = i % 2 ? west : east;
    const path = `M${from!.x.toFixed(1)},${from!.y.toFixed(1)}L${to!.x.toFixed(1)},${to!.y.toFixed(1)}`;
    const dur = 26 + (i % 3) * 4;
    out.push(
      <rect key={i} x={-4} y={-2.5} width={8} height={5} rx={1.4} fill={CAR[i % CAR.length]}>
        {!reduced && (
          <animateMotion
            dur={`${dur}s`}
            begin={`-${(i * dur) / cars}s`}
            repeatCount="indefinite"
            path={path}
          />
        )}
      </rect>,
    );
  }
  return <>{out}</>;
}

function LifeLayer({
  campus,
  gameWeek,
  termOn,
  cars,
  camera,
}: {
  campus: Campus;
  // The teams play this week (the last weeks of the fall and the spring).
  gameWeek: boolean;
  // Term is on: the dining halls have queues.
  termOn: boolean;
  cars: number;
  camera: Camera;
}) {
  // What stands where, not how worn it is (Phase 52).
  const layout = layoutKey(campus.placements);
  const stands = useMemo(
    () =>
      campus.placements.filter(
        (p) => p.status === 'open' && buildingById(p.buildingId).features?.includes('stands'),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, camera],
  );
  const queues = useMemo(() => {
    const grid = walkGrid(campus);
    return doors(campus, grid)
      .filter((s) => buildingById(s.door.buildingId).category === 'dining')
      .map((s) => s.door);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, campus.paths, camera]);
  return (
    <g className="campus-life" aria-hidden="true">
      {gameWeek && stands.map((p) => <Crowd key={p.id} p={p} />)}
      {termOn &&
        queues.map((d) =>
          [0, 1, 2, 3, 4].map((i) => {
            const q = project(d.col + 0.5 + i * 0.28, d.row + 0.5 + i * 0.1);
            return (
              <g key={`${d.placementId}-${i}`}>
                <ellipse cx={q.x} cy={q.y} rx={2.6} ry={1.3} fill="rgba(0,0,0,0.18)" />
                <rect
                  x={q.x - 1.3}
                  y={q.y - 6}
                  width={2.6}
                  height={5}
                  rx={1}
                  fill={CROWD[i % CROWD.length]}
                />
                <circle cx={q.x} cy={q.y - 7} r={1.2} fill="#e9c9a6" />
              </g>
            );
          }),
        )}
      <Traffic cars={cars} />
    </g>
  );
}

export default memo(LifeLayer);
