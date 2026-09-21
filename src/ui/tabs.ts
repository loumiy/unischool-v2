// The bottom bar's screens (DD §13.2): Campus · Curriculum · Faculty ·
// Students · Treasury · League · History · Build. Campus is the map itself
// (the home button) and Build opens the build menu (Phase 3); the six here
// are the views that open over the map. Each is stubbed until its phase.
export type TabId = 'curriculum' | 'faculty' | 'students' | 'treasury' | 'league' | 'history';

export interface TabDef {
  id: TabId;
  label: string;
  // The plan phase that fills the screen, for the stub's own line.
  phase: number;
  stub: string;
}

export const TABS: readonly TabDef[] = [
  {
    id: 'curriculum',
    label: 'Curriculum',
    phase: 9,
    stub: 'Six schools, thirty programs, three tiers each. The catalogue opens when the first school is founded.',
  },
  {
    id: 'faculty',
    label: 'Faculty',
    phase: 10,
    stub: 'Competence and cost, one quirk each. The hiring market opens at the summer Budget & Hiring beat.',
  },
  {
    id: 'students',
    label: 'Students',
    phase: 7,
    stub: 'Cohorts by program and class year, and the handful of named students the game follows. The first class arrives at Convocation.',
  },
  {
    id: 'treasury',
    label: 'Treasury',
    phase: 5,
    stub: 'The weekly cashflow strip, the year budget, tuition dependence, the endowment, the backlog, and the administrative share of payroll.',
  },
  {
    id: 'league',
    label: 'League',
    phase: 22,
    stub: 'Twenty-four other schools and an annual table whose methodology occasionally changes, to everyone’s visible outrage.',
  },
  {
    id: 'history',
    label: 'History',
    phase: 26,
    stub: 'The chronicle in draft: named eras, notable alumni, the building timeline, and the rival saga.',
  },
];

export const TAB_LABELS: Record<TabId, string> = Object.fromEntries(
  TABS.map((t) => [t.id, t.label]),
) as Record<TabId, string>;

export function tabById(id: TabId): TabDef {
  return TABS.find((t) => t.id === id)!;
}
