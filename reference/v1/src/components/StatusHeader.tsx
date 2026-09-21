// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../engine/useGame, ../systems/finance/financeSystem, ../systems/rivals/rivalsSystem.
import { useEffect, useRef } from 'react';
import type { GameState } from '../state/types';
import { WEEKS_PER_YEAR, totalEnrolled } from '../state/types';
import {
  RankIcon, StudentsIcon, PrestigeIcon, SatisfactionIcon,
  PauseIcon, PlayIcon, DoubleSpeedIcon, QuadSpeedIcon,
} from './icons';
import { weeklyNet } from '../systems/finance/financeSystem';
import { playerRank } from '../systems/rivals/rivalsSystem';
import { SPEEDS, SANDBOX_SPEEDS, type Speed } from '../engine/useGame';
import DayTicker from './DayTicker';
import AnimatedNumber from './AnimatedNumber';
import { isActivationTarget, useHotkeys } from './hotkeys';
import { playtestEnabled } from './playtest';

// Keys 1/2/3 set the speed directly to real/double/quad, and Space toggles
// between paused and playing, without having to click the control-bar
// buttons — the three are ordinary gameplay speeds so all three hotkeys
// are live for every player, while '4' only does anything under the
// playtest flag, matching the Fast button's own gating just below (Plan
// 16's PR D moved the sandbox speed from 3 to 4 when 4x became a real
// gear). The typing guard (so typing "3" into the startup screen's
// school-name field doesn't yank the clock into fast-forward) lives in
// useHotkeys now — see hotkeys.ts.
//
// Space is a toggle rather than a set, so it needs to know what to go BACK
// to: it returns to whatever speed was last actually running rather than
// always to `real`, so a player who was watching at 2x gets 2x back after
// a pause instead of being quietly downshifted every time they stop to
// read something. The game itself opens paused, so `real` is what an
// un-pause falls back to until something has run at least once.
function useSpeedHotkeys(speed: Speed, setSpeed: (speed: Speed) => void, sandboxAllowed: boolean) {
  const resumeSpeedRef = useRef<Speed>('real');
  useEffect(() => {
    if (speed !== 'paused') resumeSpeedRef.current = speed;
  }, [speed]);

  useHotkeys((e) => {
    if (e.key === '1') setSpeed('real');
    else if (e.key === '2') setSpeed('double');
    else if (e.key === '3') setSpeed('quad');
    else if (e.key === '4' && sandboxAllowed) setSpeed('fast');
    else if (e.key === ' ') {
      // A Tab-focused button answers Space by clicking itself; that native
      // behaviour wins, rather than the press both clicking a button and
      // pausing the game. Otherwise Space is ours — and preventDefault
      // keeps the browser from also scrolling the page with it.
      if (isActivationTarget(e.target)) return;
      e.preventDefault();
      setSpeed(speed === 'paused' ? resumeSpeedRef.current : 'paused');
    }
  });
}

// Play · 2× · 4×: the row reads as one control with three gears rather than
// three verbs, now that there are three. The four ordinary gears are glyphs
// (Plan 18 — see icons.tsx); the word is each button's label and title,
// with its hotkey. The sandbox gear keeps its word: it is the odd one out
// and should look it.
const SPEED_LABELS: Record<Speed, string> = { paused: 'Paused', real: 'Play', double: '2×', quad: '4×', fast: 'Fast (sandbox)' };
const SPEED_ICONS: Partial<Record<Speed, () => React.JSX.Element>> = {
  paused: PauseIcon, real: PlayIcon, double: DoubleSpeedIcon, quad: QuadSpeedIcon,
};
const SPEED_HINTS: Record<Speed, string> = {
  paused: 'Pause (Space)', real: 'Play (1)', double: 'Double speed (2)', quad: 'Quadruple speed (3)',
  fast: 'Playtesting only — not intended for normal play (4)',
};

// Below this, satisfaction is reported in the same alarmed red the funds
// figure already uses for negative cash. It is a DISPLAY threshold only —
// nothing mechanical happens here; satisfaction's real consequence is the
// continuous word-of-mouth curve in admissionsSystem.ts, which has no
// cliff. This just puts a number the player was previously never shown in
// front of them before the applicant pool starts shrinking.
const SATISFACTION_WARN = 55;

function termName(week: number): string {
  return week <= WEEKS_PER_YEAR / 2 ? 'Fall Term' : 'Spring Term';
}

// ---------------------------------------------------------------------
// C3 folded the old topbar (a masthead with the school's title and its
// headline stats, plus a control bar with speed/save/new-game) into the
// bottom Toolbar band instead — there is no more standalone status header
// component, just these two pieces Toolbar.tsx composes into its left and
// right zones. Save/New Game moved further still, into MainMenu.tsx's own
// top-right overlay, since they're run-level actions rather than anything
// that needs to sit beside the clock.
// ---------------------------------------------------------------------

