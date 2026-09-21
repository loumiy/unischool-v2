// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../data/facultyData.
import type { Faculty } from '../state/types';
import { facultyQualityTier } from '../data/facultyData';

// WHO THIS CAN DRAW. The portrait reads exactly four things off its subject,
// so that is what it asks for — rather than a Faculty, which is most of a
// person this file never looks at.
//
// Generalized when varsity coaches wanted faces too (see tabs/AthleticsTab.tsx).
// The alternative was a second copy of the trait tables below, which would
// have doubled a 250-line file to avoid a four-field interface, and would
// have drifted the moment either copy gained a hairstyle.
//
// `seniority` is the one thing the two kinds of person compute differently:
// a professor's comes from facultyQualityTier (teaching + research), a
// coach's from their single `quality`. So the caller supplies it already
// resolved — see portraitOf below — rather than this file learning about
// either.
export interface Portrayed {
  id: string;         // every trait is a hash bucket off this, so the same person draws identically forever
  gender: 'male' | 'female';
  heritage: string;   // weights skin tone (see HERITAGE_SKIN_TONES)
  seniority: number;  // 0..1 — how likely to have gone gray
}

// A professor, as the portrait sees them.
export function portraitOf(f: Faculty): Portrayed {
  return {
    id: f.id,
    gender: f.gender,
    heritage: f.heritage,
    seniority: GRAY_CHANCE_BY_TIER[facultyQualityTier(f)] ?? GRAY_CHANCE_BY_TIER.Adjunct,
  };
}

// Procedural faculty headshots. Same house rule as icons.tsx and
// CampusMap.tsx: no icon library, no external art, hand-rolled inline SVG —
// but unlike icons.tsx's toolbar glyphs (which inherit `currentColor` on
// purpose, since they sit inside a button that recolors itself), a headshot
// is illustrative content, so it hardcodes real colors the same way
// CampusMap.tsx's dorm/facility tiles do.
//
// Deterministic per faculty id, the same way CampusMap.tsx's hashTint picks
// a dorm's color from its id: a professor must render identically every
// time — on every re-render, on every tab switch, after a reload — without
// storing a single extra byte of "what they look like" in the save. A small
// hash of (salt + id) buckets each independent trait (hairstyle WITHIN a
// pool, hair color, skin tone WITHIN a heritage's weighting, glasses,
// background tint) on its own, so they vary independently instead of all
// of them moving together off one number.
//
// Hairstyle/garment and skin tone each start from a real stored field
// rather than a flat hash, though: hairstyle/garment pick which pool to
// hash within based on Faculty.gender, and skin tone weights ITS pool by
// Faculty.heritage (see HERITAGE_SKIN_TONES below) — unlike "what color is
// this person's hair", presentation and apparent ethnicity aren't things a
// portrait should invent independently of the person it's drawing. Either
// it uses the fields the game already rolled for exactly this purpose, or
// a name and a face that disagreed on either would read as a bug, not
// variety.

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return h;
}

// One independent bucket per (salt, faculty). Salting the hash rather than
// reusing one number for every trait is what keeps skin tone, hairstyle,
// hair color, glasses and background from all swinging together off a
// single roll — two professors who happen to share a bucket on one trait
// are still very unlikely to share it on the other four.
function bucket(id: string, salt: string, count: number): number {
  return hash(`${salt}:${id}`) % count;
}

const SKIN_TONES = ['#f2c9a0', '#e0a878', '#c68642', '#8d5524', '#5c3a21'];

