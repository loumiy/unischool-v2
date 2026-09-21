import type { Ref } from 'react';
import {
  clockRuns,
  enrolled,
  formatClock,
  formatMoney,
  netOf,
  SPEEDS,
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
  buildOpen: boolean;
  onToggleBuild: () => void;
  ringBuild: boolean;
  // The beat holding the clock, by name, or null while time moves.
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
          <DayTicker weekProgress={weekProgress} />
        </div>
        <div className="toolbar-speed">
          <div className="speeds" role="group" aria-label="Speed">
            {SPEEDS.map((sp) => {
              const Icon = SPEED_ICONS[sp];
              return (
                <button
                  key={sp}
                  type="button"
                  className={speed === sp ? 'active' : ''}
                  aria-pressed={speed === sp}
                  aria-label={SPEED_LABELS[sp]}
                  title={running ? SPEED_HINTS[sp] : 'The clock starts once Founders Hall stands'}
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
