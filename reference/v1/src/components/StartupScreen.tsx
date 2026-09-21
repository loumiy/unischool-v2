// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../state/actions.
import { useEffect, useState } from 'react';
import { STARTING_INSTITUTION_SUFFIX } from '../state/actions';
import { VERNACULARS, VERNACULAR_CHOICES } from './buildingSpec';
import { FOUNDING_VERNACULAR } from '../data/foundingData';
import { FOUNDING_COLORS, SCHOOL_COLOR_PAIRS, schoolColorsOf, type SchoolColorChoice } from '../data/schoolColors';
import { applySchoolColors } from './theme';
import type { SchoolColors, Vernacular } from '../state/types';

// Shown once, before play begins: name the school. That is the whole of
// it — every founding condition comes from FOUNDING_PRESET and is the same
// for every school (see data/foundingData.ts).
//
// It used to ask a second question, private vs. public, which set starting
// cash, prestige, the applicant pool, a tuition ceiling and a state
// appropriation. Plan 07 retired that fork; docs/design/progression.md has
// always said "archetypes emerge, they are not chosen", and a structural
// question asked before the player has seen a single screen of the game was
// the one place that was not true. What is left is the one input that is
// genuinely the player's to give.
//
// The player writes only HALF the name. Every school opens as a College,
// and the word after the name is fixed rather than typed, because it is
// the thing the game later offers to change: completing the first lab
// offers a one-time promotion to University (see systems/events/
// eventSystem.ts). That used to be spelled out as a fixed chip beside the
// input plus a paragraph of prose underneath; it is now the SchoolFacade
// below, which engraves the whole name — typed half and fixed half
// together — across a building's entablature. Carved stone reads as
// permanent without a caption saying so, and a facade with no "University"
// anywhere on it makes the absence of that option legible the same way.
//
// The field starts EMPTY with a placeholder rather than prefilled: the
// facade already has a graceful empty-state ("COLLEGE" alone, see
// SchoolFacade below), so leaving the input blank no longer means an
// unfinished-looking screen, and an empty field reads unambiguously as
// "type here" the moment the building beside it is doing the explaining.

// ---------------------------------------------------------------------
// THE FACADE — and since Plan 07's PR J it is FOUNDERS HALL, seen head-on,
// drawn in whichever vernacular the campus will be built in.
//
// Two things make that worth the work. It is the building the player is
// about to own: Founders Hall opens pre-built (see actions.ts), so the
// picture on the founding screen is the first thing they will actually see
// on the map rather than a generic campus building. And it is a live
// PREVIEW — every colour and every part below is read from
// buildingSpec.ts's VERNACULARS, so a set cannot be added to the game
// without this screen showing it, and this screen cannot drift from the
// map by being hand-tinted to match.
//
// It stays a FLAT ELEVATION rather than reusing the isometric BuildingMotif.
// The engraved name is the whole reason this screen has a building on it —
// carved stone reads as permanent without a caption saying so, and a facade
// with no "University" anywhere on it makes the absence of that option
// legible the same way — and a 7x5 iso mass cannot carry the player's own
// name at this size. So the two agree about vocabulary and palette rather
// than about projection, which is what "the same building" means for a
// picture taken from a different angle.
//
// SEVEN BAYS, because Founders Hall is seven tiles across (Plan 04's 4A).
// The backlog flagged the old facade's seven columns as "out of step" with
// PORTICO_COLUMNS' four; they were never in conflict — four is the engaged
// centre bay, seven is the whole front.
// ---------------------------------------------------------------------
const FACADE_BAYS = 7;
const FACADE_VIEW_WIDTH = 440;
const FACADE_VIEW_HEIGHT = 214;
// The spire and the campanile rise past the top of the frame on purpose —
// the same crop the columns have at the bottom. viewBox clips them, which
// is what a photograph of a tall building from close up does too.
const FACADE_BAND_LEFT = 18;
const FACADE_BAND_WIDTH = 404; // shared span for the cornice/frieze/architrave
// The engraved text's available width before it must compress rather than
// overflow the frieze — see bannerFontSize/needsCompression below. Kept a
// little narrower than FACADE_BAND_WIDTH for a visible margin on each side.
const FACADE_TEXT_WIDTH = 360;
// The colonnade sits tighter than the building's full width — real fronts
// read as a tight rank, not columns spread to the corners — anchored on the
// same centre (220) as the crown's apex.
const FACADE_COLUMN_SPAN = 320;

