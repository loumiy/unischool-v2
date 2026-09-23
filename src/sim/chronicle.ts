import { ambitionById } from '../content/ambitions.ts';
import { buildingById, findBuilding } from '../content/buildings.ts';
import { CHRONICLE_LINES, ERA_NAMES, type EraKind } from '../content/chronicle.ts';
import { tagById, type TagId } from '../content/identityTags.ts';
import { leagueSchoolById } from '../content/league.ts';
import { programById } from '../content/schools.ts';
import { ERA_MAX, ERA_MAX_YEARS, ERA_MIN_YEARS } from '../tuning.ts';
import { findEvent } from '../content/events.ts';
import { type BusEntry } from './bus.ts';
import { classLabel, clockFromAbsoluteWeek } from './calendar.ts';
import { PLAYER_ID, rankOf } from './league.ts';
import type { GameState } from './state.ts';
import { formatMoney } from './treasury.ts';

// THE CHRONICLE (DD §12.1): the run's years partitioned into named eras,
// read from the journal and the ledgers rather than stored — a pure
// function of the state, viewable in draft at any time and final at Year
// 50. Each year is read for what kind of year it was (a crisis, a building
// boom, a rise or a fall in the guide, a campaign, the arrival of a rival,
// a golden stretch, or nothing much); runs of a kind become eras; eras too
// short to name are folded into their neighbours; each era is named from a
// template and summarised in the chronicle's own sentences.

export interface YearRecord {
  year: number;
  rank: number | null;
  rungMax: number;
  built: string[]; // building ids completed
  demolished: string[];
  historicDown: string[];
  campaigns: number;
  titles: number;
  rivalNamed: string | null;
  tags: string[];
  kept: string[];
  missed: string[];
  net: number | null;
  endowment: number | null;
  graduated: { label: string; size: number; distinguished: number }[];
  seismic: string[]; // the letters the college answered that year, by title
}

export interface Era {
  kind: EraKind;
  name: string;
  from: number;
  to: number;
  lines: string[];
}

export interface TimelineEntry {
  year: number;
  building: string;
  what: 'built' | 'demolished' | 'historic' | 'storey';
}

export interface NotableAlumnus {
  name: string;
  classYear: number;
  program: string | null;
}

export interface RivalSaga {
  schoolId: string;
  since: number;
  games: number;
  won: number;
  lost: number;
  above: number; // years the rival finished above the college
  years: number;
  poached: number;
  taunts: number;
}

export interface Chronicle {
  eras: Era[];
  timeline: TimelineEntry[];
  alumni: NotableAlumnus[];
  rival: RivalSaga | null;
}

const yearOf = (e: BusEntry) => clockFromAbsoluteWeek(e.week).year;

// ---------- reading the years ----------

export function yearRecords(state: GameState): YearRecord[] {
  const last = state.clock.year;
  const recs: YearRecord[] = [];
  for (let y = 1; y <= last; y++) {
    const table = state.league.tables.find((t) => t.year === y);
    const summary = state.treasury.history.find((h) => h.year === y);
    recs.push({
      year: y,
      rank: table ? rankOf(table, PLAYER_ID) : null,
      rungMax: 0,
      built: [],
      demolished: [],
      historicDown: [],
      campaigns: 0,
      titles: 0,
      rivalNamed: null,
      tags: [],
      kept: [],
      missed: [],
      net: summary ? summary.net : null,
      endowment: summary ? summary.endowmentEnd : null,
      graduated: [],
      seismic: [],
    });
  }
  let rung = 0;
  for (const e of state.bus) {
    const rec = recs[yearOf(e) - 1];
    if (!rec) continue;
    switch (e.kind) {
      case 'buildingCompleted':
        rec.built.push(e.buildingId);
        break;
      case 'buildingDemolished':
        rec.demolished.push(e.buildingId);
        break;
      case 'historicDemolished':
        rec.historicDown.push(e.buildingId);
        break;
      case 'campaignClosed':
        rec.campaigns++;
        break;
      case 'seasonClosed':
        if (e.title) rec.titles++;
        break;
      case 'rivalNamed':
        rec.rivalNamed = e.schoolId;
        break;
      case 'tagEarned':
        rec.tags.push(e.tag);
        break;
      case 'ambitionSettled':
        (e.kept ? rec.kept : rec.missed).push(e.ambitionId);
        break;
      case 'classGraduated':
        rec.graduated.push({
          label: classLabel(e.classYear),
          size: e.size,
          distinguished: e.distinguished,
        });
        break;
      case 'eventResolved': {
        const def = findEvent(e.eventId);
        if (def?.kind === 'seismic' && def.title)
          rec.seismic.push(def.title.replace(/^The /, 'the '));
        break;
      }
      case 'rungChanged':
        rung = e.to;
        rec.rungMax = Math.max(rec.rungMax, e.to);
        break;
    }
    rec.rungMax = Math.max(rec.rungMax, rung);
  }
  // A year with no entry at all still sits on the rung it started on.
  let carry = 0;
  for (const r of recs) {
    r.rungMax = Math.max(r.rungMax, carry);
    const changes = state.bus.filter((e) => e.kind === 'rungChanged' && yearOf(e) === r.year);
    if (changes.length) carry = (changes[changes.length - 1] as { to: number }).to;
  }
  return recs;
}

