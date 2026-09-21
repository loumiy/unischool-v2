import { useEffect, useRef, useState } from 'react';
import type { PaletteChoice } from '../content/palettes.ts';
import { clockRuns, type Motif, type Speed } from '../sim/index.ts';
import { autosave, boot, eraseAndRestart } from './boot.ts';
import CampusMap from './CampusMap.tsx';
import DebugPanel from './DebugPanel.tsx';
import { isActivationTarget, useHotkeys } from './hotkeys.ts';
import LogTicker, { type NextPrompt } from './LogTicker.tsx';
import MainMenu from './MainMenu.tsx';
import Pennant from './Pennant.tsx';
import StartupScreen from './StartupScreen.tsx';
import { store } from './store.ts';
import TabOverlay, { StubScreen } from './TabOverlay.tsx';
import { tabById, type TabId } from './tabs.ts';
import { applySchoolColors } from './theme.ts';
import Toolbar from './Toolbar.tsx';
import { useCssHeightVar } from './useCssHeightVar.ts';
import { useGame } from './useGame.ts';

// THE SHELL (DD §13.2, ported from v1's layout grammar): the campus map is a
// full-viewport background, always present; every piece of chrome floats
// over it. A tab is a full screen with the dock laid over it; the build menu
// (Phase 3) and a tab are two states of one slot; and one Escape ladder,
// here, backs out of whatever is open.

const TAB_HOTKEYS: Record<string, TabId> = { c: 'curriculum', f: 'faculty', t: 'treasury' };

export default function App() {
  const { run, speed, weekProgress } = useGame();
  const [overlay, setOverlay] = useState<TabId | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
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

  // The school's colours are the theme, written once the run has them —
  // a fresh founding and a loaded save alike.
  useEffect(() => {
    if (identity) applySchoolColors(identity.colors);
  }, [identity]);

  useEffect(() => {
    if (speed !== 'paused') resumeSpeed.current = speed;
  }, [speed]);

  function openTab(tab: TabId | null) {
    setOverlay(tab);
    if (tab !== null) setBuildOpen(false);
  }

  // Space toggles pause, 1–4 set the gears, C/F/T toggle the three tabs a
  // player dips into most, backtick toggles the debug panel, and Escape is
  // the ladder: the build menu, then an open tab.
  useHotkeys((e) => {
    if (!state) return;
    if (e.key === '`') {
      setDebugOpen((v) => !v);
      return;
    }
    if (e.key === 'Escape') {
      if (buildOpen) setBuildOpen(false);
      else if (overlay) openTab(null);
      return;
    }
    if (!started) return;
    const tab = TAB_HOTKEYS[e.key.toLowerCase()];
    if (tab) {
      openTab(overlay === tab ? null : tab);
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

  const siting = state.phase === 'siting';
  const next: NextPrompt | null = siting
    ? { text: 'Place Founders Hall on the land', go: overlay ? 'campus' : undefined }
    : null;

  return (
    <>
      <CampusMap
        state={state}
        controlsEnabled={overlay === null}
        onPlaceFoundersHall={(col, row) => {
          const applied = store.dispatch({ type: 'placeFoundersHall', col, row });
          if (applied) void autosave(store.getSnapshot().run!);
        }}
      />
      <MainMenu
        onSave={() => void autosave(run)}
        onNewGame={() => {
          setOverlay(null);
          setBuildOpen(false);
          void eraseAndRestart();
        }}
      />
      {!overlay && identity && <Pennant identity={identity} />}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}

      <div className="app">
        <LogTicker notice={null} next={next} onGo={() => openTab(null)} />
        <Toolbar
          ref={toolbarRef}
          state={state}
          speed={speed}
          weekProgress={weekProgress}
          active={overlay}
          onChangeTab={openTab}
          onSetSpeed={(s) => store.setSpeed(s)}
          buildOpen={buildOpen}
          onToggleBuild={() => {
            // The build menu is Phase 3's; the pill is here so the band has
            // its shape, and it only closes any open screen for now.
            setBuildOpen((v) => !v);
            setOverlay(null);
          }}
          ringBuild={false}
        />
        {overlay && (
          <TabOverlay title={tabById(overlay).label} onClose={() => openTab(null)}>
            <StubScreen phase={tabById(overlay).phase}>{tabById(overlay).stub}</StubScreen>
          </TabOverlay>
        )}
      </div>
    </>
  );
}
