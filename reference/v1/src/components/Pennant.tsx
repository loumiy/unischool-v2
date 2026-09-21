// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { institutionName, type GameState } from '../state/types';

// THE PENNANT (Plan 18): the school's name, hung from the top-left corner
// of the map in the school's own colours — the one piece of chrome that is
// identity rather than instrument. It used to sit in the toolbar's right
// zone beside the clock; moving it out is what gave the band its room.
//
// ONE NAME, in one face at one size: "Blackmoor University", the way the
// institution says it, joined by institutionName the same as everywhere
// else. It was briefly two lines — the typed half, then "College" or
// "University" smaller beneath — so that the charter promotion would read
// as the second line changing; that made the name read as a name with a
// caption under it, and the promotion has its own modal to be a moment in.
// A long name wraps; it does not shrink.
//
// Shown over the map only. A tab is a full-bleed screen with its own title
// in the same corner (see TabOverlay.tsx), so App.tsx withholds this while
// one is open rather than hanging a pennant over the word "Curriculum".
// Inert — nothing to click — so it lets clicks fall through to the map.
export default function Pennant({ s }: { s: GameState }) {
  return (
    <div className="pennant">
      <div className="pennant-body">
        <span className="pennant-name">{institutionName(s.self)}</span>
      </div>
      <div className="pennant-tail" aria-hidden="true" />
    </div>
  );
}