// What kind of year it was, first match wins.
export function yearKind(recs: YearRecord[], i: number): EraKind {
  const r = recs[i]!;
  if (r.year <= 3) return 'founding';
  if (r.rungMax >= 5) return 'receivership';
  if (r.rungMax >= 3) return 'troubles';
  if (r.campaigns > 0) return 'campaign';
  if (r.rivalNamed) return 'rivalry';
  if (r.built.length >= 2) return 'building';
  const before = recs[i - 3]?.rank ?? null;
  if (r.rank !== null && before !== null) {
    if (before - r.rank >= 3) return 'rise';
    if (r.rank - before >= 3) return 'decline';
  }
  if (r.rank !== null && r.rank <= 8 && r.rungMax === 0) return 'golden';
  return 'quiet';
}

interface Span {
  kind: EraKind;
  from: number;
  to: number;
}

// Runs of a kind, the short ones folded into what came before, and no
// more eras than a chronicle can hold.
export function partition(recs: YearRecord[]): Span[] {
  const spans: Span[] = [];
  const notable = (r: YearRecord) =>
    r.seismic.length * 3 +
    r.built.length +
    r.titles * 2 +
    r.tags.length +
    r.historicDown.length * 3;
  recs.forEach((r, i) => {
    const kind = yearKind(recs, i);
    const last = spans[spans.length - 1];
    if (last && last.kind === kind) last.to = r.year;
    else spans.push({ kind, from: r.year, to: r.year });
  });
  // Fold anything shorter than an era into its predecessor — except the
  // founding, which is always its own era however short.
  const len = (s: Span) => s.to - s.from + 1;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i]!;
      if (len(s) >= ERA_MIN_YEARS || spans.length === 1 || s.kind === 'founding') continue;
      // The last stretch of a run in progress stays as it is: it is still
      // being lived.
      if (i === spans.length - 1 && i > 0 && len(s) >= 1 && spans.length <= 2) continue;
      const prevIsFounding = i > 0 && spans[i - 1]!.kind === 'founding';
      const into = i > 0 && !prevIsFounding ? i - 1 : i + 1 < spans.length ? i + 1 : i - 1;
      const target = spans[into]!;
      target.from = Math.min(target.from, s.from);
      target.to = Math.max(target.to, s.to);
      spans.splice(i, 1);
      changed = true;
      break;
    }
    // Two neighbours of one kind after a fold are one era.
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]!.kind === spans[i - 1]!.kind) {
        spans[i - 1]!.to = spans[i]!.to;
        spans.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  // A stretch too long to be one era is split where the most happened.
  for (let i = 0; i < spans.length && spans.length < ERA_MAX; i++) {
    const s = spans[i]!;
    if (len(s) <= ERA_MAX_YEARS) continue;
    let at = -1;
    let best = -1;
    for (let y = s.from + ERA_MIN_YEARS; y <= s.to - ERA_MIN_YEARS + 1; y++) {
      const score =
        notable(recs[y - 1]!) + 0.01 * (ERA_MAX_YEARS - Math.abs(y - s.from - ERA_MAX_YEARS / 2));
      if (score > best) {
        best = score;
        at = y;
      }
    }
    if (at < 0) continue;
    spans.splice(
      i,
      1,
      { kind: s.kind, from: s.from, to: at - 1 },
      { kind: s.kind, from: at, to: s.to },
    );
    i--;
  }
  while (spans.length > ERA_MAX) {
    let shortest = 1;
    for (let i = 1; i < spans.length; i++) if (len(spans[i]!) < len(spans[shortest]!)) shortest = i;
    const s = spans[shortest]!;
    spans[shortest - 1]!.to = s.to;
    spans.splice(shortest, 1);
  }
  return spans;
}

