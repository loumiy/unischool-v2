import { BUS_KINDS, type BusEntry, type BusKind } from '../sim/bus.ts';
import { classLabel, clockFromAbsoluteWeek, termLabel } from '../sim/calendar.ts';
import { institutionName } from '../sim/identity.ts';
import { formatMoney, formatPercent } from '../sim/treasury.ts';
import type { GameState } from '../sim/state.ts';
import { AMBITION_WORDS, ambitionById } from './ambitions.ts';
import { CAMPAIGN_WORDS, campaignById } from './campaigns.ts';
import { findBuilding } from './buildings.ts';
import { CUT_WORDS, letterById, rungWords } from './board.ts';
import { findBeat } from './calendarBeats.ts';
import { rankById, withArticle } from './faculty.ts';
import { findProgram, findSchool, tierById } from './schools.ts';
import { SEAT_WORDS, seatById } from './seats.ts';
import { findArc, STUDENT_WORDS } from './students.ts';
import { leagueSchoolById, methodologyById } from './league.ts';
import { ATHLETICS_LINES, sportById, TAUNTS } from './athletics.ts';
import { memoryLine } from '../sim/alumni.ts';
import { EVENT_WORDS, findEvent } from './events.ts';
import { fillEventText } from '../sim/events.ts';
import { beatLine, studentById } from '../sim/students.ts';
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

// The arc templates carry their own placeholders, filled from the sim
// rather than from the journal entry.
function fillArc(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

// A beat reads as good or bad from the stage it belongs to: leaving and
// drifting are losses, distinction is not.
function arcToneOf(arcId: string): 'good' | 'bad' | undefined {
  const stage = findArc(arcId)?.stage;
  if (stage === 'distinguished') return 'good';
  if (stage === 'leaving' || stage === 'adrift') return 'bad';
  return undefined;
}

function fill(template: string, vars: Partial<Record<Placeholder, string>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key as Placeholder] ?? whole);
}

