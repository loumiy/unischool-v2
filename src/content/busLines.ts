import { BUS_KINDS, type BusEntry, type BusKind } from '../sim/bus.ts';
import { classLabel, termLabel } from '../sim/calendar.ts';
import { institutionName } from '../sim/identity.ts';
import { formatMoney, formatPercent } from '../sim/treasury.ts';
import type { GameState } from '../sim/state.ts';
import { findBuilding } from './buildings.ts';
import { CUT_WORDS, letterById, rungWords } from './board.ts';
import { findBeat } from './calendarBeats.ts';
import { rankById, withArticle } from './faculty.ts';
import { findProgram, findSchool, tierById } from './schools.ts';
import raw from './bus-lines.json' with { type: 'json' };
import { ContentError, obj, oneOf, optional, str, validate } from './schema.ts';

// The words for the journal (sim/bus.ts): one template per entry kind, with
// {placeholders} filled from the entry and the state. The ticker's newest
// line, the journal popup and (later) the chronicle all read entries
// through here, so an entry is written once and worded once.

export interface BusLine {
  text: string;
  tone?: 'good' | 'bad';
}

const PLACEHOLDERS = [
  'school',
  'building',
  'term',
  'year',
  'beat',
  'line',
  'label',
  'rate',
  'net',
  'ledger',
  'applicants',
  'admitted',
  'size',
  'capnote',
  'label',
  'triples',
  'count',
  'rungLine',
  'title',
  'cuts',
  'program',
  'name',
  'assignment',
  'tier',
  'rank',
  'embarrassment',
  'outcomes',
] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];

const lineSchema = obj({ text: str, tone: optional(oneOf(['good', 'bad'])) });
const fileSchema = obj({
  lines: obj(Object.fromEntries(BUS_KINDS.map((k) => [k, lineSchema]))),
});

function load(): Readonly<Record<BusKind, BusLine>> {
  const file = validate(fileSchema, raw, 'content/bus-lines.json');
  const lines = file.lines as Record<BusKind, BusLine>;
  for (const kind of BUS_KINDS) {
    for (const m of lines[kind].text.matchAll(/\{(\w+)\}/g)) {
      if (!PLACEHOLDERS.includes(m[1] as Placeholder)) {
        throw new ContentError(
          `content/bus-lines.json.lines.${kind}`,
          `unknown placeholder {${m[1]}}`,
        );
      }
    }
  }
  return lines;
}

export const BUS_LINES = load();

function fill(template: string, vars: Partial<Record<Placeholder, string>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key as Placeholder] ?? whole);
}

