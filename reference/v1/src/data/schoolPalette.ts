// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// ---------------------------------------------------------------------
// THE SCHOOL PALETTE (Plan 14). One hue and one motif per degree-granting
// school, read wherever a program is drawn as belonging to a school before
// the school has a name: the hall panel's offer tiles and program tiles,
// and — from PR G — the Curriculum tab's forty-two rows.
//
// This is the one place the game deliberately breaks the parchment / navy
// / brass register. Seven mid-saturation, mid-luminance hues, colourful
// without being bright, chosen to sit on parchment and to stay distinct at
// row height: "three of this colour already, and I have a hall with three
// slots free" is a conclusion the player reaches by looking, and it only
// works if the colours are told apart at a glance. The MOTIF beside each
// hue is what keeps the grouping legible for a colour-blind player, and
// what a tile too small for a colour swatch can still carry.
//
// Colour, not label: a school's NAME appears only once it is founded (six
// programs of it in one hall — see docs/design/curriculum.md). Until then
// its programs share a hue and a mark and nothing else.
// ---------------------------------------------------------------------

export interface SchoolMark {
  hue: string;   // the school's colour, as a CSS colour
  motif: string; // one glyph, drawn beside or instead of the hue
}

const SCHOOL_MARKS: Record<string, SchoolMark> = {
  'Business': { hue: '#8b3a3a', motif: '◆' },
  'Engineering': { hue: '#a0522d', motif: '⚙' },
  'Arts & Media': { hue: '#7b4b7a', motif: '✦' },
  'Social Sciences & Humanities': { hue: '#5b7a3a', motif: '❧' },
  'Science': { hue: '#2f7a7a', motif: '⚗' },
  'Health Science': { hue: '#b5583f', motif: '✚' },
  'Computer Science': { hue: '#4a6a9a', motif: '▣' },
};

// Anything the table does not know: the ordinary brass, so an unmarked
// thing reads as unmarked rather than as a school.
const NO_MARK: SchoolMark = { hue: '#8a7a4a', motif: '·' };

export function schoolMark(school: string): SchoolMark {
  return SCHOOL_MARKS[school] ?? NO_MARK;
}
