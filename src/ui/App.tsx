import { useEffect, useRef, useState } from 'react';
import { describeEntry } from '../content/busLines.ts';
import type { PaletteChoice } from '../content/palettes.ts';
import {
  clockFromAbsoluteWeek,
  clockRuns,
  formatClockShort,
  FOUNDERS_HALL_ID,
  lastEntry,
  pendingBeat,
  type Motif,
  type Speed,
} from '../sim/index.ts';
import BeatScreen from './BeatScreen.tsx';
import { autosave, boot, eraseAndRestart } from './boot.ts';
import BuildPopup from './BuildPopup.tsx';
import CampusMap from './CampusMap.tsx';
import DebugPanel from './DebugPanel.tsx';
import { isActivationTarget, useHotkeys } from './hotkeys.ts';
import JournalPopup from './JournalPopup.tsx';
import LogTicker, { type NextPrompt, type Notice } from './LogTicker.tsx';
import MainMenu from './MainMenu.tsx';
import Pennant from './Pennant.tsx';
import StartupScreen from './StartupScreen.tsx';
import { store } from './store.ts';
import TabOverlay, { StubScreen } from './TabOverlay.tsx';
import { tabById, type TabId } from './tabs.ts';
import { applySchoolColors } from './theme.ts';
import Toolbar from './Toolbar.tsx';
import type { CampusTool } from './tools.ts';
import { useCssHeightVar } from './useCssHeightVar.ts';
import { useGame } from './useGame.ts';

// THE SHELL (DD §13.2, ported from v1's layout grammar): the campus map is a
// full-viewport background, always present; every piece of chrome floats
// over it. A tab — or a calendar beat's screen — is a full screen with the
// dock laid over it. The build menu, the journal and a tab are three states
// of one slot. A picked-up building and a tool are two states of another.
// One Escape ladder, here, backs out of whatever is open: a popup, then a
// screen, then the map's own.

const TAB_HOTKEYS: Record<string, TabId> = { c: 'curriculum', f: 'faculty', t: 'treasury' };

// What fills the screen slot: a tab, or the pending beat's screen.
type Overlay = TabId | 'beat';

