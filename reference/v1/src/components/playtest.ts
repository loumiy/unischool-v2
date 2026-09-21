// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// v1's developer-shortcut gate. Referenced by the speed controls; not a v2 concern.
import type { GameState } from '../state/types';

// ---------------------------------------------------------------------
// THE PLAYTEST GATE. One place decides whether the developer shortcuts —
// the sandbox Fast speed, the debug panel (see DebugPanel.tsx) and
// everything it dispatches — are reachable, and everything that offers one
// asks here.
//
// It used to be the school's NAME: a university called "test" got the
// shortcuts, anything else did not. That worked while a playtest always
// started from the startup screen, and stopped working the moment
// scenarios arrived (see tools/scenarios.ts): a scenario save carries the
// name the run was played under, so every state a playtest wanted to look
// at had to be renamed "test" by hand first, which is precisely what the
// September 2026 review's scripts were doing.
//
// So the gate is a FLAG, set three ways:
//
//   ?debug=1        on the URL — and it sticks, see below
//   unischool.debug in localStorage — `localStorage['unischool.debug']='1'`
//   a school named "test" — the old way, still working
//
// The first two are read ONCE, at module load, into the constant below: a
// flag that could change mid-session would mean a panel that appears and
// disappears under the player, and there is no reason to want that. The
// name check is per-call because the name lives in the state.
// ---------------------------------------------------------------------

export const DEBUG_FLAG_KEY = 'unischool.debug';

// Playtesting controls are only useful during development, not normal
// play — they stay reachable by naming the university "test" rather than
// being removed outright, so they're still there for anyone iterating on
// the game. Checked against the player-written half of the name only (see
// types.ts's University), so it keeps working whether the school is Test
// College or Test University.
export function isTestUniversity(name: string): boolean {
  return name.trim().toLowerCase() === 'test';
}

// `?debug=1` also WRITES the localStorage key, and `?debug=0` clears it.
// That is what makes the URL form usable at all here: the panel's own Load
// button writes a save and reloads the page, and a flag that lived only in
// the query string would be a flag every reload had to re-type.
//
// Every storage access is wrapped, like persistence.ts's: the API throws
// outright when storage is disabled (Safari private browsing, hardened
// privacy settings), and a developer shortcut is not a reason to take the
// run down.
function readFlagAtBoot(): boolean {
  let stored = false;
  try {
    stored = localStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {
    stored = false;
  }

  let fromUrl: boolean | null = null;
  try {
    const value = new URLSearchParams(window.location.search).get('debug');
    if (value !== null) fromUrl = value !== '0' && value !== 'false';
  } catch {
    fromUrl = null;
  }

  if (fromUrl === null) return stored;
  try {
    if (fromUrl) localStorage.setItem(DEBUG_FLAG_KEY, '1');
    else localStorage.removeItem(DEBUG_FLAG_KEY);
  } catch {
    // Unwritable storage: the flag still holds for this page, it just
    // won't survive the next load.
  }
  return fromUrl;
}

// Read at module load. `typeof window` guards the headless callers (the
// balance sim and the test suites import reducer-adjacent modules into
// Node, where there is no window and no localStorage worth the name).
const FLAG_AT_BOOT = typeof window === 'undefined' ? false : readFlagAtBoot();

export function playtestEnabled(s: GameState): boolean {
  return FLAG_AT_BOOT || isTestUniversity(s.self.name);
}
