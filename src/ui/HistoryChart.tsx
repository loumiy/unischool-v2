import { useId } from 'react';

// ONE CHART STYLE (Phase 48): a small line chart for what the sim already
// keeps by year — rank on the League, money on the Treasury, the classes
// on Students, the standings on the Final Report. Drawn from the tokens, so
// both colour schemes and the colour-blind-safe set read it; every series
// carries a name, its last value is printed at its end, and the chart has
// a text alternative for anyone not looking at it.

export interface Series {
  name: string;
  points: { x: number; y: number }[];
  // A token, e.g. 'var(--ink)'; the first series defaults to the school's.
  colour?: string;
  format?: (y: number) => string;
}

const W = 520;
const H = 150;
const PAD = { top: 12, right: 64, bottom: 22, left: 36 };
// The end labels (Phase 52): about this wide a character at 10px, and
// never closer together than a line.
const CHAR_W = 5.6;
const LABEL_GAP = 11;
const DEFAULT_COLOURS = [
  'var(--school-primary)',
  'var(--ink-muted)',
  'var(--good-ink, #2f6f3f)',
  'var(--danger-ink, #9a2b2b)',
  'var(--school-secondary)',
  'var(--ink)',
];

export default function HistoryChart({
  title,
  series,
  invert = false,
  yMin,
  yMax,
  xLabel = 'Year',
}: {
  title: string;
  series: Series[];
  // Rank: one is the top of the chart.
  invert?: boolean;
  yMin?: number;
  yMax?: number;
  xLabel?: string;
}) {
  const id = useId();
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const lo = yMin ?? Math.min(...ys);
  const hi = yMax ?? Math.max(...ys);
  const span = hi - lo || 1;
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.left - right);
  const sy = (y: number) => {
    const t = (y - lo) / span;
    return PAD.top + (invert ? t : 1 - t) * (H - PAD.top - PAD.bottom);
  };
  const fmt = (s: Series, y: number) => (s.format ? s.format(y) : String(Math.round(y)));
  // Room on the right for the longest end label, so none runs off the edge.
  const labelOf = (s: Series) => `${s.name} ${fmt(s, s.points[s.points.length - 1]!.y)}`;
  const right = Math.max(
    PAD.right,
    ...series.filter((s) => s.points.length).map((s) => labelOf(s).length * CHAR_W + 10),
  );
  const summary = series
    .map((s) => {
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      return first && last
        ? `${s.name}: ${fmt(s, first.y)} in ${first.x}, ${fmt(s, last.y)} in ${last.x}`
        : s.name;
    })
    .join('; ');
  // The end labels, spread so no two share a line: sorted by where their
  // lines end, and each pushed below the one above it if they would touch.
  const ends = series
    .map((s, i) => ({ i, y: s.points.length ? sy(s.points[s.points.length - 1]!.y) : 0 }))
    .sort((a, b) => a.y - b.y);
  const labelY = new Map<number, number>();
  let floor = -Infinity;
  for (const e of ends) {
    const y = Math.max(e.y, floor + LABEL_GAP);
    labelY.set(e.i, y);
    floor = y;
  }
  return (
    <figure className="history-chart">
      <figcaption id={`${id}-t`}>{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        preserveAspectRatio="xMidYMid meet"
      >
        <desc id={`${id}-d`}>{summary}</desc>
        <line
          className="chart-axis"
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - right}
          y2={H - PAD.bottom}
        />
        <line className="chart-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} />
        <text className="chart-tick" x={PAD.left - 4} y={sy(invert ? lo : hi) + 4} textAnchor="end">
          {series[0]?.format ? series[0].format(invert ? lo : hi) : Math.round(invert ? lo : hi)}
        </text>
        <text className="chart-tick" x={PAD.left - 4} y={sy(invert ? hi : lo) + 4} textAnchor="end">
          {series[0]?.format ? series[0].format(invert ? hi : lo) : Math.round(invert ? hi : lo)}
        </text>
        <text className="chart-tick" x={PAD.left} y={H - 6}>
          {xLabel} {x0}
        </text>
        <text className="chart-tick" x={W - right} y={H - 6} textAnchor="end">
          {x1}
        </text>
        {series.map((s, i) => {
          const colour = s.colour ?? DEFAULT_COLOURS[i % DEFAULT_COLOURS.length];
          const d = s.points
            .map((p, k) => `${k ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
            .join('');
          const last = s.points[s.points.length - 1]!;
          return (
            <g key={s.name}>
              <path className="chart-line" d={d} stroke={colour} />
              <text
                className="chart-end"
                x={sx(last.x) + 5}
                y={(labelY.get(i) ?? sy(last.y)) + 4}
                fill={colour}
              >
                {labelOf(s)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