export function describeEntry(entry: BusEntry, state: GameState): BusLine {
  const line = BUS_LINES[entry.kind];
  const vars: Partial<Record<Placeholder, string>> = {
    school: state.identity ? institutionName(state.identity) : 'The college',
  };
  switch (entry.kind) {
    case 'buildingPlaced':
    case 'buildingDemolished':
    case 'buildingCompleted':
    case 'renovationBegun':
    case 'renovated':
      vars.building = findBuilding(entry.buildingId)?.name ?? entry.buildingId;
      break;
    case 'termBegan':
      vars.term = termLabel(entry.term);
      vars.year = String(entry.year);
      break;
    case 'yearTurned':
      vars.year = String(entry.year);
      break;
    case 'beatFired':
    case 'beatResolved': {
      const beat = findBeat(entry.beatId);
      vars.beat = beat?.name ?? entry.beatId;
      vars.line = (entry.kind === 'beatFired' ? beat?.firedLine : beat?.resolvedLine) ?? vars.beat;
      break;
    }
    case 'budgetApproved':
      vars.year = String(entry.year);
      vars.rate = formatPercent(entry.drawRate, 2);
      break;
    case 'admissionsClosed':
      vars.applicants = String(entry.applicants);
      vars.admitted = String(entry.admitted);
      vars.size = String(entry.size);
      vars.capnote = entry.capped ? ', the beds being what they are' : '';
      break;
    case 'classArrived':
      vars.label = classLabel(entry.classYear);
      vars.size = String(entry.size);
      vars.triples = entry.triples > 0 ? `, ${entry.triples} of them in triples` : '';
      return { text: fill(line.text, vars), tone: entry.triples > 0 ? 'bad' : 'good' };
    case 'studentsLeft':
      vars.count = String(entry.count);
      break;
    case 'classGraduated': {
      vars.label = classLabel(entry.classYear);
      vars.size = String(entry.size);
      const notes: string[] = [];
      if (entry.distinguished > 0) notes.push(`${entry.distinguished} with distinction`);
      if (entry.adrift > 0) notes.push(`${entry.adrift} adrift`);
      vars.outcomes = notes.length ? `, ${notes.join(', ')}` : '';
      break;
    }
    case 'schoolFounded':
      vars.school = findSchool(entry.schoolId)?.name ?? entry.schoolId;
      vars.building = findBuilding(entry.buildingId)?.name ?? entry.buildingId;
      break;
    case 'programOpened':
    case 'programClosed':
    case 'signatureNamed':
    case 'signatureDropped':
      vars.program = findProgram(entry.programId)?.name ?? entry.programId;
      break;
    case 'advancementBegun':
    case 'programAdvanced':
    case 'advancementStalled':
    case 'programDecayed': {
      vars.program = findProgram(entry.programId)?.name ?? entry.programId;
      const tier = tierById(entry.tier as 'founded');
      vars.tier = tier.name;
      vars.rank = tier.leadRank ? withArticle(rankById(tier.leadRank).name) : 'a senior hire';
      if (entry.kind === 'programDecayed')
        vars.embarrassment = entry.signature
          ? ', a signature program, to public embarrassment'
          : '';
      break;
    }
    case 'marketOpened':
    case 'marketClosed':
      vars.count = String(entry.count);
      break;
    case 'facultyHired': {
      vars.name = entry.name;
      const program = entry.programId ? findProgram(entry.programId) : undefined;
      vars.assignment = program ? ` to teach ${program.name}` : '';
      break;
    }
    case 'facultyDismissed':
      vars.name = entry.name;
      break;
    case 'termClosed': {
      vars.term = termLabel(entry.term);
      vars.net = formatMoney(Math.abs(entry.net));
      vars.ledger = entry.net < 0 ? 'in the red' : 'in the black';
      return { text: fill(line.text, vars), tone: entry.net < 0 ? 'bad' : 'good' };
    }
    case 'rungChanged': {
      const down = entry.to > entry.from;
      const to = rungWords(entry.to).name;
      vars.rungLine = down
        ? `The college is ${to === 'Receivership' ? 'in receivership' : to.toLowerCase()}.`
        : entry.to === 0
          ? 'The college is on a sound footing again.'
          : `The college climbs back to ${to.toLowerCase()}.`;
      return { text: fill(line.text, vars), tone: down ? 'bad' : 'good' };
    }
    case 'boardLetter':
      vars.title = letterById(entry.letter).title;
      break;
    case 'cutsImposed':
      vars.cuts = entry.cuts
        .map((c) => CUT_WORDS.find((w) => w.id === c)?.label.toLowerCase() ?? c)
        .join(', ');
      break;
    case 'yearClosed': {
      // The one line whose tone is the number's: in the black or in the red.
      vars.year = String(entry.year);
      vars.net = formatMoney(Math.abs(entry.net));
      vars.ledger = entry.net < 0 ? 'in the red' : 'in the black';
      return { text: fill(line.text, vars), tone: entry.net < 0 ? 'bad' : 'good' };
    }
    case 'mark':
      vars.label = entry.label;
      break;
    default:
      break;
  }
  return line.tone
    ? { text: fill(line.text, vars), tone: line.tone }
    : { text: fill(line.text, vars) };
}