// Biases skin tone toward what a person's rolled heritage (NAME_POOLS'
// origin — see types.ts's Faculty.heritage) would plausibly produce,
// instead of a flat draw across all five tones for everyone. Each list is
// a WEIGHTED spread over SKIN_TONES indices, not a single fixed tone —
// repeats bias the odds without making a whole heritage into one
// interchangeable skin color, since real diversity within any one
// heritage is exactly the thing a rigid 1-to-1 mapping would erase.
// Deliberately keyed off `heritage`, never `nationality`: nationality is
// disproportionately American regardless of heritage (see
// AMERICAN_NATIONALITY_CHANCE in facultyData.ts), and most real Americans
// span every one of these tones — tying skin tone to a passport instead of
// a name's cultural origin would be the actually illogical version of
// this.
const HERITAGE_SKIN_TONES: Record<string, number[]> = {
  // Chinese/Korean/Japanese share one weighting, same as they did as one
  // combined "East Asian" pool before facultyData.ts split the NAMES apart
  // for accuracy (see NAME_POOLS there) — five flat swatches have nothing
  // finer to say about the three than the old pool already did, so there's
  // no real distinction to draw here just because the names now are.
  'Chinese': [0, 0, 1, 1, 2],
  'Korean': [0, 0, 1, 1, 2],
  'Japanese': [0, 0, 1, 1, 2],
  'South Asian': [1, 2, 2, 3, 3],
  'Anglo/Western European': [0, 0, 0, 1, 1],
  'Hispanic/Latin American': [0, 1, 1, 2, 2, 3],
  'Arabic/Middle Eastern': [0, 1, 1, 2, 2],
  'Slavic/Eastern European': [0, 0, 0, 1, 1],
  // Same reasoning as Chinese/Korean/Japanese above, mirrored: West
  // African/East African were one combined "West/East African" pool's
  // worth of skin tone weighting before the NAME split, and still share it.
  'West African': [2, 3, 3, 4, 4],
  'East African': [2, 3, 3, 4, 4],
};

function skinTone(f: Portrayed): string {
  const weights = HERITAGE_SKIN_TONES[f.heritage] ?? SKIN_TONES.map((_, i) => i);
  return SKIN_TONES[weights[bucket(f.id, 'skin', weights.length)]];
}

// Black / dark brown / light brown-blonde / gray-white. Gray is not just
// another equally-likely bucket — see grayChance below — so it is singled
// out rather than folded into a flat 4-way hash like every other trait.
const HAIR_COLORS = ['#1b1712', '#3b2314', '#8a5a2b'];
const GRAY_HAIR = '#c8c2b8';

// A senior professor is more likely to have gone gray — a small, deliberate
// nod rather than a hard rule (a Distinguished professor going gray 65% of
// the time still leaves plenty who haven't, same as real faculty). Reads
// facultyQualityTier rather than tenureWeeks directly since a CANDIDATE
// (tenureWeeks always 0) can still be senior-caliber the moment they're
// rolled, and the portrait should read that the same way a hire's does.
const GRAY_CHANCE_BY_TIER: Record<string, number> = {
  Distinguished: 0.65,
  Full: 0.4,
  Associate: 0.2,
  Assistant: 0.1,
  Adjunct: 0.08,
};

function hairColor(f: Portrayed): string {
  const grayChance = f.seniority;
  const roll = bucket(f.id, 'hairGray', 100);
  if (roll < grayChance * 100) return GRAY_HAIR;
  return HAIR_COLORS[bucket(f.id, 'hairColor', HAIR_COLORS.length)];
}

// Muted parchment-family tints so a row of portraits reads as part of the
// same sheet as everything else on the panel, not a clashing sticker — see
// styles.css's --parchment/--gold/--brass-deep for the palette this pulls
// from and lightens/darkens off of.
const BACKGROUND_TINTS = ['#d7c9a3', '#c9b98f', '#b9c9a8', '#c2b6c4', '#c8b49a'];

// --- Hairstyles ---------------------------------------------------------
// Each is an SVG fragment string keyed to the head circle below (center
// 12,9.5 radius 4.6). A few need a piece drawn BEHIND the head (long hair
// framing the sides/back) as well as the usual cap on top, hence the
// {back, front} shape rather than one path.
interface HairStyle { back?: string; front: string }

