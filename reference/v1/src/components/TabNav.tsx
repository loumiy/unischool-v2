// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../data/researchData.
import type { GameState } from '../state/types';
import { labEquippedFields } from '../data/researchData';

// The campus map is the game's base layer and is always on screen (see
// App.tsx), so it is NOT one of these — every id here is a view that pops
// up over the map and can be dismissed to get back to it. `active` is null
// when nothing is open and the player is looking at the map itself.
export type TabId = 'faculty' | 'curriculum' | 'research' | 'treasury' | 'enrollment' | 'studentlife' | 'history' | 'athletics';

// THE ORDER IS THE TOOLBAR'S ORDER, and it is the playtest notes' order:
// the academic core first (what the university teaches, who teaches it,
// what it discovers), then the campus the students live on, then the two
// annual read-and-leave pages, then the record. Roughly how often a player
// opens each, which is the only ordering principle a nine-icon row can
// carry.
//
// Treasury is last here and is filtered out of the icon row entirely (see
// Toolbar.tsx's ICON_TAB_ORDER): it already has a permanent entry point in
// the funds figure at the left of the toolbar, which is why the notes'
// list omits it. It stays in this table because it is still a real tab with
// a real label — the label is what TabOverlay's header shows.
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'research', label: 'Research' },
  { id: 'studentlife', label: 'Student Life' },
  { id: 'athletics', label: 'Athletics' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'history', label: 'History' },
  { id: 'treasury', label: 'Treasury' },
];

// WHEN IS A TAB WORTH OFFERING? This used to be a constant list of ids to
// hide (HIDDEN_TABS, latterly empty) — the right shape for "this system
// doesn't exist yet", and the wrong one for what the playtest notes ask
// for, which is a tab that appears the week the thing it is about becomes
// real. Every one of those gates reads game state, so this is a predicate
// rather than a list.
//
// Three tabs are gated, and each gate is the same condition the system
// behind it already hangs off rather than a second rule invented here:
//
//   - research: at least one finished lab. labEquippedFields is the gate
//     research itself uses (researchData.ts: "no lab, no research"), so a
//     school with no facility gets no tab, which is honest — there is
//     nothing it could do on that screen.
//   - athletics: at least one varsity team. A club petitioning to go
//     varsity is what creates the first one (see AthleticsTab.tsx).
//   - history: the second year. Year 1 has no year to look back on, so the
//     tab would open on an empty page.
//
// Everything else is always available. A tab absent from this table is not
// "never gated by accident" — it is a tab whose screen says something
// useful from the first week.
const TAB_GATES: Partial<Record<TabId, (s: GameState) => boolean>> = {
  research: (s) => labEquippedFields(s).size > 0,
  athletics: (s) => s.orgs.teams.length > 0 || s.orgs.clubs.some((c) => c.sport !== null), // opens with the first sport club (Plan 21's PR O), empty and showing the path
  history: (s) => s.clock.year >= 2,
};

// The gated ids, for the caller that has to notice one OPENING (App.tsx
// logs a line the first time each does — a tab that silently appears in a
// nine-icon row is a tab nobody notices).
export const GATED_TABS: readonly TabId[] = Object.keys(TAB_GATES) as TabId[];

// Is this tab worth offering right now? The one answer, used by the toolbar
// (which filters its icon row through it), by App (which refuses to open a
// tab that isn't available, so neither a hotkey nor a stale overlay can
// route to one) and by the unlock log line.
export function tabAvailable(s: GameState, id: TabId): boolean {
  return TAB_GATES[id]?.(s) ?? true;
}

// The toolbar's icon row (see Toolbar.tsx) reads this order directly —
// this module is pure tab metadata (ids, labels, order, and which are
// offered) rather than a rendering component: the toolbar's icon buttons
// are what actually render a clickable tab nav, one unified band instead of
// a separate text-label strip in the topbar. TAB_LABELS survives as the
// aria-label/title source for those icon buttons, so a screen reader (or a
// hover tooltip) still gets the same words a text button used to show, and
// TabOverlay's header shows the same word again.
export const TAB_ORDER: readonly TabId[] = TABS.map((t) => t.id);

export const TAB_LABELS: Record<TabId, string> = Object.fromEntries(
  TABS.map((t) => [t.id, t.label]),
) as Record<TabId, string>;
