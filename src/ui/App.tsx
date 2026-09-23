import { useEffect, useRef, useState } from 'react';
import { describeEntry } from '../content/busLines.ts';
import type { PaletteChoice } from '../content/palettes.ts';
import {
  clockFromAbsoluteWeek,
  clockRuns,
  formatClockShort,
  FOUNDERS_HALL_ID,
  inAusterity,
  lastEntry,
  pendingBeat,
  pendingInline,
  pendingSeismic,
  type Financing,
  type FilledBy,
  type Motif,
  type Speed,
} from '../sim/index.ts';
import BeatScreen, { type BeatDecision } from './BeatScreen.tsx';
import BoardLetter from './BoardLetter.tsx';
import EventLetter from './EventLetter.tsx';
import EventPrompt, { eventPrompt } from './EventPrompt.tsx';
import { eventById } from '../content/events.ts';
import { BOARD_WORDS } from '../content/board.ts';
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
import LeagueScreen from './LeagueScreen.tsx';
import { TAB_HOTKEYS } from './keys.ts';
import { tabById, type TabId } from './tabs.ts';
import { applySchoolColors } from './theme.ts';
import Toolbar from './Toolbar.tsx';
import CurriculumScreen from './CurriculumScreen.tsx';
import FacultyScreen from './FacultyScreen.tsx';
import HistoryScreen from './HistoryScreen.tsx';
import StudentsScreen from './StudentsScreen.tsx';
import TreasuryScreen from './TreasuryScreen.tsx';
import type { Species } from '../sim/index.ts';
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

// What fills the screen slot: a tab, a calendar beat's screen, a letter
// from the board, or a seismic event's letter.
type Overlay = TabId | 'beat' | 'letter' | 'event';

