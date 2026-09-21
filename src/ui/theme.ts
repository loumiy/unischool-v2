import type { SchoolColors } from '../sim/index.ts';

// THE ONE PLACE THE SCHOOL'S COLOURS REACH THE STYLESHEET. tokens.css
// declares the pair on :root with the default as literals; this writes the
// founded school's pair over them, and every chrome surface follows from
// those four properties without knowing a school exists. Called from App
// once the run has an identity, and from the startup screen as the player
// moves between pairs so the card previews the theme it is choosing.
//
// --school-on-primary is the register's cream for every authored pair and
// --school-on-secondary is the primary itself (content/palettes.json's
// contrast rule guarantees both are readable).
export const TEXT_ON_PRIMARY = '#f7f2e8';

export function applySchoolColors(colors: SchoolColors): void {
  const root = document.documentElement.style;
  root.setProperty('--school-primary', colors.primary);
  root.setProperty('--school-secondary', colors.secondary);
  root.setProperty('--school-on-primary', TEXT_ON_PRIMARY);
  root.setProperty('--school-on-secondary', colors.primary);
}