export default function App() {
  const { run, speed, weekProgress } = useGame();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [buildOpen, setBuildOpenState] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [placingId, setPlacingIdState] = useState<string | null>(null);
  const [tool, setToolState] = useState<CampusTool | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const toolbarRef = useCssHeightVar('--toolbar-height');
  const resumeSpeed = useRef<Speed>('x1');

  useEffect(() => {
    void boot();
    return () => store.stop();
  }, []);

  const state = run?.state ?? null;
  const identity = state?.identity ?? null;
  const started = state !== null && state.phase !== 'founding';
  const siting = state?.phase === 'siting';
  const beat = state ? pendingBeat(state) : null;

  useEffect(() => {
    if (identity) applySchoolColors(identity.colors);
  }, [identity]);

  useEffect(() => {
    if (speed !== 'paused') resumeSpeed.current = speed;
  }, [speed]);

  // The founding moment (DD §2.4): while siting, Founders Hall is the thing
  // in hand, no tool is, and the build menu stays shut. Derived rather than
  // synced, so there is no frame in which the shell disagrees with the sim.
  const effectivePlacingId = siting ? FOUNDERS_HALL_ID : placingId;
  const effectiveTool = siting ? null : tool;
  const effectiveBuildOpen = siting ? false : buildOpen;
  // The beat screen exists only while its beat is pending: resolving it
  // closes the screen without the shell having to notice.
  const effectiveOverlay: Overlay | null = overlay === 'beat' && !beat ? null : overlay;

  // Picking up a building and using a tool are two jobs for the same click,
  // so exactly one is ever live.
  function setPlacingId(id: string | null) {
    setPlacingIdState(id);
    if (id !== null) setToolState(null);
  }
  function setTool(next: CampusTool) {
    setToolState((cur) => (cur === next ? null : next));
    setPlacingIdState(null);
  }
  function closeBuild() {
    setBuildOpenState(false);
    setToolState(null);
  }
  function openTab(tab: Overlay | null) {
    setOverlay(tab);
    if (tab !== null) {
      closeBuild();
      setJournalOpen(false);
      setPlacingIdState(null);
    }
  }
  function setBuildOpen(open: boolean) {
    if (!open) {
      closeBuild();
      return;
    }
    setBuildOpenState(true);
    setJournalOpen(false);
    setOverlay(null);
  }
  function toggleJournal() {
    if (journalOpen) {
      setJournalOpen(false);
      return;
    }
    closeBuild();
    setJournalOpen(true);
  }
  function resolveBeat() {
    if (!beat) return;
    const applied = store.dispatch({ type: 'resolveBeat', beatId: beat.id });
    if (applied) void autosave(store.getSnapshot().run!);
    setOverlay(null);
  }

  useHotkeys((e) => {
    if (!state) return;
    if (e.key === '`') {
      setDebugOpen((v) => !v);
      return;
    }
    if (e.key === 'Escape') {
      if (journalOpen) setJournalOpen(false);
      else if (effectiveBuildOpen) closeBuild();
      else if (effectiveOverlay) openTab(null);
      return;
    }
    if (!started) return;
    const key = e.key.toLowerCase();
    const tab = TAB_HOTKEYS[key];
    if (tab) {
      openTab(effectiveOverlay === tab ? null : tab);
      return;
    }
    if (key === 'b' && !siting) {
      setBuildOpen(!effectiveBuildOpen);
      return;
    }
    if (key === 'l') {
      toggleJournal();
      return;
    }
    if (!clockRuns(state)) return;
    if (e.key === '1') store.setSpeed('x1');
    else if (e.key === '2') store.setSpeed('x2');
    else if (e.key === '3') store.setSpeed('x4');
    else if (e.key === '4') store.setSpeed('x8');
    else if (e.key === ' ') {
      if (isActivationTarget(e.target)) return;
      e.preventDefault();
      store.setSpeed(speed === 'paused' ? resumeSpeed.current : 'paused');
    }
  });

  if (!run || !state) return <div className="boot">Opening the doors…</div>;

  if (!started) {
    return (
      <>
        <StartupScreen
          onStart={(name: string, motif: Motif, palette: PaletteChoice) => {
            const applied = store.dispatch({
              type: 'found',
              name,
              motif,
              paletteId: palette.id,
              colors: { primary: palette.primary, secondary: palette.secondary },
            });
            if (applied) void autosave(store.getSnapshot().run!);
          }}
        />
        {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
      </>
    );
  }

  // The NEXT slot: Founders Hall while siting; the beat while one holds the
  // clock; otherwise nothing, honestly.
  const next: NextPrompt | null = siting
    ? { text: 'Place Founders Hall on the land', go: effectiveOverlay ? 'campus' : undefined }
    : beat
      ? { text: beat.prompt, go: 'beat', urgent: effectiveOverlay !== 'beat' }
      : null;
  const latest = lastEntry(state);
  const notice: Notice | null = latest
    ? {
        stamp: formatClockShort(clockFromAbsoluteWeek(latest.week)),
        ...describeEntry(latest, state),
      }
    : null;
  // The map's own keys go quiet under a screen; Escape reaches it only when
  // the shell has nothing of its own left to close.
  const mapControls = effectiveOverlay === null;
  const mapBackOut = effectiveOverlay === null && !effectiveBuildOpen && !journalOpen;

  return (
    <>
      <CampusMap
        state={state}
        placingId={effectivePlacingId}
        onArmPlacement={setPlacingId}
        tool={effectiveTool}
        onSetTool={setTool}
        onPlace={(buildingId, col, row, rotated) => {
          const applied = store.dispatch({ type: 'placeBuilding', buildingId, col, row, rotated });
          if (applied && buildingId === FOUNDERS_HALL_ID) void autosave(store.getSnapshot().run!);
          return applied;
        }}
        onPaint={(t, col, row) => {
          store.dispatch({ type: 'paint', tool: t, col, row });
        }}
        onDemolish={(placementId) => {
          store.dispatch({ type: 'demolish', placementId });
        }}
        backOutEnabled={mapBackOut}
        controlsEnabled={mapControls}
      />
      <MainMenu
        onSave={() => void autosave(run)}
        onNewGame={() => {
          setOverlay(null);
          closeBuild();
          setJournalOpen(false);
          setPlacingIdState(null);
          void eraseAndRestart();
        }}
      />
      {!effectiveOverlay && identity && <Pennant identity={identity} />}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}

      <div className="app">
        <LogTicker
          notice={notice}
          next={next}
          onGo={(go) => openTab(go === 'beat' ? 'beat' : null)}
          journalOpen={journalOpen}
          onToggleJournal={toggleJournal}
        />
        <Toolbar
          ref={toolbarRef}
          state={state}
          speed={speed}
          weekProgress={weekProgress}
          active={effectiveOverlay === 'beat' ? null : effectiveOverlay}
          onChangeTab={openTab}
          onSetSpeed={(s) => store.setSpeed(s)}
          buildOpen={effectiveBuildOpen}
          onToggleBuild={() => {
            if (siting) return;
            setBuildOpen(!effectiveBuildOpen);
          }}
          ringBuild={false}
          heldFor={beat?.name ?? null}
        />
        {effectiveBuildOpen && (
          <BuildPopup
            state={state}
            placingId={placingId}
            onArmPlacement={setPlacingId}
            tool={tool}
            onSetTool={setTool}
            onClose={closeBuild}
          />
        )}
        {journalOpen && <JournalPopup state={state} onClose={() => setJournalOpen(false)} />}
        {effectiveOverlay === 'beat' && beat && (
          <BeatScreen
            beat={beat}
            state={state}
            onResolve={resolveBeat}
            onClose={() => openTab(null)}
          />
        )}
        {effectiveOverlay && effectiveOverlay !== 'beat' && (
          <TabOverlay title={tabById(effectiveOverlay).label} onClose={() => openTab(null)}>
            <StubScreen phase={tabById(effectiveOverlay).phase}>
              {tabById(effectiveOverlay).stub}
            </StubScreen>
          </TabOverlay>
        )}
      </div>
    </>
  );
}
