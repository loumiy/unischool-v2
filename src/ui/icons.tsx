// Hand-rolled inline SVG icons (ported from v1): a 24×24 viewBox,
// stroke=currentColor so every glyph inherits its button's text colour,
// and simple primitives. Sizing lives in CSS, not here.
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const FILLED = { fill: 'currentColor', stroke: 'none' };

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.8 9.6V19h12.4V9.6" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function CurriculumIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 4 3 8.5 12 13l9-4.5L12 4Z" />
      <path d="M7 10.5V15c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" />
      <path d="M21 8.5V14" />
    </svg>
  );
}

export function FacultyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19.5c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
      <path d="M15 8.2a2.7 2.7 0 1 1 0 5.4" />
      <path d="M17.2 13.8c2.1.6 3.6 2.6 3.8 5.7" />
    </svg>
  );
}

// Students: two heads and shoulders, the student body.
export function StudentsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16.5 14.5c2.6 0 4.5 1.9 4.5 4.5" />
    </svg>
  );
}

export function TreasuryIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="11"
        fontFamily="Georgia, serif"
        stroke="none"
        fill="currentColor"
      >
        $
      </text>
    </svg>
  );
}

// League: a rosette — a medal's disc with two ribbon tails.
export function LeagueIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.8 13.6 7 21l5-2.6L17 21l-1.8-7.4" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <polyline points="4 4 4 8 8 8" />
    </svg>
  );
}

// A bulldozer in side profile.
export function BuildIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <rect x="2" y="15.5" width="15" height="3.5" rx="1.5" />
      <rect x="6" y="10" width="12" height="6" rx="1" />
      <rect x="9.5" y="5.5" width="6" height="5" rx="1" />
      <path d="M2 15.5V11h2.5v3.5" />
      <line x1="4.5" y1="12.2" x2="6" y2="12.2" />
    </svg>
  );
}

export function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function PrestigeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" />
    </svg>
  );
}

export function SatisfactionIcon() {
  return (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" />
      <path d="M9.2 9.6h.01M14.8 9.6h.01" strokeWidth="2.2" />
    </svg>
  );
}

// The gears. Filled rather than stroked: a play triangle drawn as an
// outline at 14px reads as a warning sign.
export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" {...FILLED}>
      <rect x="6" y="5" width="4.2" height="14" rx="1" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" {...FILLED}>
      <path d="M7 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.2 4.5A.8.8 0 0 0 7 5.2Z" />
    </svg>
  );
}

const TRI_L = 'M3 5.6v12.8a.7.7 0 0 0 1.1.6L12 12.6a.7.7 0 0 0 0-1.2L4.1 5a.7.7 0 0 0-1.1.6Z';
const TRI_R = 'M12.5 5.6v12.8a.7.7 0 0 0 1.1.6l7.9-6.4a.7.7 0 0 0 0-1.2L13.6 5a.7.7 0 0 0-1.1.6Z';

// 2×: two triangles. 4×: two triangles and a bar, the way a tape deck marked
// "fast". 8×: two triangles and two bars — three or four triangles at 14px
// are a smudge.
export function DoubleSpeedIcon() {
  return (
    <svg viewBox="0 0 24 24" {...FILLED}>
      <path d={TRI_L} />
      <path d={TRI_R} />
    </svg>
  );
}

export function QuadSpeedIcon() {
  return (
    <svg viewBox="0 0 24 24" {...FILLED}>
      <path d="M2 5.6v12.8a.7.7 0 0 0 1.1.6L11 12.6a.7.7 0 0 0 0-1.2L3.1 5A.7.7 0 0 0 2 5.6Z" />
      <path d="M10.5 5.6v12.8a.7.7 0 0 0 1.1.6l7.9-6.4a.7.7 0 0 0 0-1.2L11.6 5a.7.7 0 0 0-1.1.6Z" />
      <rect x="20" y="5" width="2.4" height="14" rx="0.8" />
    </svg>
  );
}

export function OctoSpeedIcon() {
  return (
    <svg viewBox="0 0 24 24" {...FILLED}>
      <path d="M1 5.6v12.8a.7.7 0 0 0 1.1.6L10 12.6a.7.7 0 0 0 0-1.2L2.1 5A.7.7 0 0 0 1 5.6Z" />
      <path d="M8.5 5.6v12.8a.7.7 0 0 0 1.1.6l7.9-6.4a.7.7 0 0 0 0-1.2L9.6 5a.7.7 0 0 0-1.1.6Z" />
      <rect x="17.6" y="5" width="2.2" height="14" rx="0.8" />
      <rect x="21" y="5" width="2.2" height="14" rx="0.8" />
    </svg>
  );
}
