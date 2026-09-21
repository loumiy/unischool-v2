// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../engine/useGame, ../state/actions.
import { forwardRef } from 'react';
import type { Action, CampusTool } from '../state/actions';
import type { GameState } from '../state/types';
import { TAB_LABELS, TAB_ORDER, tabAvailable, type TabId } from './TabNav';
import BuildPopup, { visibleBuildableIds } from './BuildPopup';
import { FundsAndStats, SchoolAndClock } from './StatusHeader';
import type { Speed } from '../engine/useGame';
import { visibleCourseIds } from '../tabs/CurriculumTab';
import {
  FacultyIcon, CurriculumIcon, EnrollmentIcon,
  StudentLifeIcon, HistoryIcon, AthleticsIcon, BuildIcon,
  ResearchIcon, HomeIcon,
} from './icons';

// Which tab icons can carry the small red alert badge, and how each decides
// it has something unseen (see types.ts's SeenState). Curriculum is the only
// TAB_ORDER entry with a badge of its own — every other tab (Treasury,
// Enrollment, Student Life, History, Athletics) has no "new content you
// haven't looked at yet" concept, so it's simply absent from this table
// rather than wired to an always-false check.
//
// FACULTY USED TO HAVE ONE, for an unseen candidate in a field the school
// was short on, and it is gone deliberately. A badge is a prompt, and that
// prompt was the last piece of the retired hiring loop: develop everything,
// go appoint whoever the game flagged, repeat. Hiring belongs where the
// shortage is felt — the Curriculum tab, where a course will not start —
// and the Faculty tab is now a place to look at your faculty rather than a
// queue of chores (see FacultyTab.tsx).
const TAB_ALERT: Partial<Record<TabId, (s: GameState) => boolean>> = {
  curriculum: (s) => visibleCourseIds(s).some((id) => !s.seen.courseIds[id]),
};

// C3: Treasury has no icon of its own here — the funds button in the left
// zone (see StatusHeader.tsx's FundsAndStats) is its one entry point now,
// so the middle cluster only needs the tabs that button doesn't cover.
// The row is filtered a second time, per render, by tabAvailable: three of
// these appear only once the thing they are about exists (see TabNav.tsx's
// TAB_GATES), so the row a new university sees is six icons, not nine.
const ICON_TAB_ORDER = TAB_ORDER.filter((id) => id !== 'treasury');

// Tab icons come from icons.tsx (no icon library is installed — see that
// file's own module comment for why these are hand-rolled inline SVG
// rather than a new dependency). TAB_LABELS (TabNav.tsx) still supplies the
// words, now as each button's aria-label/title instead of visible text, so
// the tab set stays just as legible to a screen reader or a hover as it was
// before.
const TAB_ICONS: Record<Exclude<TabId, 'treasury'>, () => React.JSX.Element> = {
  faculty: FacultyIcon,
  curriculum: CurriculumIcon,
  research: ResearchIcon,
  enrollment: EnrollmentIcon,
  studentlife: StudentLifeIcon,
  history: HistoryIcon,
  athletics: AthleticsIcon,
};