// Stepped rather than continuously computed: a handful of readable sizes,
// chosen so a short name (the common case) gets a genuinely large,
// banner-scale font instead of always rendering at whatever size fits the
// longest name the input allows.
function bannerFontSize(len: number): number {
  if (len <= 16) return 25;
  if (len <= 24) return 20;
  if (len <= 34) return 16;
  if (len <= 46) return 13;
  return 11;
}

// A rough average glyph width for this uppercase serif banner, in units of
// its own font-size — enough to catch names long enough to overflow even
// the smallest stepped size above, so `textLength` below is only ever
// applied as a last-resort compression, never on ordinary names.
const AVG_GLYPH_WIDTH_EM = 0.62;

// The map derives its shades from one material at runtime (see
// buildingMotifs' paletteFrom); this needs the same trick for the same
// reason — four vernaculars times five tones is twenty values nobody should
// be keeping in sync by hand.
function tint(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// The two banners that hang from the band, one at each end of the wall,
// in the school's colours (Plan 18's PR B): the primary as the cloth, the
// secondary as its stripe, a swallowtail at the foot. Outside the
// colonnade's span and clear of the first and last windows, so they read
// as hung on the building rather than as part of it — which is also why
// they are the one thing on the facade that is not read from the
// vernacular: cloth is not architecture.
const BANNER_WIDTH = 18;
const BANNER_HEIGHT = 58;
const BANNER_INSET = 4; // from the band's edge

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
      <rect fill={tint(colors.primary, 0.75)} x={x} y={y} width={w} height="2" />
    </g>
  );
}

