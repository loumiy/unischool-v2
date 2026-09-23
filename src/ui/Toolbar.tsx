import type { Ref } from 'react';
import {
  clockRuns,
  enrolled,
  formatClock,
  formatMoney,
  netOf,
  SPEEDS,
  speedGate,
  type SpeedGate,
  speedAllowed,
  type GameState,
  type Speed,
} from '../sim/index.ts';
import { rungWords } from '../content/board.ts';
import DayTicker from './DayTicker.tsx';
import {
  BuildIcon,
  CurriculumIcon,
  DoubleSpeedIcon,
  FacultyIcon,
  HistoryIcon,
  HomeIcon,
  LeagueIcon,
  OctoSpeedIcon,
  PauseIcon,
  PlayIcon,
  PrestigeIcon,
  QuadSpeedIcon,
  StudentsIcon,
  TreasuryIcon,
} from './icons.tsx';
import { TABS, type TabId } from './tabs.ts';

// THE BOTTOM BAR (DD §13.2, ported from v1): three zones, one band. Left,
// the funds figure and the headline stat chips; middle, the tab dock —
// Campus · Curriculum · Faculty · Students · Treasury · League · History —
// and the Build pill; right, the clock over the speed gears. The band's
// real height is measured (App's useCssHeightVar), so the map and the
// ticker inset by what it actually takes.

const TAB_ICONS: Record<TabId, () => React.JSX.Element> = {
  curriculum: CurriculumIcon,
  faculty: FacultyIcon,
  students: StudentsIcon,
  treasury: TreasuryIcon,
  league: LeagueIcon,
  history: HistoryIcon,
};

const SPEED_ICONS: Record<Speed, () => React.JSX.Element> = {
  paused: PauseIcon,
  x1: PlayIcon,
  x2: DoubleSpeedIcon,
  x4: QuadSpeedIcon,
  x8: OctoSpeedIcon,
};
const SPEED_HINTS: Record<Speed, string> = {
  paused: 'Pause (Space)',
  x1: 'Play (1)',
  x2: 'Double speed (2)',
  x4: 'Quadruple speed (3)',
  x8: 'Eight times (4)',
};
// A closed tier says what would open it, because the gate IS the bargain
// (DD §3.2): fast time is bought with payroll, and a control that is merely
// dead teaches nobody that. The rule is clock.ts's; these are the words.
function gateHint(speed: Speed, gate: SpeedGate): string {
  const wants: string[] = [];
  if (gate.provost) wants.push('a Provost');
  if (gate.deans > 0) wants.push(gate.deans === 1 ? 'one more Dean' : `${gate.deans} more Deans`);
  const need =
    wants.length === 2 ? `${wants[0]} and ${wants[1]}` : (wants[0] ?? 'more of a college');
  return `${SPEED_LABELS[speed]} wants ${need} — appoint from the Faculty screen`;
}

const SPEED_LABELS: Record<Speed, string> = {
  paused: 'Paused',
  x1: 'Play',
  x2: '2×',
  x4: '4×',
  x8: '8×',
};

