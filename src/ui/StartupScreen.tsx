import { useEffect, useState } from 'react';
import { DEFAULT_MOTIF, MOTIF_CHOICES } from '../content/motifs.ts';
import { DEFAULT_PALETTE, PALETTES, type PaletteChoice } from '../content/palettes.ts';
import { INSTITUTION_SUFFIX, isValidName, type Motif, type SchoolColors } from '../sim/index.ts';
import { MOTIF_SPECS, shade } from './motifSpec.ts';
import { applySchoolColors } from './theme.ts';

// "Open the Doors" (DD §13.1, ported from v1): the one screen before play.
// Three questions — the name, the motif, the colours — and a live facade
// of Founders Hall, seen head-on, drawn in whichever motif the campus will
// be built in and hung with the pair the school will wear.
//
// The player writes only half the name. Every school opens as a College
// (sim/identity.ts's INSTITUTION_SUFFIX); the fixed half is carved into the
// facade's band rather than typed, because carved stone reads as permanent
// without a caption saying so.

const FACADE_BAYS = 7; // Founders Hall is seven tiles across
const VIEW_W = 440;
const VIEW_H = 214;
const BAND_LEFT = 18;
const BAND_WIDTH = 404;
const TEXT_WIDTH = 360;
const COLUMN_SPAN = 320;
const AVG_GLYPH_WIDTH_EM = 0.62;

function bannerFontSize(len: number): number {
  if (len <= 16) return 25;
  if (len <= 24) return 20;
  if (len <= 34) return 16;
  if (len <= 46) return 13;
  return 11;
}

const BANNER_WIDTH = 18;
const BANNER_HEIGHT = 58;
const BANNER_INSET = 4;

// The two banners hung from the band in the school's colours: cloth, not
// architecture, so they are the one thing not read from the motif.
function HungBanner({ x, y, colors }: { x: number; y: number; colors: SchoolColors }) {
  const tail = 8;
  const w = BANNER_WIDTH;
  const h = BANNER_HEIGHT;
  return (
    <g>
      <polygon
        fill={colors.primary}
        points={`${x},${y} ${x + w},${y} ${x + w},${y + h} ${x + w / 2},${y + h - tail} ${x},${y + h}`}
      />
      <rect fill={colors.secondary} x={x} y={y + 10} width={w} height="6" />
      <rect fill={shade(colors.primary, 0.75)} x={x} y={y} width={w} height="2" />
    </g>
  );
}