const MALE_HAIR: HairStyle[] = [
  // Bald/shaved: no shape at all.
  { front: '' },
  // Short crop: a simple cap hugging the top of the head.
  { front: 'M7.2 8.6a4.8 4.8 0 0 1 9.6 0c0 .5-.1.9-.2 1.3-1.5-1.7-3.4-1.9-4.6-1.9s-3.1.2-4.6 1.9c-.1-.4-.2-.8-.2-1.3Z' },
  // Side part: cap plus a short diagonal parting line.
  { front: 'M7.2 8.4a4.8 4.8 0 0 1 9.6.2c0 .5-.1.9-.2 1.3-1.4-1.6-3.1-1.9-4.3-1.9-.6 0-1.5.4-2.1 1.1M11 6.3l.4 2.7' },
  // Curly/coiled short hair: overlapping bumps along the top.
  { front: 'M7.3 8.7a1.5 1.5 0 1 1 2.4-1.6 1.5 1.5 0 1 1 2.6-1 1.5 1.5 0 1 1 2.6.9 1.5 1.5 0 1 1 2.4 1.6c.1.4.1.9 0 1.3-1.5-1.6-3.4-1.8-4.6-1.8s-3 .2-4.6 1.8c-.1-.4-.1-.9.2-1.2Z' },
  // Receding: a smaller cap pulled back from the forehead, pairs well with
  // gray on an older-reading professor.
  { front: 'M7.6 7.7a4.8 4.8 0 0 1 8.9-1.1c.5.9.7 1.9.5 2.9-1.3-1.4-2.9-1.6-3.9-1.4-.7.1-1.3.5-1.7 1-.5-.6-1.2-1-2-1.1-.9-.1-1.7.1-2.4.6.1-.3.3-.6.6-.9Z' },
];

// The two side strands long hair (straight or curly) hangs behind the
// head/shoulders — built as two explicitly mirrored quadratic curves
// (each side's x coordinates are the other's 24-minus, checked by hand)
// rather than one hand-plotted closed path, after an earlier version of
// this shape drifted asymmetric (a real, visible bug caught in review: one
// side read fine, the other read like a rendering error).
const LONG_HAIR_STRANDS = 'M6.8 7.8 Q5.6 13 6.8 19 L8.6 19 Q7.6 13 8.4 7.8 Z M17.2 7.8 Q18.4 13 17.2 19 L15.4 19 Q16.4 13 15.6 7.8 Z';

const FEMALE_HAIR: HairStyle[] = [
  // Long straight: the shared side-strand shape behind a plain fringe.
  {
    back: LONG_HAIR_STRANDS,
    front: 'M7.2 8.6a4.8 4.8 0 0 1 9.6 0c0 .4-.1.8-.1 1.1-1.5-1.5-3.4-1.7-4.7-1.7s-3.2.2-4.7 1.7c0-.3-.1-.7-.1-1.1Z',
  },
  // Bun/tied-back: cap on top, small bun at the back-top.
  { front: 'M7.2 8.6a4.8 4.8 0 0 1 9.6 0c0 .5-.1.9-.2 1.3-1.5-1.7-3.4-1.9-4.6-1.9s-3.1.2-4.6 1.9c-.1-.4-.2-.8-.2-1.3ZM14.6 4.6a1.6 1.6 0 1 1 2 1.5 3 3 0 0 0-2-1.5Z' },
  // Bob: the same proven fringe cap as long-straight/curly, plus two small
  // mirrored side panels reaching jaw level. A from-scratch single-path
  // attempt at this shape put its face-opening curve on the wrong side of
  // the panel (bulging IN over the face instead of away from it), which
  // swallowed almost the whole face behind solid hair — composing known-
  // good pieces avoids re-deriving that geometry by hand a third time.
  { front: 'M7.2 8.6a4.8 4.8 0 0 1 9.6 0c0 .4-.1.8-.1 1.1-1.5-1.5-3.4-1.7-4.7-1.7s-3.2.2-4.7 1.7c0-.3-.1-.7-.1-1.1Z M7.3 8.4Q6.3 11 7.6 13.3L9.2 13.3Q8.2 11 8.7 8.4Z M16.7 8.4Q17.7 11 16.4 13.3L14.8 13.3Q15.8 11 15.3 8.4Z' },
  // Curly/coiled long: the male curly style's already-symmetric bumpy cap,
  // reused verbatim, plus the same mirrored side strands long straight
  // uses — the earlier from-scratch version's own bumps drooped into two
  // heavy, uneven blobs that read as earmuffs rather than curls.
  {
    back: LONG_HAIR_STRANDS,
    front: 'M7.3 8.7a1.5 1.5 0 1 1 2.4-1.6 1.5 1.5 0 1 1 2.6-1 1.5 1.5 0 1 1 2.6.9 1.5 1.5 0 1 1 2.4 1.6c.1.4.1.9 0 1.3-1.5-1.6-3.4-1.8-4.6-1.8s-3 .2-4.6 1.8c-.1-.4-.1-.9.2-1.2Z',
  },
  // Pixie: a small, soft cap — shorter coverage than the bob, similar
  // silhouette weight to the male short crop but rounder at the temples.
  { front: 'M7.4 8.9a4.6 4.6 0 0 1 9.2-.3c0 .5-.1.9-.3 1.3-1.4-1.5-3.1-1.7-4.3-1.7-1.1 0-2.7.2-4 1.5-.3-.3-.5-.5-.6-.8Z' },
];

