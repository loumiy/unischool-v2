// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ./components/DebugPanel, ./components/InterruptModal, ./components/OpeningCoach, ./data/techData, ./engine/useGame, ./state/actions, ./tabs/AthleticsTab, ./tabs/EnrollmentTab, ./tabs/FacultyTab, ./tabs/HistoryTab, ./tabs/ResearchTab, ./tabs/StudentLifeTab, ./tabs/TreasuryTab.
// v1's root composition. Read it for the chrome layout grammar (what sits where); the useGame wiring and tab gating are v1 architecture.
import type { CampusTool } from './state/actions';
import { useEffect, useRef, useState } from 'react';
import { useGame } from './engine/useGame';
import { mapBackOutLive, mapControlsLive, useHotkeys, type ShellOverlays } from './components/hotkeys';
import type { GameState } from './state/types';
import StartupScreen from './components/StartupScreen';
import MainMenu from './components/MainMenu';
import Pennant from './components/Pennant';
import DebugPanel from './components/DebugPanel';
import InterruptModal from './components/InterruptModal';
import { GATED_TABS, TAB_LABELS, tabAvailable, type TabId } from './components/TabNav';
import CampusMap from './components/CampusMap';
import { FOUNDERS_HALL_ID } from './data/techData';
import Toolbar from './components/Toolbar';
import LogTicker from './components/LogTicker';
import Toasts from './components/Toasts';
import TabOverlay from './components/TabOverlay';
import { useCssHeightVar } from './components/useCssHeightVar';
import { applySchoolColors } from './components/theme';
import OpeningCoach from './components/OpeningCoach';
import type { OpeningStage } from './state/types';
import FacultyTab from './tabs/FacultyTab';
import CurriculumTab from './tabs/CurriculumTab';
import ResearchTab from './tabs/ResearchTab';
import TreasuryTab from './tabs/TreasuryTab';
import EnrollmentTab from './tabs/EnrollmentTab';
import StudentLifeTab from './tabs/StudentLifeTab';
import HistoryTab from './tabs/HistoryTab';
import AthleticsTab from './tabs/AthleticsTab';
import './styles.css';

// The dashboard shell, built around the campus map as a full-viewport
// BACKGROUND: the map fills the whole screen behind everything, always
// present and never gated behind a tab, and every piece of chrome —
// status header, bottom toolbar, and every tab's panel — floats ON TOP of
// it rather than sharing a bordered column with it. With no tab open the
// player is simply looking at the world, control bar over it; the map is
// the one screen the player always comes back to, and no view is ever more
// than one Escape away from it.
//
// CampusMap itself renders as a plain sibling BEFORE `.app` (see below,
// and styles.css) so the chrome layer's own box never sits between the
// player's cursor and the map — `.app` is pointer-events: none with only
// its direct children (the actual floating cards) re-enabled, so a click
// anywhere the chrome is visually empty falls straight through to the map.
//
// EVERY TAB IS A SCREEN. There is one overlay shape, not two. This module
// used to name a FULL_BLEED_TABS subset and argue for the split: that
// Treasury, Enrollment and History are read-and-leave pages where a full
// screen would only make a short page look empty, and where keeping the map
// visible around the edges reminds the player they are one Escape away from
// it. That argument loses to the one the playtest notes make. A shell that
// answers "what happens when I click a tab?" the same way every time is
// worth more than a per-tab fit, and almost every other note in those notes
// — the Faculty rework, build mode never overlaying a tab, Space closing a
// tab instead of pausing — was downstream of the shell not having settled
// this one question. So: the panel takes the viewport, the dock is laid over
// it, and the player leaves by Escape, the close button, or the home button
// at the head of the toolbar's icon row.
//
// BUILD AND A TAB ARE THE SAME SLOT, which is the other half of the same
// decision. Build mode only means anything while the player is looking at
// the map, so the two states are mutually exclusive by construction rather
// than by anyone remembering: opening the build popup sets `overlay` to
// null, and opening any tab closes the popup. Clicking Build from inside a
// tab therefore reads as one action — the tab closes, the map is there, the
// build menu is open over it. This is the same kind of invariant, one layer
// up, as the "only one of build-pickup and path-tool is ever live" rule
// further down.
//
// AND ONE ESCAPE LADDER, which is the same decision read backwards: if the
// shell owns what is open, the shell owns the key that backs out of it. See
// the handler below for the rungs.
//
// The tab components themselves are untouched by this: they still read
// their slice of GameState and dispatch actions exactly as before, and know
// nothing about being rendered in an overlay.
//
// C2 unifies what used to be three separate floating pieces — the tab nav,
// the build rail, and the log ticker — into one bottom Toolbar (see
// Toolbar.tsx), reclaiming the side rail's column entirely. C3 goes
// further and removes the topbar altogether: everything it used to show
// (the school's identity, the headline stats, speed/save controls) now
// lives either in that same bottom Toolbar or in the top-right corner
// overlays (MainMenu's hamburger, the map's own zoom/'?' pill — see
// CampusMap.tsx), so the map now only insets away from the toolbar
// (bottom), never from the top or a right-hand rail. The toolbar has a
// real, non-constant height — its content can wrap at narrower widths (see
// styles.css's media queries) — so a fixed CSS inset would either waste
// map area on a wide screen or, worse, leave a strip of tiles physically
// under an opaque panel — on screen but never clickable — on a narrower
// one. `useCssHeightVar` keeps `--toolbar-height` synced to its real
// rendered height, which is what .campus-map-canvas (see styles.css)
// insets its interactive area by, so every tile stays reachable at any
// viewport size. The log ticker C2 folded away is back as LogTicker.tsx —
// its own thin strip stacked above the toolbar rather than a fourth zone
// inside it, at a fixed (not measured) height, since one line of text never
// wraps the way the toolbar's own zones can.

