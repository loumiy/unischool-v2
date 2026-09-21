import { BUS_KINDS, type BusEntry, type BusKind } from '../sim/bus.ts';
import { termLabel } from '../sim/calendar.ts';
import { institutionName } from '../sim/identity.ts';
import type { GameState } from '../sim/state.ts';
import { findBuilding } from './buildings.ts';
import { findBeat } from './calendarBeats.ts';
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

const PLACEHOLDERS = ['school', 'building', 'term', 'year', 'beat', 'line', 'label'] as const;
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
