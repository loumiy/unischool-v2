// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../systems/guidance/nextStep.
import type { GameState } from '../state/types';
import ToolbarPopup from './ToolbarPopup';
import LogStrip from './LogStrip';
import { LogIcon } from './icons';
import { nextStep, type NextStep } from '../systems/guidance/nextStep';

// One line, always on screen, directly above the toolbar (see styles.css's
// .log-ticker): the single newest entry in s.log (newest first — see
// types.ts's LogEntry), which used to be generated every week — an
// admissions summary, a grant awarded, a demand met or missed — and simply
// thrown away, since nothing rendered it after C3's toolbar consolidation
// dropped its old slot (see Toolbar.tsx and LogStrip.tsx's own module
// comment). Only the small icon on the left is a button — the text itself
// is plain, un-clickable content, same as the toolbar's own funds/stats
// readouts below it: a whole wide strip acting as one giant click target
// read as a mis-click waiting to happen, not an affordance. LogIcon
// (icons.tsx) is the toolbar's own pre-C2 log glyph, otherwise unused
// since that refactor — the same glyph, just relocated rather than
// invented fresh. Clicking it expands into the fuller scrollable feed
// LogStrip.tsx already renders correctly, in the same ToolbarPopup shape
// the build menu uses (see styles.css's .log-popup, sized and positioned
// for exactly this since before this ticker existed).
// The popup's open/closed state is App's, not this component's: it is the
// innermost rung of the shell's one Escape ladder, and the ladder can only
// be one handler if the handler can see every rung (see App.tsx).
//
// THE NEXT STEP RIDES HERE TOO (Plan 16's PR F — see systems/guidance/
// nextStep.ts), at the strip's right end: a reading of the highest-value
// thing on offer, or nothing, a button when it names somewhere to go. It
// used to run across the top of the toolbar as a fourth, full-width zone,
// which made the dock two rows tall whenever it had something to say; this
// strip was already one line of the same shape of text, and the two share
// it — the log on the left says what just happened, the step on the right
// says what to do about it. Suppressed while an interrupt is up: the modal
// is the one thing to do then.
export default function LogTicker({ s, open, onSetOpen, onGo }: {
  s: GameState; open: boolean; onSetOpen: (open: boolean) => void;
  onGo: (go: NonNullable<NextStep['go']>) => void;
}) {
  const latest = s.log[0];
  const step = s.pendingInterrupt ? null : nextStep(s);

  return (
    <>
      <div className="log-ticker">
        <button
          type="button"
          className="log-ticker-toggle"
          aria-expanded={open}
          aria-label={open ? 'Close activity log' : 'Open activity log'}
          onClick={() => onSetOpen(!open)}
        >
          <LogIcon />
        </button>
        {latest ? (
          <span className={latest.kind}>
            <span className="ts">Y{latest.year}W{latest.week}</span>
            {latest.message}
          </span>
        ) : (
          <span className="log-ticker-empty">No activity yet.</span>
        )}
        {step && (
          <span className="log-ticker-next">
            <span className="log-ticker-next-label">Next</span>
            {step.go ? (
              <button type="button" className="log-ticker-next-text" onClick={() => { if (step.go) onGo(step.go); }}>
                {step.text}
              </button>
            ) : (
              <span className="log-ticker-next-text">{step.text}</span>
            )}
          </span>
        )}
      </div>
      {open && (
        <ToolbarPopup title="Activity Log" onClose={() => onSetOpen(false)} className="log-popup">
          <LogStrip s={s} />
        </ToolbarPopup>
      )}
    </>
  );
}
