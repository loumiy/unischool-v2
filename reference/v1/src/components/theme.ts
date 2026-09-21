// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import type { SchoolColors } from '../state/types';
import { TEXT_ON_PRIMARY } from '../data/schoolColors';

// THE ONE PLACE THE SCHOOL'S COLOURS REACH THE STYLESHEET (Plan 18's PR B).
// styles.css declares --school-primary and --school-secondary on :root with
// the default pair as literals; this writes the founded school's pair over
// them on the root element, and every chrome surface — the dock, the active
// tab, the primary button, the focus ring, the two derived chrome tones —
// follows from those four properties without knowing a school exists.
//
// Called from App.tsx once the run has started (and again on load, which
// is the same thing), and from the startup screen as the player moves
// between pairs, so the founding card previews the theme it is choosing.
//
// --school-on-primary is the register's cream for every authored pair and
// --school-on-secondary is the primary itself; both are set here anyway so
// the four always change together and a stale one cannot survive a pick.
export function applySchoolColors(colors: SchoolColors): void {
  const root = document.documentElement.style;
  root.setProperty('--school-primary', colors.primary);
  root.setProperty('--school-secondary', colors.secondary);
  root.setProperty('--school-on-primary', TEXT_ON_PRIMARY);
  root.setProperty('--school-on-secondary', colors.primary);
}