// ---------- the words ----------

function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

function listOf(items: string[]): string {
  const unique = [...new Set(items)];
  if (unique.length <= 1) return unique[0] ?? '';
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

function ordinalWord(n: number): string {
  return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][n - 1] ?? `${n}th`;
}

function rankWord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const SMALL = new Set(['the', 'of', 'in', 'a', 'an', 'and', 'on', 'at', 'to', 'for']);
function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w, i) =>
      i > 0 && SMALL.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function nameEra(
  state: GameState,
  span: Span,
  recs: YearRecord[],
  used: Set<string>,
  campaignNo: number,
): string {
  const years = recs.filter((r) => r.year >= span.from && r.year <= span.to);
  const built = years.flatMap((r) => r.built);
  const biggest = [...built].sort((a, b) => buildingById(b).cost - buildingById(a).cost)[0];
  const rival = years.find((r) => r.rivalNamed)?.rivalNamed ?? state.athletics.rivalId;
  const vars: Record<string, string> = {
    building: biggest ? buildingById(biggest).name : 'the New Hall',
    rival: rival ? leagueSchoolById(rival).short : 'the Rival',
    ordinal: ordinalWord(campaignNo),
  };
  // A quiet stretch with a letter everyone remembers is named for it.
  const event = years.flatMap((r) => r.seismic)[0];
  const kind: EraKind = span.kind === 'quiet' && event ? 'eventful' : span.kind;
  if (event) vars.event = titleCase(event);
  const options = ERA_NAMES[kind];
  const start = hashOf(`${state.seed}:${span.from}:${span.kind}`) % options.length;
  for (let k = 0; k < options.length; k++) {
    // "After the Storm", not "After The Storm".
    const name = fill(options[(start + k) % options.length]!, vars).replace(
      /(\S) The /g,
      '$1 the ',
    );
    if (!used.has(name)) return name;
  }
  return `${fill(options[start]!, vars)} (${span.from}–${span.to})`;
}

function summarise(span: Span, recs: YearRecord[]): string[] {
  const L = CHRONICLE_LINES;
  const years = recs.filter((r) => r.year >= span.from && r.year <= span.to);
  const lines: string[] = [];
  lines.push(
    span.from === span.to
      ? fill(L.spanOne, { from: span.from })
      : fill(L.span, { from: span.from, to: span.to }),
  );
  const built = years.flatMap((r) => r.built).map((id) => findBuilding(id)?.name ?? id);
  lines.push(built.length ? fill(L.built, { list: listOf(built) }) : L.builtNone);
  const ranked = years.filter((r) => r.rank !== null);
  if (ranked.length >= 2) {
    const a = ranked[0]!.rank!;
    const b = ranked[ranked.length - 1]!.rank!;
    lines.push(
      Math.abs(a - b) <= 1
        ? fill(L.rankFlat, { to: rankWord(b) })
        : fill(L.rank, { from: rankWord(a), to: rankWord(b) }),
    );
  }
  const closed = years.filter((r) => r.net !== null);
  if (closed.length) {
    const net = closed.reduce((t, r) => t + (r.net ?? 0), 0);
    const first = closed[0]!.endowment ?? 0;
    const last = closed[closed.length - 1]!.endowment ?? 0;
    lines.push(
      fill(L.money, {
        net: `${net >= 0 ? 'in the black by' : 'in the red by'} ${formatMoney(Math.abs(net))}`,
        from: formatMoney(first),
        to: formatMoney(last),
      }),
    );
  }
  const worst = Math.max(...years.map((r) => r.rungMax));
  if (worst >= 3) lines.push(fill(L.troubles, { rung: `rung ${worst}` }));
  const graduated = years.flatMap((r) => r.graduated);
  if (graduated.length) {
    const distinguished = graduated.reduce((t, g) => t + g.distinguished, 0);
    lines.push(
      distinguished > 0
        ? fill(L.classes, { count: graduated.length, distinguished })
        : fill(L.classesPlain, { count: graduated.length }),
    );
  }
  const weathered = years.flatMap((r) => r.seismic);
  if (weathered.length) lines.push(fill(L.weathered, { list: listOf(weathered) }));
  const titles = years.reduce((t, r) => t + r.titles, 0);
  if (titles) lines.push(fill(L.titles, { count: titles }));
  const tags = years.flatMap((r) => r.tags).map((t) => tagById(t as TagId).name);
  if (tags.length) lines.push(fill(L.tags, { tags: listOf(tags) }));
  const down = years.flatMap((r) => r.demolished).map((id) => findBuilding(id)?.name ?? id);
  const historic = years.flatMap((r) => r.historicDown).map((id) => findBuilding(id)?.name ?? id);
  if (historic.length) lines.push(fill(L.historicDown, { list: listOf(historic) }));
  else if (down.length) lines.push(fill(L.demolished, { list: listOf(down) }));
  const rival = years.find((r) => r.rivalNamed)?.rivalNamed;
  if (rival) lines.push(fill(L.rival, { rival: leagueSchoolById(rival).name }));
  const kept = years.flatMap((r) => r.kept).map((id) => ambitionById(id).title.toLowerCase());
  const missed = years.flatMap((r) => r.missed).map((id) => ambitionById(id).title.toLowerCase());
  if (kept.length) lines.push(fill(L.kept, { list: listOf(kept) }));
  if (missed.length) lines.push(fill(L.missed, { list: listOf(missed) }));
  return lines;
}