// C2 first folded the tab nav, the build rail, and the log strip into one
// docked bottom band; C3 goes further and absorbs the old topbar into the
// same band (see StatusHeader.tsx's module comment) — funds/headline stats
// in the left zone, the tab icons + build in the middle, speed controls and
// the school's own identity/clock in the right zone. Save/New Game/Credits
// moved up into MainMenu.tsx's own top-right overlay instead. The log
// ticker lives just above this band now (see LogTicker.tsx/App.tsx) rather
// than inside it — this component knows nothing about it.
//
// The build popup is the one thing this band can still pop open above
// itself — see ToolbarPopup's own module comment for why it carries no
// dimming backdrop: the campus map has to stay visible and clickable
// around it, since siting a building is a map click made while the popup
// deciding what to build is still open (see BuildPopup.tsx).
const Toolbar = forwardRef<HTMLDivElement, {
  s: GameState;
  // Only threaded through to the build popup, which reports seen buildable
  // ids through it (see types.ts's SeenState) — nothing else in this band
  // dispatches; the Curriculum/Faculty tabs report their own seen ids
  // straight from App.tsx's overlay, not through here.
  act: (a: Action) => void;
  active: TabId | null;
  onChangeTab: (tab: TabId | null) => void;
  // Whether the build popup is open, and the one way to change that. Both
  // live in App.tsx now: build mode and an open tab are two states of one
  // slot, and App is the nearest common ancestor of the two (see its module
  // comment). This band only reports the click.
  buildOpen: boolean;
  onSetBuildOpen: (open: boolean) => void;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  // Threaded straight through to the day squares beside the clock (see
  // StatusHeader.tsx's SchoolAndClock -> DayTicker.tsx): the live fraction
  // of the current week, read through a getter so nothing here re-renders
  // as it moves.
  weekProgress: () => number;
  // Which placeable Buildable is currently picked up for siting, and the
  // active path tool, if any — both lifted all the way to App.tsx now that
  // the build popup (not just the map itself) can arm either one. See
  // App.tsx's module comment for the shared "only one of build-pickup and
  // path-tool is ever live" rule this enforces.
  placingId: string | null;
  onArmPlacement: (id: string | null) => void;
  pathTool: CampusTool | null;
  onSetPathTool: (mode: CampusTool) => void;
}>(({ s, act, active, onChangeTab, buildOpen, onSetBuildOpen, speed, setSpeed, weekProgress, placingId, onArmPlacement, pathTool, onSetPathTool }, ref) => {

  // The next-step line (Plan 16's PR F — see systems/guidance/nextStep.ts)
  // used to run across the top of this band as a fourth, full-width zone,
  // which made the dock two rows tall whenever there was something to say.
  // It lives at the right end of the log ticker now (see LogTicker.tsx),
  // the strip that was already one line of guidance-shaped text.

  // The opening walkthrough rings the one control its current step needs
  // while that control is the thing to click (see state/opening.ts
  // and styles.css's .opening-target): the Build button until the menu is
  // open. Once the door is open the ring moves inside it — to the hall's
  // tile. The last step's door is Founders Hall's panel on the map, which
  // the coach card itself opens, so nothing here rings for it.
  const stage = s.events.opening.stage;
  const ringBuild = stage === 'site-hall' && !buildOpen;

  return (
    <div className="toolbar" ref={ref}>
      <div className="toolbar-left">
        <FundsAndStats
          s={s}
          treasuryOpen={active === 'treasury'}
          onOpenTreasury={() => onChangeTab(active === 'treasury' ? null : 'treasury')}
        />
      </div>

      <nav className="toolbar-tabs">
        {/* HOME leads the row, and is one of the two controls here that is
            not a TabId (Build is the other — see App.tsx). Every tab is a
            full screen now, so "close the thing I am looking at" needed a
            control that is always in the same place rather than only the
            panel's own ✕ in the far corner: this is the button that says
            the campus map is where you came from. It reads as active when
            nothing is open, which is when the player IS at home — an open
            build popup is still something over the map, so that does not
            count as home either. */}
        <button
          type="button"
          className={`toolbar-icon-btn ${active === null && !buildOpen ? 'active' : ''}`}
          aria-label="Campus map"
          title="Campus map"
          onClick={() => { onChangeTab(null); onSetBuildOpen(false); }}
        >
          <HomeIcon />
          <span className="toolbar-tab-label">Campus</span>
        </button>

        {ICON_TAB_ORDER.filter((id) => tabAvailable(s, id)).map((id) => {
          const Icon = TAB_ICONS[id];
          const isActive = active === id;
          // Suppressed while this tab is the active one — see the module
          // comment above: the tab's own effect marks its visible ids seen
          // essentially instantly, but checking isActive here too means the
          // badge can never even flash on for the one render before that
          // effect commits, which is what makes "already had it open when
          // new content unlocked" show no badge at all.
          const hasAlert = !isActive && (TAB_ALERT[id]?.(s) ?? false);
          return (
            <button
              key={id}
              type="button"
              className={`toolbar-icon-btn ${isActive ? 'active' : ''}`}
              aria-expanded={isActive}
              aria-label={TAB_LABELS[id]}
              title={TAB_LABELS[id]}
              onClick={() => onChangeTab(isActive ? null : id)}
            >
              <Icon />
              {/* The word under the glyph (Plan 18's PR A), at every width
                  — the review's finding was that three of these icons look
                  alike at 24px and none says what it opens. The two side
                  zones stack to two rows so this row has the room. */}
              <span className="toolbar-tab-label">{TAB_LABELS[id]}</span>
              {hasAlert && <span className="alert-badge" aria-hidden="true">!</span>}
            </button>
          );
        })}

        <button
          type="button"
          className={`toolbar-icon-btn toolbar-build-btn ${buildOpen ? 'active' : ''} ${ringBuild ? 'opening-target' : ''}`}
          aria-expanded={buildOpen}
          aria-label={buildOpen ? 'Close build menu' : 'Open build menu'}
          title="Build"
          onClick={() => onSetBuildOpen(!buildOpen)}
        >
          <BuildIcon />
          <span className="toolbar-build-label">Build</span>
          {/* Stays lit for as long as ANY category tab holds an unseen tile,
              whether or not the popup is open — opening the popup at its
              default tab is not the same as switching to the tab the new
              building is actually in (see BuildPopup.tsx's own per-tab dot). */}
          {visibleBuildableIds(s).some((id) => !s.seen.buildableIds[id]) && (
            <span className="alert-badge" aria-hidden="true">!</span>
          )}
        </button>
      </nav>

      <div className="toolbar-right">
        <SchoolAndClock s={s} speed={speed} setSpeed={setSpeed} weekProgress={weekProgress} />
      </div>

      {buildOpen && (
        <BuildPopup
          s={s}
          act={act}
          placingId={placingId}
          onArmPlacement={onArmPlacement}
          pathTool={pathTool}
          onSetPathTool={onSetPathTool}
          onClose={() => onSetBuildOpen(false)}
        />
      )}
    </div>
  );
});

export default Toolbar;