export default function Toolbar({
  ref,
  state,
  speed,
  weekProgress,
  active,
  onChangeTab,
  onSetSpeed,
  queuedSpeed,
  buildOpen,
  onToggleBuild,
  ringBuild,
  heldFor,
}: {
  ref: Ref<HTMLDivElement>;
  state: GameState;
  speed: Speed;
  weekProgress: number;
  active: TabId | null;
  onChangeTab: (tab: TabId | null) => void;
  onSetSpeed: (speed: Speed) => void;
  // What the clock comes back at when the hold lifts; null when nothing
  // holds it.
  queuedSpeed: Speed | null;
  buildOpen: boolean;
  onToggleBuild: () => void;
  ringBuild: boolean;
  // The beat holding the clock, by name, or null while time moves. While it
  // holds, the speed sits at Paused (ui/store.ts) and the chrome says which
  // kind of stopped this is.
  heldFor: string | null;
}) {
  const running = clockRuns(state);
  const { treasury } = state;
  const weekNet = netOf(treasury.lastWeek);
  const students = enrolled(state);
  return (
    <div className="toolbar" ref={ref}>
      <div className="toolbar-left">
        {/* The funds figure is the register's one counter and the entry into
            Treasury: operating funds, and this week's net (DD §5.3: the
            weekly cashflow figure is always visible in the chrome). */}
        <button
          type="button"
          className={`toolbar-funds-btn ${active === 'treasury' ? 'active' : ''}`}
          aria-expanded={active === 'treasury'}
          aria-label="Open Treasury"
          title="Operating funds and this week's net — opens Treasury"
          onClick={() => onChangeTab(active === 'treasury' ? null : 'treasury')}
        >
          <span className={`stat-value ${treasury.cash < 0 ? 'money-negative' : ''}`}>
            {formatMoney(treasury.cash)}
          </span>
          <span className={`toolbar-funds-net ${weekNet < 0 ? 'money-negative' : ''}`}>
            {formatMoney(weekNet, { sign: true })} /wk
          </span>
          {state.distress.rung > 0 && (
            <span className={`toolbar-rung rung-${state.distress.rung}`}>
              {rungWords(state.distress.rung).name}
            </span>
          )}
        </button>
        <div className="toolbar-stats">
          <button
            type="button"
            className={`toolbar-stat ${active === 'students' ? 'active' : ''}`}
            title={`${students} enrolled — opens Students`}
            aria-label="Open Students"
            aria-expanded={active === 'students'}
            onClick={() => onChangeTab(active === 'students' ? null : 'students')}
          >
            <StudentsIcon />
            <span className="stat-label">Enrolled</span>
            <span className="stat-value">{students}</span>
          </button>
          <div className="toolbar-stat pending" title="Prestige (Phase 24)">
            <PrestigeIcon />
            <span className="stat-label">Prestige</span>
            <span className="stat-value">—</span>
          </div>
        </div>
      </div>

      <nav className="toolbar-tabs" aria-label="Screens">
        <button
          type="button"
          className={`toolbar-icon-btn ${active === null && !buildOpen ? 'active' : ''}`}
          aria-label="Campus map"
          title="Campus map"
          onClick={() => onChangeTab(null)}
        >
          <HomeIcon />
          <span className="toolbar-tab-label">Campus</span>
        </button>
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`toolbar-icon-btn ${isActive ? 'active' : ''}`}
              aria-expanded={isActive}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => onChangeTab(isActive ? null : tab.id)}
            >
              <Icon />
              <span className="toolbar-tab-label">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`toolbar-icon-btn toolbar-build-btn ${buildOpen ? 'active' : ''} ${ringBuild ? 'opening-target' : ''}`}
          aria-expanded={buildOpen}
          aria-label={buildOpen ? 'Close build menu' : 'Open build menu'}
          title="Build"
          onClick={onToggleBuild}
        >
          <BuildIcon />
          <span className="toolbar-build-label">Build</span>
        </button>
      </nav>

      <div className="toolbar-right">
        <div className="toolbar-school">
          <span
            className={`toolbar-clock ${heldFor ? 'held' : ''}`}
            title={heldFor ? `The clock holds for ${heldFor}` : undefined}
          >
            {formatClock(state.clock)}
          </span>
          <DayTicker weekProgress={weekProgress} held={heldFor !== null} />
        </div>
        <div className="toolbar-speed">
          {/* The hold sits by the speed control it has paused, not on the
              clock's row: there it widened the right-hand zone enough to
              wrap the whole bar onto two rows at 1440 (Phase 21F). */}
          {heldFor && (
            <span className="clock-held" role="status">
              <span className="clock-held-lead">Waiting for you</span>
              <span className="clock-held-what">{heldFor}</span>
            </span>
          )}
          <div className={`speeds ${heldFor ? 'held' : ''}`} role="group" aria-label="Speed">
            {SPEEDS.map((sp) => {
              const Icon = SPEED_ICONS[sp];
              const gate = running ? speedGate(state, sp) : null;
              // While a beat holds the week the set speed is Paused, truly:
              // the queued pill is the promise about after, outlined rather
              // than lit so it cannot be read as the clock running now.
              const queued = heldFor !== null && speed !== sp && queuedSpeed === sp;
              return (
                <button
                  key={sp}
                  type="button"
                  className={speed === sp ? 'active' : queued ? 'queued' : ''}
                  aria-pressed={speed === sp}
                  aria-label={SPEED_LABELS[sp]}
                  title={
                    !running
                      ? 'The clock starts once Founders Hall stands'
                      : gate
                        ? gateHint(sp, gate)
                        : heldFor
                          ? queued
                            ? `The clock comes back at this speed once ${heldFor} is decided`
                            : sp === 'paused'
                              ? `The clock holds for ${heldFor}`
                              : `${SPEED_HINTS[sp]} — the speed to come back at once ${heldFor} is decided`
                          : SPEED_HINTS[sp]
                  }
                  disabled={!running || !speedAllowed(state, sp)}
                  onClick={() => onSetSpeed(sp)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