// ---------- the whole of it ----------

export function chronicleOf(state: GameState): Chronicle {
  const recs = yearRecords(state);
  const spans = partition(recs);
  const used = new Set<string>();
  let campaigns = 0;
  let previous: string[] = [];
  const eras = spans.map((span) => {
    if (span.kind === 'campaign') campaigns++;
    const name = nameEra(state, span, recs, used, Math.max(1, campaigns));
    used.add(name);
    // A historian does not repeat "nothing was built" or "still 25th" era
    // after era: a sentence the last era already said is left out.
    const said = summarise(span, recs);
    const repeats = new Set(
      previous.filter((l) => l === CHRONICLE_LINES.builtNone || l.startsWith('The guide had')),
    );
    const lines = said.filter((l, i) => i === 0 || !repeats.has(l));
    previous = said;
    return { ...span, name, lines };
  });

  const timeline: TimelineEntry[] = [];
  for (const e of state.bus) {
    const what =
      e.kind === 'buildingCompleted'
        ? 'built'
        : e.kind === 'buildingDemolished'
          ? 'demolished'
          : e.kind === 'becameHistoric'
            ? 'historic'
            : e.kind === 'storeyAdded'
              ? 'storey'
              : null;
    if (!what || !('buildingId' in e)) continue;
    timeline.push({ year: yearOf(e), building: buildingById(e.buildingId).name, what });
  }

  const alumni = state.people.named
    .filter((s) => s.outcome === 'distinguished')
    .map((s) => ({
      name: s.name,
      classYear: s.classYear,
      program: s.programId ? programById(s.programId).name : null,
    }));

  let rival: RivalSaga | null = null;
  const rid = state.athletics.rivalId;
  if (rid) {
    const met = state.athletics.seasons.filter((s) => s.rivalResult !== null);
    const since = state.athletics.rivalSince ?? 1;
    const tables = state.league.tables.filter((t) => t.year >= since);
    rival = {
      schoolId: rid,
      since,
      games: met.length,
      won: met.filter((s) => s.rivalResult === 'won').length,
      lost: met.filter((s) => s.rivalResult === 'lost').length,
      above: tables.filter((t) => rankOf(t, rid) < rankOf(t, PLAYER_ID)).length,
      years: tables.length,
      poached: state.bus.filter((e) => e.kind === 'facultyPoached' && e.schoolId === rid).length,
      taunts: state.bus.filter((e) => e.kind === 'rivalTaunt').length,
    };
  }
  return { eras, timeline, alumni, rival };
}
