import { ambitionById } from '../content/ambitions.ts';
import { AXES, type Axes, type AxisId } from '../content/league.ts';
import {
  AXIS_PHRASES,
  gradeFor,
  REPORT_SHAPES,
  TAG_PHRASES,
  VERDICTS,
  WEAKNESSES,
} from '../content/report.ts';
import { ENDING_YEAR, STARTING_ENDOWMENT } from '../tuning.ts';
import { emit, entriesOfKind } from './bus.ts';
import { chronicleOf, summariseYears } from './chronicle.ts';
import { institutionName } from './identity.ts';
import { latestTable, PLAYER_ID, rankOf } from './league.ts';
import type { GameState } from './state.ts';
import { formatMoney } from './treasury.ts';

// THE ENDING (DD §2.3, §12.2). At Year 50, Week 1, the run formally ends:
// the Final Report grades the whole arc — each axis over fifty years, not
// the last snapshot — records the promises and the money, names the eras,
// and composes the college's title. The report is frozen when it is
// written. Then the player may continue in Epilogue: the clock runs on,
// and every ten years the chronicle gets an addendum.

export interface AxisGrade {
  axis: AxisId;
  mean: number;
  first: number; // the first decade's mean
  last: number; // the last decade's mean
  score: number;
  grade: string;
}

export interface FinalReport {
  year: number;
  school: string;
  title: string;
  mark: string;
  markScore: number;
  axes: AxisGrade[];
  kept: string[];
  missed: string[];
  declined: number;
  finances: string[];
  eras: string[];
  rank: number | null;
  total: number | null;
}

export interface Addendum {
  from: number;
  to: number;
  lines: string[];
}

export interface Ending {
  report: FinalReport | null;
  pending: boolean; // the report is on the screen and the clock holds
  epilogue: boolean;
  addenda: Addendum[];
}

export function foundingEnding(): Ending {
  return { report: null, pending: false, epilogue: false, addenda: [] };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);
const round1 = (n: number) => Number(n.toFixed(1));

// Each axis over the arc: where it stood across the run, and how far it
// came from the first decade to the last. A college that rose from the
// bottom outranks one that coasted at the same final standing.
export function gradeAxes(state: GameState): AxisGrade[] {
  const history = state.prestige.history;
  return AXES.map((axis) => {
    const series = history.map((h) => h.axes[axis]);
    if (series.length === 0) series.push(state.prestige.axes[axis]);
    const first = mean(series.slice(0, 10));
    const last = mean(series.slice(-10));
    const all = mean(series);
    const climb = Math.max(-25, Math.min(25, last - first));
    const score = 0.5 * last + 0.3 * all + 0.2 * (50 + climb * 2);
    return {
      axis,
      mean: round1(all),
      first: round1(first),
      last: round1(last),
      score: round1(score),
      grade: gradeFor(score),
    };
  });
}

// The axis each tag is, in effect, a claim about.
const TAG_AXIS: Record<string, AxisId> = {
  'research-powerhouse': 'research',
  'teaching-college': 'academics',
  'party-school': 'experience',
  'jock-school': 'athletics',
  artsy: 'academics',
  commuter: 'access',
  'country-club': 'experience',
  'pressure-cooker': 'academics',
  'the-bargain': 'access',
  'old-money': 'finance',
};

// "Blackmoor University: a research powerhouse that never learned to feed
// its undergraduates." The strongest thing the guidebooks call it (or its
// strongest axis), and its weakest axis if one is weak.
export function composeTitle(state: GameState, grades: AxisGrade[]): string {
  const school = state.identity ? institutionName(state.identity) : 'The college';
  const byScore = [...grades].sort((a, b) => b.score - a.score);
  const strongest = byScore[0]!;
  const tag = state.perception.tags[0];
  // Never "the bargain that never opened its doors": the weakness named is
  // the weakest axis the tag does not itself claim.
  const claims = tag ? TAG_AXIS[tag] : null;
  const weakest =
    [...byScore].reverse().find((g) => g.axis !== claims) ?? byScore[byScore.length - 1]!;
  const phrase = tag ? TAG_PHRASES[tag] : AXIS_PHRASES[strongest.axis];
  const tail = weakest.score < 45 ? WEAKNESSES[weakest.axis] : REPORT_SHAPES.strengthTail;
  return REPORT_SHAPES.titleShape
    .replace('{school}', school)
    .replace('{phrase}', phrase)
    .replace('{tail}', tail);
}