function SchoolFacade({ name, vernacular, colors }: { name: string; vernacular: Vernacular; colors: SchoolColors }) {
  const bannerText = name.trim()
    ? `${name.trim().toUpperCase()} ${STARTING_INSTITUTION_SUFFIX.toUpperCase()}`
    : STARTING_INSTITUTION_SUFFIX.toUpperCase();
  const fontSize = bannerFontSize(bannerText.length);
  const compress = bannerText.length * fontSize * AVG_GLYPH_WIDTH_EM > FACADE_TEXT_WIDTH;

  // Straight off the map's own tables. A hall is `brickRed` in every set —
  // that is the material name, not a colour — so this is literally the wall
  // Founders Hall will be built in.
  const spec = VERNACULARS[vernacular];
  const wall = spec.materials.brickRed.wall;
  const roof = spec.materials.brickRed.roof;
  // A vernacular with no trim (Modern) has nothing to cut a band from, so
  // the band becomes the wall a shade lighter — a panel joint rather than a
  // stone course.
  const trim = spec.stone.trim === 'none' ? tint(wall, 1.1) : spec.stone.trim;
  const glass = spec.stone.glass;
  const gilt = spec.stone.gilt === 'none' ? null : spec.stone.gilt;
  const entrance = spec.parts.entrance.hall ?? 'none';
  const apex = spec.parts.apex;

  const cx = FACADE_VIEW_WIDTH / 2;
  const bandY = 92;          // head of the engraved band
  // Every crown below is drawn DOWN TO bandY, not to its own idea of where
  // the roof ends: the pediment's base, the gable's foot, the slab's edge
  // and the eaves' shadow all sit on the band. The first pass stopped each
  // of them a few units short, which read as a strip of sky between roof
  // and wall in all four sets — a building with its lid lifted.
  const bandH = 32;
  const wallTop = bandY + bandH;
  const baseY = 152;         // where the ground-storey order begins

  const bayXs = Array.from(
    { length: FACADE_BAYS },
    (_, i) => (FACADE_VIEW_WIDTH - FACADE_COLUMN_SPAN) / 2 + (i * FACADE_COLUMN_SPAN) / (FACADE_BAYS - 1),
  );

  // --- THE CROWN: what the building does above its own name band. --------
  const crown = () => {
    if (apex === 'core') {
      // Modern: a slab edge, stepped back once. No pediment, no gable,
      // nothing applied — the top of the building is its flat roof.
      return (
        <>
          <rect fill={tint(roof, 1.0)} x={FACADE_BAND_LEFT} y="78" width={FACADE_BAND_WIDTH} height={bandY - 78} />
          <rect fill={tint(wall, 1.04)} x={FACADE_BAND_LEFT + 46} y="64" width={FACADE_BAND_WIDTH - 92} height="14" />
        </>
      );
    }
    if (apex === 'spire') {
      // Gothic: a steep gable, rising well past the band.
      return (
        <>
          <polygon fill={roof} points={`${cx},22 ${FACADE_BAND_LEFT + FACADE_BAND_WIDTH - 4},${bandY} ${FACADE_BAND_LEFT + 4},${bandY}`} />
          <polygon fill={tint(roof, 1.12)} points={`${cx},22 ${cx},${bandY} ${FACADE_BAND_LEFT + 4},${bandY}`} />
        </>
      );
    }
    if (apex === 'campanile') {
      // Mission: a shallow tile roof with a deep overhang, and the eaves
      // shadow under it that the set is half made of.
      return (
        <>
          <polygon fill={roof} points={`${cx},54 ${FACADE_BAND_LEFT + FACADE_BAND_WIDTH + 8},86 ${FACADE_BAND_LEFT - 8},86`} />
          <rect fill={tint(roof, 0.72)} x={FACADE_BAND_LEFT - 8} y="86" width={FACADE_BAND_WIDTH + 16} height={bandY - 86} />
        </>
      );
    }
    // Georgian: the pediment, with the inset raking moulding a real one
    // reads as from a distance.
    return (
      <>
        <polygon fill={trim} stroke={tint(trim, 0.72)} strokeWidth="1.2" strokeLinejoin="round" points={`24,${bandY} ${cx},36 416,${bandY}`} />
        <polyline fill="none" stroke={tint(trim, 0.78)} strokeWidth="0.8" points={`37,84 ${cx},52 403,84`} />
      </>
    );
  };

  // --- THE APEX: the one thing that stands above everything else. --------
  const landmark = () => {
    const w = 34;
    const x = cx - w / 2;
    if (apex === 'cupola') {
      return (
        <>
          <rect fill={trim} stroke={tint(trim, 0.8)} strokeWidth="0.8" x={x} y="34" width={w} height="28" />
          <path fill={gilt ?? trim} d={`M ${x - 3} 34 A ${w / 2 + 3} 15 0 0 1 ${x + w + 3} 34 Z`} />
          <line stroke={gilt ?? trim} strokeWidth="2" x1={cx} y1="8" x2={cx} y2="19" />
        </>
      );
    }
    if (apex === 'spire') {
      return (
        <>
          <rect fill={trim} stroke={tint(trim, 0.8)} strokeWidth="0.8" x={x} y="30" width={w} height="34" />
          <polygon fill={tint(trim, 0.9)} points={`${cx},-30 ${x + w},36 ${x},36`} />
        </>
      );
    }
    if (apex === 'campanile') {
      return (
        <>
          <rect fill={trim} stroke={tint(trim, 0.8)} strokeWidth="0.8" x={x} y="24" width={w} height="38" />
          <rect fill={glass} x={x + 7} y="34" width={w - 14} height="16" rx="8" />
          <polygon fill={roof} points={`${cx},6 ${x + w + 4},24 ${x - 4},24`} />
        </>
      );
    }
    if (apex === 'dome') {
      // Classical: a broad stone dome on a low drum, with a small lantern.
      return (
        <>
          <rect fill={trim} stroke={tint(trim, 0.8)} strokeWidth="0.8" x={cx - 58} y="50" width="116" height="16" />
          <path fill={tint(trim, 0.94)} stroke={tint(trim, 0.78)} strokeWidth="0.8" d={`M ${cx - 58} 50 A 58 34 0 0 1 ${cx + 58} 50 Z`} />
          <rect fill={trim} x={cx - 5} y="8" width="10" height="10" />
          <line stroke={gilt ?? trim} strokeWidth="2" x1={cx} y1="0" x2={cx} y2="8" />
        </>
      );
    }
    // Modern: a blind stair core, and deliberately not a landmark.
    return <rect fill={tint(wall, 1.02)} x={x - 2} y="16" width={w + 4} height="56" />;
  };

  // --- THE ORDER: what stands along the ground storey. -------------------
  const order = () => {
    if (entrance === 'arcade') {
      // Mission: a run of round arches, the walk you arrive out of the sun
      // into.
      return bayXs.slice(0, FACADE_BAYS - 1).map((x, i) => {
        const w = bayXs[1] - bayXs[0];
        return (
          <g key={i}>
            <path
              fill={tint(wall, 0.55)}
              d={`M ${x + 5} ${FACADE_VIEW_HEIGHT} L ${x + 5} ${baseY + 22}
                  A ${(w - 10) / 2} ${(w - 10) / 2} 0 0 1 ${x + w - 5} ${baseY + 22}
                  L ${x + w - 5} ${FACADE_VIEW_HEIGHT} Z`}
            />
          </g>
        );
      });
    }
    if (entrance === 'canopy') {
      // Modern: a glazed ground storey between slim posts, and the thin
      // slab of the canopy over the middle bays.
      return (
        <>
          <rect fill={glass} x={FACADE_BAND_LEFT} y={baseY + 10} width={FACADE_BAND_WIDTH} height={FACADE_VIEW_HEIGHT - baseY - 10} />
          {bayXs.map((x, i) => (
            <rect key={i} fill={trim} x={x - 3} y={baseY + 10} width="6" height={FACADE_VIEW_HEIGHT - baseY - 10} />
          ))}
          <rect fill={trim} x={cx - 70} y={baseY} width="140" height="5" />
          <rect fill={tint(wall, 0.6)} x={cx - 70} y={baseY + 5} width="140" height="3" />
        </>
      );
    }
    if (entrance === 'recess') {
      // A recessed entrance: piers, a ribbon of glazing above them, and the
      // undercut between.
      return (
        <>
          <rect fill={glass} x={FACADE_BAND_LEFT} y={baseY} width={FACADE_BAND_WIDTH} height="13" />
          <rect fill={tint(wall, 0.5)} x={FACADE_BAND_LEFT} y={baseY + 22} width={FACADE_BAND_WIDTH} height={FACADE_VIEW_HEIGHT - baseY - 22} />
          {bayXs.map((x, i) => (
            <rect key={i} fill={wall} x={x - 9} y={baseY + 22} width="18" height={FACADE_VIEW_HEIGHT - baseY - 22} />
          ))}
        </>
      );
    }
    if (entrance === 'porch') {
      // Gothic: buttresses between lancets, and the pointed arch in the
      // middle bay.
      return (
        <>
          {bayXs.map((x, i) => (
            <rect key={`b${i}`} fill={tint(wall, 0.92)} x={x - 10} y={baseY} width="20" height={FACADE_VIEW_HEIGHT - baseY} />
          ))}
          {bayXs.slice(0, FACADE_BAYS - 1).map((x, i) => {
            const w = bayXs[1] - bayXs[0];
            const lx = x + w / 2;
            return (
              <path
                key={`l${i}`}
                fill={glass}
                d={`M ${lx - 6} ${FACADE_VIEW_HEIGHT} L ${lx - 6} ${baseY + 20} L ${lx} ${baseY + 8} L ${lx + 6} ${baseY + 20} L ${lx + 6} ${FACADE_VIEW_HEIGHT} Z`}
              />
            );
          })}
          <path
            fill={tint(wall, 0.45)}
            d={`M ${cx - 22} ${FACADE_VIEW_HEIGHT} L ${cx - 22} ${baseY + 26} L ${cx} ${baseY + 2} L ${cx + 22} ${baseY + 26} L ${cx + 22} ${FACADE_VIEW_HEIGHT} Z`}
          />
        </>
      );
    }
    // Georgian: the colonnade, cropped at the bottom of the frame. The
    // columns keep going; the picture just doesn't — the same crop a photo
    // of a real portico would have.
    return bayXs.map((x, i) => (
      <g key={i}>
        <rect fill={trim} x={x - 16} y={baseY} width="32" height="6" />
        <polygon fill={trim} points={`${x - 16},${baseY + 6} ${x + 16},${baseY + 6} ${x + 10},${baseY + 14} ${x - 10},${baseY + 14}`} />
        <rect fill={trim} x={x - 10} y={baseY + 14} width="20" height={FACADE_VIEW_HEIGHT - baseY - 14} />
        {[-6, -3, 0, 3, 6].map((dx) => (
          <line key={dx} stroke={tint(trim, 0.86)} strokeWidth="0.6" x1={x + dx} y1={baseY + 14} x2={x + dx} y2={FACADE_VIEW_HEIGHT} />
        ))}
      </g>
    ));
  };

  return (
    <svg
      className="startup-facade-svg"
      viewBox={`0 0 ${FACADE_VIEW_WIDTH} ${FACADE_VIEW_HEIGHT}`}
      role="img"
      aria-label={`${bannerText}, carved across the front of its founding hall`}
    >
      {/* A SKY. Without it a pale trim is drawn cream-on-cream against the
          parchment card and the pediment simply vanishes — which is exactly
          what the first pass did. It also gives the crown something to be a
          silhouette against, which is most of how a roofline reads. */}
      <rect className="facade-sky" x="0" y="0" width={FACADE_VIEW_WIDTH} height={FACADE_VIEW_HEIGHT} />
      {landmark()}
      {crown()}

      {/* The wall the name is cut into, and the band itself. */}
      <rect fill={wall} x={FACADE_BAND_LEFT} y={bandY} width={FACADE_BAND_WIDTH} height={FACADE_VIEW_HEIGHT - bandY} />
      <rect fill={trim} stroke={tint(trim, 0.78)} strokeWidth="0.9" x={FACADE_BAND_LEFT} y={bandY} width={FACADE_BAND_WIDTH} height={bandH} />
      <text
        className="facade-banner-text"
        x={cx}
        y={bandY + bandH / 2 + 1}
        fontSize={fontSize}
        textLength={compress ? FACADE_TEXT_WIDTH : undefined}
        lengthAdjust={compress ? 'spacingAndGlyphs' : undefined}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {bannerText}
      </text>

      {/* One rank of the vernacular's own windows between the band and the
          order, so the opening shape is previewed too. */}
      {entrance !== 'recess' && bayXs.map((x, i) => (
        <rect key={i} fill={glass} x={x - 9} y={wallTop + 8} width="18" height="18" />
      ))}

      {/* The school's colours, hung from the band at either end. */}
      <HungBanner x={FACADE_BAND_LEFT + BANNER_INSET} y={wallTop} colors={colors} />
      <HungBanner x={FACADE_BAND_LEFT + FACADE_BAND_WIDTH - BANNER_INSET - BANNER_WIDTH} y={wallTop} colors={colors} />

      {order()}
    </svg>
  );
}