export function SchoolFacade({
  name,
  motif,
  colors,
}: {
  name: string;
  motif: Motif;
  colors: SchoolColors;
}) {
  const suffix = INSTITUTION_SUFFIX.toUpperCase();
  const bannerText = name.trim() ? `${name.trim().toUpperCase()} ${suffix}` : suffix;
  const fontSize = bannerFontSize(bannerText.length);
  const compress = bannerText.length * fontSize * AVG_GLYPH_WIDTH_EM > TEXT_WIDTH;

  const spec = MOTIF_SPECS[motif];
  const { wall, roof, glass, apex, entrance } = spec;
  const trim = spec.trim ?? shade(wall, 1.1);
  const gilt = spec.gilt;

  const cx = VIEW_W / 2;
  const bandY = 92;
  const bandH = 32;
  const wallTop = bandY + bandH;
  const baseY = 152;
  const bayXs = Array.from(
    { length: FACADE_BAYS },
    (_, i) => (VIEW_W - COLUMN_SPAN) / 2 + (i * COLUMN_SPAN) / (FACADE_BAYS - 1),
  );
  const bayW = bayXs[1]! - bayXs[0]!;

  const crown = () => {
    if (apex === 'core') {
      // The service core, with mass rather than a pale slot: a shaft with a
      // shadowed return, a glazed stair slot up it, a capping slab that
      // overhangs, and the roof plant beside it. It was two flat rectangles
      // the same value as the sky, which read as nothing at all (21D).
      const coreL = cx - 44;
      const coreR = cx + 44;
      const coreTop = 26;
      const deck = 80;
      return (
        <>
          <rect fill={roof} x={BAND_LEFT} y={deck} width={BAND_WIDTH} height={bandY - deck} />
          <rect fill={shade(roof, 0.88)} x={BAND_LEFT} y={deck} width={BAND_WIDTH} height="3" />
          {/* the plant: a louvred box on the deck, to one side */}
          <rect fill={shade(roof, 1.08)} x={coreR + 22} y="62" width="46" height={deck - 62} />
          <rect fill={shade(roof, 0.82)} x={coreR + 22} y="62" width="46" height="3" />
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              fill={shade(roof, 0.7)}
              x={coreR + 26}
              y={68 + i * 4}
              width="38"
              height="1.6"
            />
          ))}
          {/* the shaft */}
          <rect fill={wall} x={coreL} y={coreTop} width={coreR - coreL} height={deck - coreTop} />
          <rect
            fill={shade(wall, 0.78)}
            x={cx + 18}
            y={coreTop}
            width={coreR - cx - 18}
            height={deck - coreTop}
          />
          <rect fill={glass} x={cx - 12} y={coreTop + 8} width="24" height={deck - coreTop - 8} />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              fill={shade(wall, 0.9)}
              x={cx - 12}
              y={coreTop + 18 + i * 12}
              width="24"
              height="2"
            />
          ))}
          {/* the cap, overhanging on both sides */}
          <rect
            fill={shade(wall, 1.1)}
            x={coreL - 7}
            y={coreTop - 7}
            width={coreR - coreL + 14}
            height="7"
          />
          <rect
            fill={shade(wall, 0.72)}
            x={coreL - 7}
            y={coreTop}
            width={coreR - coreL + 14}
            height="2.5"
          />
        </>
      );
    }
    if (apex === 'spire') {
      return (
        <>
          <polygon
            fill={roof}
            points={`${cx},22 ${BAND_LEFT + BAND_WIDTH - 4},${bandY} ${BAND_LEFT + 4},${bandY}`}
          />
          <polygon
            fill={shade(roof, 1.12)}
            points={`${cx},22 ${cx},${bandY} ${BAND_LEFT + 4},${bandY}`}
          />
        </>
      );
    }
    if (apex === 'campanile') {
      return (
        <>
          <polygon
            fill={roof}
            points={`${cx},54 ${BAND_LEFT + BAND_WIDTH + 8},86 ${BAND_LEFT - 8},86`}
          />
          <rect
            fill={shade(roof, 0.72)}
            x={BAND_LEFT - 8}
            y="86"
            width={BAND_WIDTH + 16}
            height={bandY - 86}
          />
        </>
      );
    }
    return (
      <>
        <polygon
          fill={trim}
          stroke={shade(trim, 0.72)}
          strokeWidth="1.2"
          strokeLinejoin="round"
          points={`24,${bandY} ${cx},36 416,${bandY}`}
        />
        <polyline
          fill="none"
          stroke={shade(trim, 0.78)}
          strokeWidth="0.8"
          points={`37,84 ${cx},52 403,84`}
        />
      </>
    );
  };

  const landmark = () => {
    const w = 34;
    const x = cx - w / 2;
    if (apex === 'cupola') {
      return (
        <>
          <rect
            fill={trim}
            stroke={shade(trim, 0.8)}
            strokeWidth="0.8"
            x={x}
            y="34"
            width={w}
            height="28"
          />
          <path fill={gilt ?? trim} d={`M ${x - 3} 34 A ${w / 2 + 3} 15 0 0 1 ${x + w + 3} 34 Z`} />
          <line stroke={gilt ?? trim} strokeWidth="2" x1={cx} y1="8" x2={cx} y2="19" />
        </>
      );
    }
    if (apex === 'spire') {
      return (
        <>
          <rect
            fill={trim}
            stroke={shade(trim, 0.8)}
            strokeWidth="0.8"
            x={x}
            y="30"
            width={w}
            height="34"
          />
          <polygon fill={shade(trim, 0.9)} points={`${cx},-30 ${x + w},36 ${x},36`} />
        </>
      );
    }
    if (apex === 'campanile') {
      return (
        <>
          <rect
            fill={trim}
            stroke={shade(trim, 0.8)}
            strokeWidth="0.8"
            x={x}
            y="24"
            width={w}
            height="38"
          />
          <rect fill={glass} x={x + 7} y="34" width={w - 14} height="16" rx="8" />
          <polygon fill={roof} points={`${cx},6 ${x + w + 4},24 ${x - 4},24`} />
        </>
      );
    }
    if (apex === 'dome') {
      return (
        <>
          <rect
            fill={trim}
            stroke={shade(trim, 0.8)}
            strokeWidth="0.8"
            x={cx - 58}
            y="50"
            width="116"
            height="16"
          />
          <path
            fill={shade(trim, 0.94)}
            stroke={shade(trim, 0.78)}
            strokeWidth="0.8"
            d={`M ${cx - 58} 50 A 58 34 0 0 1 ${cx + 58} 50 Z`}
          />
          <rect fill={trim} x={cx - 5} y="8" width="10" height="10" />
          <line stroke={gilt ?? trim} strokeWidth="2" x1={cx} y1="0" x2={cx} y2="8" />
        </>
      );
    }
    return <rect fill={shade(wall, 1.02)} x={x - 2} y="16" width={w + 4} height="56" />;
  };

  const order = () => {
    if (entrance === 'arcade') {
      return bayXs.slice(0, FACADE_BAYS - 1).map((x, i) => (
        <path
          key={i}
          fill={shade(wall, 0.55)}
          d={`M ${x + 5} ${VIEW_H} L ${x + 5} ${baseY + 22}
              A ${(bayW - 10) / 2} ${(bayW - 10) / 2} 0 0 1 ${x + bayW - 5} ${baseY + 22}
              L ${x + bayW - 5} ${VIEW_H} Z`}
        />
      ));
    }
    if (entrance === 'canopy') {
      return (
        <>
          <rect
            fill={glass}
            x={BAND_LEFT}
            y={baseY + 10}
            width={BAND_WIDTH}
            height={VIEW_H - baseY - 10}
          />
          {bayXs.map((x, i) => (
            <rect
              key={i}
              fill={trim}
              x={x - 3}
              y={baseY + 10}
              width="6"
              height={VIEW_H - baseY - 10}
            />
          ))}
          <rect fill={trim} x={cx - 70} y={baseY} width="140" height="5" />
          <rect fill={shade(wall, 0.6)} x={cx - 70} y={baseY + 5} width="140" height="3" />
        </>
      );
    }
    if (entrance === 'porch') {
      return (
        <>
          {bayXs.map((x, i) => (
            <rect
              key={`b${i}`}
              fill={shade(wall, 0.92)}
              x={x - 10}
              y={baseY}
              width="20"
              height={VIEW_H - baseY}
            />
          ))}
          {bayXs.slice(0, FACADE_BAYS - 1).map((x, i) => {
            const lx = x + bayW / 2;
            return (
              <path
                key={`l${i}`}
                fill={glass}
                d={`M ${lx - 6} ${VIEW_H} L ${lx - 6} ${baseY + 20} L ${lx} ${baseY + 8} L ${lx + 6} ${baseY + 20} L ${lx + 6} ${VIEW_H} Z`}
              />
            );
          })}
          <path
            fill={shade(wall, 0.45)}
            d={`M ${cx - 22} ${VIEW_H} L ${cx - 22} ${baseY + 26} L ${cx} ${baseY + 2} L ${cx + 22} ${baseY + 26} L ${cx + 22} ${VIEW_H} Z`}
          />
        </>
      );
    }
    // The colonnade, cropped at the bottom of the frame.
    return bayXs.map((x, i) => (
      <g key={i}>
        <rect fill={trim} x={x - 16} y={baseY} width="32" height="6" />
        <polygon
          fill={trim}
          points={`${x - 16},${baseY + 6} ${x + 16},${baseY + 6} ${x + 10},${baseY + 14} ${x - 10},${baseY + 14}`}
        />
        <rect fill={trim} x={x - 10} y={baseY + 14} width="20" height={VIEW_H - baseY - 14} />
        {[-6, -3, 0, 3, 6].map((dx) => (
          <line
            key={dx}
            stroke={shade(trim, 0.86)}
            strokeWidth="0.6"
            x1={x + dx}
            y1={baseY + 14}
            x2={x + dx}
            y2={VIEW_H}
          />
        ))}
      </g>
    ));
  };

  return (
    <svg
      className="startup-facade-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`${bannerText}, carved across the front of its founding hall`}
    >
      <rect className="facade-sky" x="0" y="0" width={VIEW_W} height={VIEW_H} />
      {landmark()}
      {crown()}
      <rect fill={wall} x={BAND_LEFT} y={bandY} width={BAND_WIDTH} height={VIEW_H - bandY} />
      <rect
        fill={trim}
        stroke={shade(trim, 0.78)}
        strokeWidth="0.9"
        x={BAND_LEFT}
        y={bandY}
        width={BAND_WIDTH}
        height={bandH}
      />
      <text
        className="facade-banner-text"
        x={cx}
        y={bandY + bandH / 2 + 1}
        fontSize={fontSize}
        textLength={compress ? TEXT_WIDTH : undefined}
        lengthAdjust={compress ? 'spacingAndGlyphs' : undefined}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {bannerText}
      </text>
      {bayXs.map((x, i) => (
        <rect key={i} fill={glass} x={x - 9} y={wallTop + 8} width="18" height="18" />
      ))}
      {order()}
      {/* Cloth hangs in FRONT of the building, which is the whole point of
          hanging it. Drawn under the order, Modern's curtain wall cut both
          banners off flat at the transom and tinted what was left its own
          blue-grey — the one thing on the facade that is the school's
          colours and not the motif's (21D). Every other motif's order
          stands inside the column span, so nothing else moves. */}
      <HungBanner x={BAND_LEFT + BANNER_INSET} y={wallTop} colors={colors} />
      <HungBanner
        x={BAND_LEFT + BAND_WIDTH - BANNER_INSET - BANNER_WIDTH}
        y={wallTop}
        colors={colors}
      />
    </svg>
  );
}