// The three views with a letter of their own. Deliberately a SUBSET of
// TAB_ORDER rather than one key per tab: these are the three a player dips
// into and back out of constantly mid-run, and every extra letter claimed
// here is one the map can never use. Treasury already has a permanent
// on-screen figure that opens it, and Enrollment/Athletics/History are
// places you go once a year rather than mid-week. Each key TOGGLES, exactly
// like clicking the same tab's toolbar icon twice.
const TAB_HOTKEYS: Record<string, TabId> = {
  c: 'curriculum',
  f: 'faculty',
  l: 'studentlife',
};

export default function App() {
  const { state, act, speed, setSpeed, weekProgress } = useGame();
  const s: GameState = state;
  // null = looking at the map itself, with nothing open over it.
  //
  // A tab plus an OPTIONAL TARGET inside it, rather than a bare TabId: some
  // ways of opening a tab are about a specific thing in it — a hall on the
  // map offering "open this school in the Curriculum" — and the alternative
  // is a second channel running alongside this one, which is how two
  // sources of truth about what is open get started. The target is consumed
  // by the tab and cleared (see onTargetConsumed below), so clicking the
  // same hall twice arrives twice rather than once.
  const [overlay, setOverlay] = useState<{ tab: TabId; target?: string } | null>(null);
  // THE WAY BACK TO A HALL. The Curriculum tab's "Found in <hall>" closes
  // the tab and opens that hall's panel on the map — the panel is where a
  // program is founded, and the tab is where a player learns there is
  // room. The same one-way channel the overlay target is: set here,
  // consumed by the map and cleared, so the same door works twice.
  const [inspectTarget, setInspectTarget] = useState<string | null>(null);
  // Which building's panel the map has open, reported back by the map
  // (it owns that state — see CampusMap.tsx's inspectedId) so the opening
  // walkthrough's card can tell whether its door is open.
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  // Which placeable Buildable (building/dorm/facility) is currently picked
  // up for siting, if any, and which path-drawing tool (if any) is active —
  // the two pieces of CampusMap's transient UI state that have to live here
  // rather than inside CampusMap itself, since C2's build popup (Toolbar.tsx
  // -> BuildPopup.tsx) can now arm either one too, not just the map itself.
  // Placement is how a placeable Buildable starts (see PLACE_BUILDABLE), and
  // BuildPopup's "site →" row is where that pickup can be armed from; the
  // draw/erase path buttons living in that same popup are the other half.
  // This is the nearest shared ancestor of every component that needs
  // either one.
  const [placingId, setPlacingIdState] = useState<string | null>(null);
  const [pathTool, setPathToolState] = useState<CampusTool | null>(null);
  // Whether the build popup is open. It lives here rather than in Toolbar,
  // where it used to, because it is not the toolbar's private business: it
  // and `overlay` are two states of ONE slot (see the module comment), and
  // this is the nearest common ancestor of both — the same reason placingId
  // and pathTool are already here.
  const [buildOpen, setBuildOpenState] = useState(false);
  // And whether the activity-log popup is open, up here for the same reason
  // one rung further down: it is the innermost thing the shell can have
  // open, so Escape has to be able to see it (see the ladder below).
  const [logOpen, setLogOpen] = useState(false);
  const toolbarRef = useCssHeightVar('--toolbar-height');

  // C / F / L open the three views that get opened most (see TAB_HOTKEYS).
  // Held back while an interrupt is pending: that modal is the one thing in
  // the game the player must answer before anything else, and opening a tab
  // underneath it would put a panel behind a dialog that already covers it.
  useHotkeys((e) => {
    if (s.pendingInterrupt) return;
    const tab = TAB_HOTKEYS[e.key.toLowerCase()];
    if (!tab) return;
    // openTab refuses an unavailable tab, so a letter cannot route to a
    // view the toolbar is not offering (see tabAvailable). None of C/F/L is
    // gated today; this is so that stays true if one ever is.
    openTab(overlay?.tab === tab ? null : tab);
  }, s.started);

  // A GATE OPENING IS NEWS. Research, Athletics and History each appear the
  // week the thing they are about becomes real (TabNav.tsx's TAB_GATES), and
  // a ninth icon quietly arriving in a row of eight is a tab nobody
  // notices — so the first time each gate is found open, the log says so.
  //
  // Except on the first render of a run, which seeds the same bookkeeping
  // SILENTLY: a resumed save arrives with its labs already built and its
  // teams already playing, and announcing three views it has had for a
  // decade would be a lie in the activity log. Everything after that first
  // pass is a gate that genuinely opened while the player was watching.
  // The ref holds the ids already reported, not just a "have we started
  // yet" flag: a dispatch does not change `s` until the next render, and
  // under StrictMode this effect runs twice before that render happens, so
  // a flag alone would report the same gate twice — the second time as
  // news.
  const reportedGates = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!s.started) return;
    const firstPass = reportedGates.current === null;
    const reported = reportedGates.current ?? new Set<string>();
    reportedGates.current = reported;
    for (const id of GATED_TABS) {
      if (!tabAvailable(s, id) || s.seen.tabIds[id] || reported.has(id)) continue;
      reported.add(id);
      act({ type: 'NOTE_TAB_AVAILABLE', id, label: TAB_LABELS[id], announce: !firstPass });
    }
  });

  // A tab that is open when its own gate closes again (the last varsity
  // team disbands) closes with it, rather than leaving the player inside a
  // view the toolbar no longer offers a way back into.
  useEffect(() => {
    if (overlay && !tabAvailable(s, overlay.tab)) setOverlay(null);
  }, [overlay, s]);

  // The school's colours are the theme (Plan 18's PR B — see theme.ts):
  // written to the stylesheet's root properties once the run exists, which
  // covers a fresh founding and a loaded save alike. The startup screen
  // applies its own live pick before this runs, so there is never a frame
  // of the wrong pair between "Open the Doors" and the first render.
  useEffect(() => {
    if (s.started) applySchoolColors(s.self.colors);
  }, [s.started, s.self.colors]);

  // The map's own keys (W/A/S/D and the arrows to pan, P for the path tool,
  // R to rotate, Escape to back out) answer only while the player is
  // actually looking at the map. With a tab open over it or an interrupt
  // halting the clock, the keyboard belongs to what's on top — Escape
  // closes the overlay rather than dropping a path tool behind it, and
  // panning a map nobody can see is just a camera that has moved by the
  // time they come back to it.
  // ...and only while nothing of the shell's own is open over it either:
  // every one of those is a rung above the map on the Escape ladder below,
  // and panning a map behind an open popup is a camera that has moved by
  // the time the player comes back to it.
  //
  // Two answers, not one. The build popup leaves the map live underneath it
  // (it has no backdrop) and is where the map's own tools are reached from,
  // so it takes exactly one key from the map — Escape, which App's ladder
  // below has to arbitrate. Panning, R and P keep working under it. See
  // hotkeys.ts, which owns both rules and the reasoning.
  const overlays: ShellOverlays = {
    overlayOpen: overlay !== null,
    buildOpen,
    logOpen,
    interrupted: s.pendingInterrupt !== null,
  };
  const mapBackOutEnabled = mapBackOutLive(overlays);
  const mapControlsEnabled = mapControlsLive(overlays);

  // Picking up a building for siting and drawing/erasing a path are two
  // different jobs for the same click on the same grid, so exactly one is
  // ever live — see CampusMap.tsx's own (pre-C2) version of this rule.
  // Arming a placement always drops whatever path tool was active, and
  // engaging a path tool always drops whatever was picked up for siting.
  function setPlacingId(id: string | null) {
    setPlacingIdState(id);
    if (id !== null) setPathToolState(null);
  }
  function setPathTool(mode: CampusTool) {
    setPathToolState((cur) => (cur === mode ? null : mode));
    setPlacingIdState(null);
  }

  // Closing the build popup drops whatever path tool it had armed: a path
  // tool is the popup's own control (it is only armed from in there, or by
  // P), so it should not outlive the popup. A picked-up building is NOT
  // dropped here — the popup carries no backdrop precisely so the map stays
  // clickable underneath it, so collapsing the popup to see the ground you
  // are about to build on is part of siting, not a cancellation of it.
  function closeBuild() {
    setBuildOpenState(false);
    setPathToolState(null);
  }

  // THE ONE SLOT. Build mode only means anything while the player is looking
  // at the map, so opening a tab closes the build popup and opening the
  // build popup closes the tab; the two can never be live at once (see the
  // module comment). Leaving the map for a full-screen tab also drops a
  // picked-up building, which closeBuild deliberately does not: an armed
  // ghost that survives behind a screen, still armed when the player comes
  // back minutes later, is a click away from siting a building nobody meant
  // to site.
  function openTab(tab: TabId | null, target?: string) {
    if (tab !== null && !tabAvailable(s, tab)) return;
    setOverlay(tab === null ? null : { tab, target });
    if (tab !== null) {
      closeBuild();
      setPlacingIdState(null);
    }
  }
  function inspectHall(hallId: string) {
    openTab(null);
    setInspectTarget(hallId);
  }
  function setBuildOpen(open: boolean) {
    if (!open) {
      closeBuild();
      return;
    }
    setBuildOpenState(true);
    setOverlay(null);
  }

  // THE OPENING WALKTHROUGH DRIVES THE SHELL (see state/opening.ts). The
  // stage is state; what the shell does about it lives here, because this
  // is the one place that can open the build menu, open a tab, open a
  // hall's panel and start the clock. Each transition INTO a stage acts
  // once: siting the hall opens the build menu, the hall standing closes
  // it and drops whatever was picked up, "found a fourth program" opens
  // the Curriculum (the Next that reached it says so — the three rows are
  // the thing to see, and the card's own door then leads to Founders
  // Hall's panel on the map), and the walk ending starts the clock — the
  // game opens paused and the walk holds it, so 'play' is the first moment
  // a week can turn.
  //
  // On MOUNT (a save resumed mid-walk) the two door-opening stages act
  // too, so the resumed player is looking at the right screen; 'play' does
  // not, because a loaded run that finished its walk long ago opens paused
  // like any other save. The ref holds the last stage acted on rather than
  // a first-render flag, so StrictMode's double effect cannot act twice.
  const stage: OpeningStage = s.events.opening.stage;
  const actedStage = useRef<OpeningStage | null>(null);
  useEffect(() => {
    if (!s.started) return;
    const prev = actedStage.current;
    if (prev === stage) return;
    actedStage.current = stage;
    if (stage === 'site-hall') setBuildOpen(true);
    else if (stage === 'teaching') { closeBuild(); setPlacingIdState(null); }
    else if (stage === 'found') openTab('curriculum');
    else if (stage === 'play' && prev !== null) setSpeed('real');
  }, [s.started, stage]);

  // ONE ESCAPE LADDER, top down, for the whole shell.
  //
  // Escape used to be bound in three places — TabOverlay, ToolbarPopup and
  // CampusMap — with App arbitrating between the last two by switching the
  // map's hotkeys off whenever an overlay was open. That was right as far as
  // it went and did not cover the build popup at all, so Escape over an open
  // build menu fell through to the map. Three components each binding the
  // same key and guessing about the other two is the arbitration; it belongs
  // in one place, and this is the only place that can see all of them.
  //
  // Top down: the innermost popup, then the build menu, then an open tab,
  // then the map's own back-out (drop a path tool, drop a picked-up
  // building, close an info panel) — which is not handled here but in
  // CampusMap, whose hotkeys are enabled EXACTLY when this handler has
  // nothing of its own to close, so the fall-through is the handoff.
  //
  // An interrupt outranks all of it: that modal halts the clock and must be
  // answered, so Escape must not quietly dismantle the shell behind it.
  useHotkeys((e) => {
    if (e.key !== 'Escape' || s.pendingInterrupt) return;
    if (logOpen) setLogOpen(false);
    else if (buildOpen) closeBuild();
    else if (overlay) openTab(null);
  }, s.started);

  if (!s.started) {
    // The debug panel comes along, and on this screen it offers Load alone
    // (see DebugPanel.tsx): a browser with no save is exactly where somebody
    // opening a scenario file starts from.
    return (
      <>
        <StartupScreen onStart={(name, vernacular, colors) => act({ type: 'START_GAME', name, vernacular, colors, guided: true })} />
        <DebugPanel s={s} act={act} />
      </>
    );
  }

  return (
    <>
      <CampusMap
        s={s}
        act={act}
        selectedId={placingId}
        onSelect={setPlacingId}
        pathTool={pathTool}
        onSetPathTool={setPathTool}
        backOutEnabled={mapBackOutEnabled}
        controlsEnabled={mapControlsEnabled}
        onOpenCurriculum={(sectionKey) => openTab('curriculum', sectionKey)}
        inspectTarget={inspectTarget}
        onInspectTargetConsumed={() => setInspectTarget(null)}
        onInspectedChange={setInspectedId}
      />
      <MainMenu act={act} />
      {/* The school's name, hung in the map's top-left corner in its own
          colours (see Pennant.tsx). Withheld while a tab is open: the tab's
          own title takes that corner. */}
      {!overlay && <Pennant s={s} />}
      {/* Present only behind the playtest flag, and it decides that for
          itself (see DebugPanel.tsx / playtest.ts). Rendered here, beside
          MainMenu, because it is chrome over the map rather than anything
          the shell's one-slot rule applies to — it is the one panel that
          is meant to stay open while you look at something else. */}
      <DebugPanel s={s} act={act} />

      <div className="app">
        {/* The toast stack (Plan 16's PR G): the things that never stop the
            clock, three seconds each above the ticker, a click opening the
            tab they are about. Rendered beside the ticker rather than in it
            because the ticker is one line that stays and a toast is a card
            that goes. */}
        <Toasts s={s} onOpenTab={(tab) => openTab(tab)} />
        <LogTicker
          s={s}
          open={logOpen}
          onSetOpen={setLogOpen}
          onGo={(go) => { if (go === 'build') setBuildOpen(true); else openTab(go); }}
        />
        <Toolbar
          ref={toolbarRef}
          s={s}
          act={act}
          active={overlay?.tab ?? null}
          onChangeTab={openTab}
          buildOpen={buildOpen}
          onSetBuildOpen={setBuildOpen}
          speed={speed}
          setSpeed={setSpeed}
          weekProgress={weekProgress}
          placingId={placingId}
          onArmPlacement={setPlacingId}
          pathTool={pathTool}
          onSetPathTool={setPathTool}
        />

        {overlay && (
          <TabOverlay title={TAB_LABELS[overlay.tab]} onClose={() => openTab(null)}>
            {overlay.tab === 'faculty' && (
              <FacultyTab
                s={s}
                act={act}
                target={overlay.target}
                onTargetConsumed={() => setOverlay((cur) => (cur ? { tab: cur.tab } : cur))}
                onOpenCurriculum={(target) => openTab('curriculum', target)}
              />
            )}
            {overlay.tab === 'curriculum' && (
              <CurriculumTab
                s={s}
                act={act}
                target={overlay.target}
                onTargetConsumed={() => setOverlay((cur) => (cur ? { tab: cur.tab } : cur))}
                onInspectHall={inspectHall}
                onOpenFaculty={(field) => openTab('faculty', field)}
              />
            )}
            {overlay.tab === 'research' && <ResearchTab s={s} act={act} />}
            {overlay.tab === 'treasury' && <TreasuryTab s={s} act={act} />}
            {overlay.tab === 'enrollment' && <EnrollmentTab s={s} />}
            {overlay.tab === 'studentlife' && <StudentLifeTab s={s} />}
            {overlay.tab === 'athletics' && <AthleticsTab s={s} act={act} />}
            {overlay.tab === 'history' && <HistoryTab s={s} />}
          </TabOverlay>
        )}

        <InterruptModal s={s} act={act} />
        {/* The walkthrough's card (see OpeningCoach.tsx): nothing while the
            stage is 'play', which is every render after the first minute.
            It reads which doors are open so a closed one can be reopened
            from the card; opening them goes through the same two setters
            every other caller uses, so the one-slot rule holds. */}
        <OpeningCoach
          s={s}
          act={act}
          buildOpen={buildOpen}
          hallOpen={overlay === null && inspectedId === FOUNDERS_HALL_ID}
          onOpenBuild={() => setBuildOpen(true)}
          onOpenHall={() => inspectHall(FOUNDERS_HALL_ID)}
        />
      </div>
    </>
  );
}