// The bottom-left cluster: operating funds (now also the button that opens
// Treasury — there is no separate Treasury icon in the middle row any
// more) plus the handful of headline stats that used to sit in the old
// masthead. Rank/enrolled/prestige/satisfaction show their bare figure only
// now — no "of 350 beds" / "of 100" suffix — since each is read against
// context available on its own tab (Admissions, Student Life) rather than
// reconstructed here.
export function FundsAndStats({ s, onOpenTreasury, treasuryOpen }: {
  s: GameState; onOpenTreasury: () => void; treasuryOpen: boolean;
}) {
  const netWeekly = weeklyNet(s);
  // SHOWN FROM WEEK ONE, and it used to be withheld until the top-50 reveal
  // had fired. That gate made sense while the field was 56 schools: a
  // founding college ranked 56th of 56, and a readout whose only possible
  // value is "last" is a floor, not a standing. The field is 100 now, with
  // 44 schools authored below a founding school's own prestige (see
  // data/rivalData.ts's tail), so there is somewhere to climb from and the
  // number is worth reading on day one.
  //
  // The REVEAL is untouched and still means what it meant: the U.S. News
  // list publishes fifty names, so where you stand is knowable from the
  // start and being PUBLISHED is the event (see
  // systems/rivals/rivalsSystem.ts's TOP_50_CUTOFF, still the only reader
  // of s.hasEnteredRankings besides the annual report).
  const rank = playerRank(s);

  return (
    <>
      <button
        type="button"
        className={`toolbar-funds-btn ${treasuryOpen ? 'active' : ''}`}
        aria-expanded={treasuryOpen}
        aria-label="Open Treasury"
        title="Operating funds — opens Treasury"
        onClick={onOpenTreasury}
      >
        {/* The headline figures TICK to their new value rather than
            snapping. AnimatedNumber already existed for exactly this and was
            used only by the admissions form; a management sim's money moving
            visibly every week is the clearest place for it. Rank is
            deliberately left alone — it is an ordinal, and counting through
            the places between two ranks says something that isn't true. */}
        <span className={`stat-value ${s.finance.cash < 0 ? 'money-negative' : 'money'}`}>
          <AnimatedNumber value={s.finance.cash} format={(n) => `$${Math.round(n).toLocaleString()}`} />
        </span>
        <span className="toolbar-funds-net">{netWeekly >= 0 ? '+' : '-'}${Math.round(Math.abs(netWeekly)).toLocaleString()}/wk</span>
      </button>
      {/* Four chips, a glyph and a figure each (Plan 18), on their own row
          under the funds figure (see styles.css's .toolbar-left): the word
          is the chip's title and its visually-hidden label, so a hover or a
          screen reader still gets "Prestige" while the band gets its room
          back. The figures disambiguate the glyphs more than the glyphs do
          — a "#" before the first is what says rank. */}
      <div className="toolbar-stats">
        <div className="toolbar-stat" title="Rank, of 100 schools">
          <RankIcon />
          <span className="stat-label">Rank</span>
          <span className="stat-value">#{rank}</span>
        </div>
        <div className="toolbar-stat" title="Enrolled">
          <StudentsIcon />
          <span className="stat-label">Enrolled</span>
          <span className="stat-value"><AnimatedNumber value={totalEnrolled(s.students)} /></span>
        </div>
        <div className="toolbar-stat" title="Prestige">
          <PrestigeIcon />
          <span className="stat-label">Prestige</span>
          <span className="stat-value gold"><AnimatedNumber value={s.self.reputation} /></span>
        </div>
        <div className="toolbar-stat" title="Satisfaction">
          <SatisfactionIcon />
          <span className="stat-label">Satisfaction</span>
          <span className={`stat-value ${s.students.satisfaction < SATISFACTION_WARN ? 'money-negative' : ''}`}>
            <AnimatedNumber value={s.students.satisfaction} />
          </span>
        </div>
      </div>
    </>
  );
}

// The bottom-right cluster: speed/playtest controls, then the school's own
// identity and clock — prominent per the design ask, in place of the old
// masthead's h1 and "Office of the President" eyebrow (dropped; it named a
// role, not the school).
export function SchoolAndClock({ s, speed, setSpeed, weekProgress }: {
  s: GameState; speed: Speed; setSpeed: (speed: Speed) => void;
  // The live fraction of the current week, for the day squares under the
  // clock (see useGame.ts's accumulator and DayTicker.tsx).
  weekProgress: () => number;
}) {
  // The sandbox speed is the only playtest control left in this file. The
  // "+$1B" grant moved into the debug panel (see DebugPanel.tsx) as a cash
  // field you can set rather than a round number you can add, and the gate
  // moved to components/playtest.ts — a flag, of which naming the school
  // "test" is one of three ways to set it.
  const showPlaytestControls = playtestEnabled(s);
  const visibleSpeeds = (Object.keys(SPEEDS) as Speed[]).filter(
    (sp) => showPlaytestControls || !SANDBOX_SPEEDS.includes(sp),
  );

  useSpeedHotkeys(speed, setSpeed, showPlaytestControls);

  // Two rows, the clock above the gears (see styles.css's .toolbar-right):
  // the right zone stacks so the labelled tab row in the middle has the
  // width it needs, the same way the left zone stacks funds over stats.
  return (
    <>
      {/* The clock alone here now. The school's name hangs as the pennant in
          the map's top-left corner instead (see Pennant.tsx). */}
      <div className="toolbar-school">
        <span className="toolbar-clock">Year {s.clock.year} · {termName(s.clock.week)} · Week {s.clock.week}</span>
        <DayTicker s={s} speed={speed} weekProgress={weekProgress} />
      </div>
      <div className="toolbar-speed">
        <div className="speeds">
          {visibleSpeeds.map((sp) => {
            const Icon = SPEED_ICONS[sp];
            return (
              <button
                key={sp}
                className={[
                  speed === sp ? 'active' : '',
                  SANDBOX_SPEEDS.includes(sp) ? 'sandbox' : '',
                ].join(' ').trim()}
                aria-pressed={speed === sp}
                aria-label={SPEED_LABELS[sp]}
                onClick={() => setSpeed(sp)}
                title={SPEED_HINTS[sp]}
              >
                {Icon ? <Icon /> : SPEED_LABELS[sp]}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