export default function StartupScreen({ onStart }: { onStart: (name: string, vernacular: Vernacular, colors: SchoolColors) => void }) {
  const [name, setName] = useState('');
  const [vernacular, setVernacular] = useState<Vernacular>(FOUNDING_VERNACULAR);
  // The third and last question (Plan 18's PR B): which pair the school
  // wears. Held as the table's choice so the picker can show its name; the
  // save takes only the two colours (see schoolColorsOf).
  const [choice, setChoice] = useState<SchoolColorChoice>(FOUNDING_COLORS);
  const colors = schoolColorsOf(choice);

  // The card previews the theme it is choosing: the pick is written to the
  // stylesheet's root properties as it changes, so the begin button, the
  // active picker chip and the banners on the facade all take the pair
  // before it is confirmed. App.tsx writes the same pair again once the
  // run exists, which is a no-op after this.
  useEffect(() => { applySchoolColors(colors); }, [colors.primary, colors.secondary]);

  return (
    <div className="startup">
      <div className="startup-card">
        {/* What the game is, in one line (Plan 17's PR F): a run has a length
            now — the fiftieth summer files the final report and seals the
            record — and the founding screen is where a player should first
            hear it. */}
        <div className="eyebrow">Fifty years to build a university.</div>
        <h1>Name your school</h1>
        <input
          className="startup-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Blackmoor"
          maxLength={60}
        />
        <div className="startup-facade">
          <SchoolFacade name={name} vernacular={vernacular} colors={colors} />
        </div>
        {/* The second question. The facade above redraws as the player
            moves between them, which is what PR J was for: this screen
            already had a preview surface, it just was not previewing
            anything yet.

            ONE ROW OF FIVE, names only. The blurbs were cut from the button
            (they survive as its tooltip): the facade IS the description,
            drawn live, and five cards of prose in a 2x2 grid left a fifth
            card alone on its own row — which reads as a sixth one missing
            rather than as five on offer.

            PERMANENT, and not said in so many words because the drawing says
            it — a campus's architecture is what it was built as, so nothing
            offers to change it later. */}
        <div className="startup-vernaculars" role="radiogroup" aria-label="Architecture">
          {VERNACULAR_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              className={`startup-vern-btn ${vernacular === choice.id ? 'active' : ''}`}
              onClick={() => setVernacular(choice.id)}
              aria-checked={vernacular === choice.id}
              title={choice.blurb}
            >
              {choice.label}
            </button>
          ))}
        </div>
        {/* The colours, beside the vernacular and permanent the same way.
            One even row of two-tone chips (eight — see schoolColors.ts for
            why that number) with the pair's name under the active one; the
            facade's banners and the card's own chrome redraw as the player
            moves between them, which is the preview. */}
        <div className="startup-colors" role="radiogroup" aria-label="School colours">
          {SCHOOL_COLOR_PAIRS.map((pair) => (
            <button
              key={pair.id}
              type="button"
              role="radio"
              className={`startup-color-btn ${choice.id === pair.id ? 'active' : ''}`}
              aria-checked={choice.id === pair.id}
              aria-label={pair.name}
              title={pair.name}
              onClick={() => setChoice(pair)}
            >
              <span className="startup-color-swatch" aria-hidden="true">
                <span style={{ background: pair.primary }} />
                <span style={{ background: pair.secondary }} />
              </span>
            </button>
          ))}
        </div>
        <div className="startup-color-name">{choice.name}</div>
        <button
          className="startup-begin-btn"
          disabled={name.trim().length === 0}
          onClick={() => onStart(name.trim(), vernacular, colors)}
        >
          Open the Doors
        </button>
      </div>
    </div>
  );
}