export default function StartupScreen({
  onStart,
}: {
  onStart: (name: string, motif: Motif, palette: PaletteChoice) => void;
}) {
  const [name, setName] = useState('');
  const [motif, setMotif] = useState<Motif>(DEFAULT_MOTIF);
  const [palette, setPalette] = useState<PaletteChoice>(DEFAULT_PALETTE);
  const colors: SchoolColors = { primary: palette.primary, secondary: palette.secondary };

  // The card previews the theme it is choosing: the pick is written to the
  // root properties as it changes, so the button, the active chip and the
  // banners on the facade all take the pair before it is confirmed.
  useEffect(() => {
    applySchoolColors({ primary: palette.primary, secondary: palette.secondary });
  }, [palette.primary, palette.secondary]);

  return (
    <div className="startup">
      <div className="startup-card">
        <div className="eyebrow">Fifty years to build a university.</div>
        <h1>Name your school</h1>
        <input
          className="startup-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Blackmoor"
          maxLength={60}
          aria-label="School name"
          autoFocus
        />
        <div className="startup-facade">
          <SchoolFacade name={name} motif={motif} colors={colors} />
        </div>
        <div className="startup-motifs" role="radiogroup" aria-label="Architecture">
          {MOTIF_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              className={`startup-motif-btn ${motif === choice.id ? 'active' : ''}`}
              onClick={() => setMotif(choice.id)}
              aria-checked={motif === choice.id}
              title={choice.blurb}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="startup-colors" role="radiogroup" aria-label="School colours">
          {PALETTES.map((pair) => (
            <button
              key={pair.id}
              type="button"
              role="radio"
              className={`startup-color-btn ${palette.id === pair.id ? 'active' : ''}`}
              aria-checked={palette.id === pair.id}
              aria-label={pair.name}
              title={pair.name}
              onClick={() => setPalette(pair)}
            >
              <span className="startup-color-swatch" aria-hidden="true">
                <span style={{ background: pair.primary }} />
                <span style={{ background: pair.secondary }} />
              </span>
            </button>
          ))}
        </div>
        <div className="startup-color-name">{palette.name}</div>
        <button
          className="startup-begin-btn"
          disabled={!isValidName(name)}
          onClick={() => onStart(name.trim(), motif, palette)}
        >
          Open the Doors
        </button>
      </div>
    </div>
  );
}