// --- Garment (shoulders/collar) -----------------------------------------
const SHIRT_COLORS = ['#f5f2e8', '#7a97b0', '#4a4a52', '#2f3e5c'];
const BLOUSE_COLORS = ['#f6ede0', '#7a3b46', '#3f6b63', '#2f3e5c'];

// Slightly darkens a hex color, for the collar fold's shadow line — a
// same-hue shade reads as fabric folding, rather than a mismatched trim.
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

export default function FacultyPortrait({ f, size = 24 }: { f: Portrayed; size?: number }) {
  const skin = skinTone(f);
  const hair = hairColor(f);
  const bg = BACKGROUND_TINTS[bucket(f.id, 'bg', BACKGROUND_TINTS.length)];
  const wearsGlasses = bucket(f.id, 'glasses', 3) === 0; // ~1 in 3

  const hairPool = f.gender === 'male' ? MALE_HAIR : FEMALE_HAIR;
  const style = hairPool[bucket(f.id, 'hairStyle', hairPool.length)];

  const garmentPool = f.gender === 'male' ? SHIRT_COLORS : BLOUSE_COLORS;
  const garment = garmentPool[bucket(f.id, 'garment', garmentPool.length)];
  const collarShade = darken(garment, 20);
  const clipId = `portrait-clip-${f.id}`;

  return (
    <svg className="faculty-portrait" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="12" fill={bg} />
      <g clipPath={`url(#${clipId})`}>
        {style.back && <path d={style.back} fill={hair} />}
        {/* Shoulders: a wide "hill" wider than the frame, cropped by the
            clip path above so the garment reads as extending past the
            photo's edge — the same effect a real headshot crop has. */}
        <path d="M0 24 L0 18.5 Q12 12.5 24 18.5 L24 24 Z" fill={garment} />
        {/* Neck — drawn BEFORE the collar below, so the collar sits on top
            of it (a real collar wraps around/over the neck, not the other
            way around). */}
        <rect x="10.3" y="13" width="3.4" height="4" fill={skin} />
        {/* Collar: two triangular flaps at the neckline, a shade darker than
            the garment, each with real width at the shoulder line so they
            read as a fold rather than converging into one thin arrow, and
            each reaching inward PAST the neck's own edges (10.3/13.7) so it
            visibly overlaps the neck rather than just meeting it. A
            collared shirt's flaps come to points; a blouse's neckline is a
            single soft scoop instead. */}
        {f.gender === 'male'
          ? (
            <path
              d="M8.8 15.6 L12 18.6 L11 15.3 Z M15.2 15.6 L12 18.6 L13 15.3 Z"
              fill={collarShade}
            />
          )
          : <path d="M8.9 15.8 Q12 18.6 15.1 15.8 L15.1 17.6 Q12 20.1 8.9 17.6 Z" fill={collarShade} />}
        {/* Head */}
        <circle cx="12" cy="9.5" r="4.6" fill={skin} />
        <path d={style.front} fill={hair} />
        {wearsGlasses && (
          <path
            d="M9.05 10.1a0.95 0.95 0 1 0 1.9 0 0.95 0.95 0 1 0-1.9 0ZM13.05 10.1a0.95 0.95 0 1 0 1.9 0 0.95 0.95 0 1 0-1.9 0ZM10.95 10.1h1.1"
            fill="none"
            stroke="#3a342c"
            strokeWidth="0.55"
          />
        )}
      </g>
    </svg>
  );
}
