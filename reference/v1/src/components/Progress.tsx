// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// ---------------------------------------------------------------------
// Shared completion geometry: one bar and one ring, both driven by a plain
// 0..1 fraction. Used everywhere the UI answers "how far along is this" —
// a Buildable under development (weeks elapsed / duration), the catalogue
// as a whole, and each revealed school's own share of it.
//
// Presentation only. Nothing here reads or writes GameState: every caller
// computes its own fraction from state it already has, so there is no new
// derived field and nothing for a system to keep in sync. Plain SVG for
// the ring, no charting dependency — the same rule Sparkline.ts follows.
// ---------------------------------------------------------------------

// Ring geometry. The stroke is a fixed weight rather than a share of the
// size so a 26px section-head ring and a 46px panel-head ring read as the
// same instrument at two sizes.
const RING_STROKE = 3.5;
const RING_CENTER_FONT_RATIO = 0.3; // center label size, as a share of the ring's box

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

// A horizontal fill bar. `label` is an optional compact endcap (e.g. the
// weeks still to run) — the bar carries the shape, the label the exact
// figure.
export function ProgressBar({ fraction, label, title }: { fraction: number; label?: string; title: string }) {
  const pct = Math.round(clamp01(fraction) * 100);
  return (
    <span
      className="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={title}
      title={title}
    >
      <span className="progress-bar-track">
        <span className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      {label && <span className="progress-bar-label">{label}</span>}
    </span>
  );
}

// A completion ring. `center` (usually a percentage) is drawn inside it
// when there's room; the exact counts belong beside the ring, not in it.
export function ProgressRing({
  fraction,
  size,
  center,
  title,
}: { fraction: number; size: number; center?: string; title: string }) {
  const f = clamp01(fraction);
  const radius = (size - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      className="progress-ring"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={RING_STROKE} />
      <circle
        className="progress-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={RING_STROKE}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - f)}
      />
      {center && (
        <text className="progress-ring-center" x={size / 2} y={size / 2} fontSize={size * RING_CENTER_FONT_RATIO}>
          {center}
        </text>
      )}
    </svg>
  );
}