function financialVerdict(state: GameState): string[] {
  const end = state.treasury.endowment;
  const from = formatMoney(STARTING_ENDOWMENT);
  const to = formatMoney(end);
  const out: string[] = [];
  const ratio = end / STARTING_ENDOWMENT;
  out.push(
    (ratio >= 2 ? VERDICTS.rich : ratio >= 0.9 ? VERDICTS.steady : VERDICTS.poorer)
      .replace('{from}', from)
      .replace('{to}', to),
  );
  const distressYears = new Set(
    state.distress.terms.length === 0
      ? []
      : entriesOfKind(state, 'rungChanged')
          .filter((e) => e.to >= 3)
          .map((e) => Math.floor(e.week / 36)),
  ).size;
  if (distressYears > 0) {
    const scars = state.distress.scars.length;
    out.push(
      VERDICTS.distress
        .replace('{years}', String(distressYears))
        .replace('{scars}', scars ? VERDICTS.scars.replace('{count}', String(scars)) : ''),
    );
  }
  out.push(
    state.treasury.debt > 0
      ? VERDICTS.debt.replace('{debt}', formatMoney(state.treasury.debt))
      : VERDICTS.clean,
  );
  return out;
}

export function finalReport(state: GameState): FinalReport {
  const axes = gradeAxes(state);
  const kept = entriesOfKind(state, 'ambitionSettled').filter((e) => e.kept);
  const missed = entriesOfKind(state, 'ambitionSettled').filter((e) => !e.kept);
  const declined = entriesOfKind(state, 'ambitionDeclined').length;
  const table = latestTable(state);
  const rank = table ? rankOf(table, PLAYER_ID) : null;
  const total = table ? table.rows.length : null;
  // The mark: the axes over the arc, where the guide left the college, and
  // whether it kept its word.
  const axisScore = mean(axes.map((a) => a.score));
  const rankScore = rank && total ? 100 * (1 - (rank - 1) / Math.max(1, total - 1)) : 50;
  const promises = kept.length + missed.length;
  const promiseScore = promises ? (100 * kept.length) / promises : 50;
  const markScore = round1(0.7 * axisScore + 0.2 * rankScore + 0.1 * promiseScore);
  return {
    year: state.clock.year,
    school: state.identity ? institutionName(state.identity) : 'The college',
    title: composeTitle(state, axes),
    mark: gradeFor(markScore),
    markScore,
    axes,
    kept: kept.map((e) => ambitionById(e.ambitionId).title),
    missed: missed.map((e) => ambitionById(e.ambitionId).title),
    declined,
    finances: financialVerdict(state),
    eras: chronicleOf(state).eras.map((e) => `${e.name} (${e.from}–${e.to})`),
    rank,
    total,
  };
}

// The turn of Year 50 writes the report and holds the clock; in Epilogue,
// every tenth turn after it writes an addendum.
export function endingWeek(state: GameState): GameState {
  const { clock } = state;
  if (clock.week !== 1 || clock.term !== 'fall') return state;
  const e = state.ending;
  if (!e.report && clock.year >= ENDING_YEAR) {
    const report = finalReport(state);
    return emit(
      { ...state, ending: { ...e, report, pending: true } },
      { kind: 'runEnded', year: clock.year, mark: report.mark },
    );
  }
  if (e.epilogue && clock.year > ENDING_YEAR && (clock.year - ENDING_YEAR) % 10 === 0) {
    const from = clock.year - 10;
    const to = clock.year - 1;
    const addendum = { from, to, lines: summariseYears(state, from, to) };
    return { ...state, ending: { ...e, addenda: [...e.addenda, addendum] } };
  }
  return state;
}

export function enterEpilogue(state: GameState): GameState {
  return { ...state, ending: { ...state.ending, pending: false, epilogue: true } };
}

export type { Axes };