// The opening of a question, to the last whole word that fits.
const DATELINE_CHARS = 64;
export function dateline(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  if (first.length <= DATELINE_CHARS) return first;
  const cut = first.slice(0, DATELINE_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 24)).replace(/[,;:\s]+$/, '')}…`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
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
    case 'classRemembered': {
      const alumni = state.people.alumni.find((a) => a.classYear === entry.classYear);
      vars.line = alumni
        ? memoryLine(alumni)
        : `${classLabel(entry.classYear)} goes down unremembered.`;
      break;
    }
    case 'eventFired': {
      const pending = state.events.pending.find((p) => p.instanceId === entry.instanceId);
      const def = findEvent(entry.eventId);
      // A dateline, not the event: the card on the strip is the event, and
      // the strip under it printing the same two hundred characters again
      // in ten-pixel type crowded out everything else it could say (Phase
      // 21G). A letter has a title; an inline question gets its opening
      // words.
      vars.line = def
        ? def.title
          ? fillEventText(def.title, pending?.vars ?? {})
          : dateline(fillEventText(def.text, pending?.vars ?? {}))
        : entry.eventId;
      break;
    }
    case 'eventResolved': {
      const def = findEvent(entry.eventId);
      const choice = def?.choices.find((c) => c.id === entry.choiceId);
      vars.line = fillArc(entry.timedOut ? EVENT_WORDS.timeout : EVENT_WORDS.resolved, {
        choice: choice?.label ?? entry.choiceId,
      });
      return { text: fill(line.text, vars), tone: entry.timedOut ? 'bad' : undefined };
    }
    case 'rankingsPublished': {
      vars.year = String(entry.year);
      vars.rank = ordinal(entry.rank);
      vars.count = String(entry.total);
      const moved = entry.previous === null ? 0 : entry.previous - entry.rank;
      vars.line =
        moved > 0
          ? `, up ${moved}`
          : moved < 0
            ? `, down ${-moved}`
            : entry.previous
              ? ', unchanged'
              : '';
      return {
        text: fill(line.text, vars),
        tone: moved > 0 ? 'good' : moved < 0 ? 'bad' : undefined,
      };
    }
    case 'methodologyChanged':
      vars.line = methodologyById(entry.methodologyId).line;
      break;
    case 'seasonClosed': {
      const sport = sportById(entry.sportId).name;
      vars.line = fillArc(entry.title ? ATHLETICS_LINES.champions : ATHLETICS_LINES.season, {
        sport,
        wins: String(entry.wins),
        losses: String(entry.losses),
      });
      return {
        text: fill(line.text, vars),
        tone: entry.title ? 'good' : entry.wins < entry.losses ? 'bad' : undefined,
      };
    }
    case 'rivalNamed':
      vars.line = fillArc(ATHLETICS_LINES.rivalNamed, {
        rival: leagueSchoolById(entry.schoolId).name,
      });
      break;
    case 'rivalTaunt': {
      const lines = TAUNTS[entry.mood];
      vars.line = fillArc(lines[entry.index % lines.length]!, {
        rival: leagueSchoolById(entry.schoolId).short,
        school: vars.school ?? 'the college',
      });
      return {
        text: fill(line.text, vars),
        tone: entry.mood === 'beat' || entry.mood === 'behind' ? 'good' : 'bad',
      };
    }
    case 'ambitionOffered':
      vars.line = fillArc(AMBITION_WORDS.offered, { title: ambitionById(entry.ambitionId).title });
      break;
    case 'ambitionAccepted':
      vars.line = fillArc(AMBITION_WORDS.accepted, {
        title: ambitionById(entry.ambitionId).title,
        years: String(entry.dueYear - clockFromAbsoluteWeek(entry.week).year),
      });
      break;
    case 'ambitionDeclined':
      vars.line = fillArc(AMBITION_WORDS.declined, { title: ambitionById(entry.ambitionId).title });
      break;
    case 'ambitionSettled': {
      const def = ambitionById(entry.ambitionId);
      vars.line = entry.kept ? def.kept : def.missed;
      return { text: fill(line.text, vars), tone: entry.kept ? 'good' : 'bad' };
    }
    case 'seatFilled': {
      const def = seatById(entry.seatId);
      const school = entry.schoolId === null ? null : findSchool(entry.schoolId);
      const title = school ? `${def.title} of ${school.name}` : def.title;
      vars.line = fillArc(SEAT_WORDS.appointed, {
        title,
        who: entry.outside ? SEAT_WORDS.outside : SEAT_WORDS.internal,
      });
      break;
    }
    case 'eventDelegated': {
      const def = findEvent(entry.eventId);
      const choice = def?.choices.find((c) => c.id === entry.choiceId);
      vars.line = fillArc(SEAT_WORDS.delegated, {
        title: seatById(entry.seatId).title,
        choice: choice?.label ?? entry.choiceId,
      });
      break;
    }
    case 'campaignLaunched': {
      const def = campaignById(entry.campaignId);
      vars.line = fillArc(CAMPAIGN_WORDS.launched, {
        title: def.title,
        target: formatMoney(def.target),
        years: String(def.years),
      });
      break;
    }
    case 'campaignClosed': {
      const def = campaignById(entry.campaignId);
      vars.line = entry.met ? def.kept : def.missed;
      return { text: fill(line.text, vars), tone: entry.met ? 'good' : 'bad' };
    }
    case 'reunionHeld':
      vars.label = classLabel(entry.classYear);
      break;
    case 'studentsNamed': {
      const names = entry.names;
      const list =
        names.length <= 1
          ? (names[0] ?? 'nobody')
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      vars.line = fillArc(STUDENT_WORDS.introduced, {
        names: list,
        label: classLabel(entry.classYear),
      });
      break;
    }
    case 'studentBeat': {
      // The beat's own words, from content/students.json, filled from the
      // student and the campus they are on.
      const student = studentById(state, entry.studentId);
      const arc = findArc(entry.arcId);
      vars.line = student ? beatLine(state, student, entry.arcId) : (arc?.line ?? entry.arcId);
      return { text: fill(line.text, vars), tone: arcToneOf(entry.arcId) };
    }
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