export default function App() {
  const { run, speed, weekProgress, queuedSpeed } = useGame();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [buildOpen, setBuildOpenState] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [placingId, setPlacingIdState] = useState<string | null>(null);
  const [tool, setToolState] = useState<CampusTool | null>(null);
  // Which tree the plant tool puts down; null is whatever the dice say.
  const [species, setSpecies] = useState<Species | null>(null);
  // How the next construction is paid for (DD §5.2); cash unless told otherwise.
  const [financing, setFinancing] = useState<Financing>('cash');
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
  const letter = state?.distress.pendingLetter ?? null;
  // Two shapes of event (DD §10.1): the inline one grows out of the ticker
  // and lets the weeks run; the seismic one is a letter that stops them.
  const inlineEvent = state ? pendingInline(state) : null;
  const seismic = state ? pendingSeismic(state) : null;

  useEffect(() => {
    if (identity) applySchoolColors(identity.colors);
  }, [identity]);

  // What Space comes back to. While a beat holds the clock the speed is
  // Paused and the player's choice lives in queuedSpeed, so that is the
  // setting to remember (ui/store.ts).
  useEffect(() => {
    const setting = queuedSpeed ?? speed;
    if (setting !== 'paused') resumeSpeed.current = setting;
  }, [speed, queuedSpeed]);

  // The founding moment (DD §2.4): while siting, Founders Hall is the thing
  // in hand, no tool is, and the build menu stays shut. Derived rather than
  // synced, so there is no frame in which the shell disagrees with the sim.
  const effectivePlacingId = siting ? FOUNDERS_HALL_ID : placingId;
  const effectiveTool = siting ? null : tool;
  const effectiveBuildOpen = siting ? false : buildOpen;
  // The beat screen exists only while its beat is pending: resolving it
  // closes the screen without the shell having to notice.
  const effectiveOverlay: Overlay | null =
    (overlay === 'beat' && !beat) ||
    (overlay === 'letter' && !letter) ||
    (overlay === 'event' && !seismic)
      ? null
      : overlay;

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
  function readLetter() {
    if (!letter) return;
    const applied = store.dispatch({ type: 'readLetter' });
    if (applied) void autosave(store.getSnapshot().run!);
    setOverlay(null);
  }
  function chooseEvent(instanceId: string, choiceId: string) {
    const applied = store.dispatch({ type: 'resolveEvent', instanceId, choiceId });
    if (applied) {
      void autosave(store.getSnapshot().run!);
      setOverlay((cur) => (cur === 'event' ? null : cur));
    }
  }
  function appointSeat(seatId: string, schoolId: string | null, from: FilledBy) {
    const applied = store.dispatch({ type: 'appointSeat', seatId, schoolId, from });
    if (applied) void autosave(store.getSnapshot().run!);
  }
  function setSeatPolicy(seatId: string, schoolId: string | null, policy: string) {
    store.dispatch({ type: 'setSeatPolicy', seatId, schoolId, policy });
  }
  function hire(candidateId: string, programId: string | null) {
    store.dispatch({ type: 'hire', candidateId, programId });
  }
  function resolveBeat(decision: BeatDecision) {
    if (!beat) return;
    const applied = store.dispatch({ type: 'resolveBeat', beatId: beat.id, ...decision });
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
      store.setSpeed((queuedSpeed ?? speed) === 'paused' ? resumeSpeed.current : 'paused');
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

  // The NEXT slot: Founders Hall while siting; then whatever is holding the
  // clock — a seismic event's letter, the board's, a beat — and otherwise
  // nothing, honestly.
  const next: NextPrompt | null = siting
    ? { text: 'Place Founders Hall on the land', go: effectiveOverlay ? 'campus' : undefined }
    : seismic
      ? {
          text: eventById(seismic.eventId).title ?? 'A letter is waiting',
          go: 'event',
          urgent: effectiveOverlay !== 'event',
        }
      : letter
        ? { text: BOARD_WORDS.letterPrompt, go: 'letter', urgent: effectiveOverlay !== 'letter' }
        : beat
          ? { text: beat.prompt, go: 'beat', urgent: effectiveOverlay !== 'beat' }
          : inlineEvent && effectiveOverlay
            ? // The panel lives on the strip, over the map, and says all
              // this itself when it is in view. From inside a screen, where
              // it steps aside, the slot names the question and takes you
              // back out to it rather than opening a second thing on top.
              { text: eventPrompt(inlineEvent), go: 'campus' }
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

  // Austerity dulls the campus slightly (DD §5.5): a class the map's
  // stylesheet reads.
  const dulled = inAusterity(state);
  return (
    <div className={dulled ? 'austerity' : undefined}>
      <CampusMap
        state={state}
        placingId={effectivePlacingId}
        onArmPlacement={setPlacingId}
        tool={effectiveTool}
        onSetTool={setTool}
        onPlace={(buildingId, col, row, rotated) => {
          const applied = store.dispatch({
            type: 'placeBuilding',
            buildingId,
            col,
            row,
            rotated,
            financing,
          });
          if (applied && buildingId === FOUNDERS_HALL_ID) void autosave(store.getSnapshot().run!);
          return applied;
        }}
        onRenovate={(placementId, payWith) => {
          store.dispatch({ type: 'renovate', placementId, financing: payWith });
        }}
        financing={financing}
        onPaint={(t, col, row) => {
          store.dispatch({
            type: 'paint',
            tool: t,
            col,
            row,
            ...(t === 'plant' && species ? { species } : {}),
          });
        }}
        onDemolish={(placementId) => {
          store.dispatch({ type: 'demolish', placementId });
        }}
        onNameQuad={(key, name) => {
          store.dispatch({ type: 'nameQuad', key, name });
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
        {/* Inline means inline: the panel belongs to the strip and the map
            under it, and steps aside for a screen rather than floating over
            that screen's own buttons. */}
        {inlineEvent && !effectiveOverlay && (
          <EventPrompt state={state} pending={inlineEvent} onChoose={chooseEvent} />
        )}
        <LogTicker
          notice={notice}
          next={next}
          onGo={(go) => openTab(go === 'campus' ? null : go)}
          journalOpen={journalOpen}
          onToggleJournal={toggleJournal}
        />
        <Toolbar
          ref={toolbarRef}
          state={state}
          speed={speed}
          weekProgress={weekProgress}
          active={
            effectiveOverlay === 'beat' ||
            effectiveOverlay === 'letter' ||
            effectiveOverlay === 'event'
              ? null
              : effectiveOverlay
          }
          onChangeTab={openTab}
          onSetSpeed={(s) => store.setSpeed(s)}
          onOpenOrgChart={() => {
            openTab('faculty');
            // The screen mounts on this render; bring the seats into view
            // once it has.
            window.setTimeout(
              () =>
                document
                  .getElementById('faculty-seats')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              120,
            );
          }}
          queuedSpeed={queuedSpeed}
          buildOpen={effectiveBuildOpen}
          onToggleBuild={() => {
            if (siting) return;
            setBuildOpen(!effectiveBuildOpen);
          }}
          ringBuild={false}
          heldFor={
            seismic
              ? (eventById(seismic.eventId).title ?? 'a letter')
              : letter
                ? 'a letter from the board'
                : (beat?.name ?? null)
          }
        />
        {effectiveBuildOpen && (
          <BuildPopup
            state={state}
            placingId={placingId}
            onArmPlacement={setPlacingId}
            tool={tool}
            onSetTool={setTool}
            species={species}
            onSetSpecies={setSpecies}
            financing={financing}
            onSetFinancing={setFinancing}
            onClose={closeBuild}
          />
        )}
        {journalOpen && <JournalPopup state={state} onClose={() => setJournalOpen(false)} />}
        {effectiveOverlay === 'event' && seismic && (
          <EventLetter state={state} pending={seismic} onChoose={chooseEvent} />
        )}
        {effectiveOverlay === 'letter' && letter && (
          <BoardLetter state={state} letterId={letter} onRead={readLetter} />
        )}
        {effectiveOverlay === 'beat' && beat && (
          <BeatScreen
            beat={beat}
            state={state}
            onResolve={resolveBeat}
            onClose={() => openTab(null)}
            onHire={hire}
          />
        )}
        {effectiveOverlay &&
          effectiveOverlay !== 'beat' &&
          effectiveOverlay !== 'letter' &&
          effectiveOverlay !== 'event' && (
            <TabOverlay title={tabById(effectiveOverlay).label} onClose={() => openTab(null)}>
              {effectiveOverlay === 'treasury' ? (
                <TreasuryScreen state={state} />
              ) : effectiveOverlay === 'students' ? (
                <StudentsScreen
                  state={state}
                  onLaunch={(campaignId) => {
                    const applied = store.dispatch({ type: 'launchCampaign', campaignId });
                    if (applied) void autosave(store.getSnapshot().run!);
                  }}
                  onReunion={(classYear) => {
                    store.dispatch({ type: 'holdReunion', classYear });
                  }}
                />
              ) : effectiveOverlay === 'faculty' ? (
                <FacultyScreen
                  state={state}
                  onHire={hire}
                  onAssign={(facultyId, programId) => {
                    store.dispatch({ type: 'assignFaculty', facultyId, programId });
                  }}
                  onDismiss={(facultyId) => {
                    store.dispatch({ type: 'dismiss', facultyId });
                  }}
                  onAppoint={appointSeat}
                  onPolicy={setSeatPolicy}
                />
              ) : effectiveOverlay === 'curriculum' ? (
                <CurriculumScreen
                  state={state}
                  financing={financing}
                  onFound={(schoolId, placementId, payWith) => {
                    store.dispatch({
                      type: 'foundSchool',
                      schoolId,
                      placementId,
                      financing: payWith,
                    });
                  }}
                  onOpen={(programId, payWith) => {
                    store.dispatch({ type: 'openProgram', programId, financing: payWith });
                  }}
                  onClose={(programId) => {
                    store.dispatch({ type: 'closeProgram', programId });
                  }}
                  onAdvance={(programId, payWith) => {
                    store.dispatch({ type: 'advanceProgram', programId, financing: payWith });
                  }}
                  onSignature={(programId, signature) => {
                    store.dispatch({
                      type: signature ? 'designateSignature' : 'revokeSignature',
                      programId,
                    });
                  }}
                />
              ) : effectiveOverlay === 'history' ? (
                <HistoryScreen state={state} />
              ) : effectiveOverlay === 'league' ? (
                <LeagueScreen state={state} />
              ) : (
                <StubScreen>{tabById(effectiveOverlay).stub}</StubScreen>
              )}
            </TabOverlay>
          )}
      </div>
    </div>
  );
}
