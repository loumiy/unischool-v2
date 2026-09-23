import raw from './conditions.json' with { type: 'json' };
import {
  EVENT_CONDITIONS,
  EVENT_EFFECTS,
  type EventCondition,
  type EventEffect,
} from './events.ts';
import { ContentError, obj, oneOf, str, validate } from './schema.ts';

// THE READINGS, IN WORDS (Phase 21F). Events, ambitions and campaigns all
// speak one vocabulary of conditions (content/events.ts), and until now the
// player never saw it: the docket showed a promise's title and "not yet",
// never what had been promised. Every condition gets a name and a unit
// here, so any clause can be shown as a measurement — "Enrolled 466 of
// 800" — and every lever a reward or a penalty pulls gets a name, so what
// missing a promise costs can be said as well.

export const READING_UNITS = [
  'count',
  'money',
  'percent',
  'rate',
  'score',
  'ratio',
  'years',
  'signed',
] as const;
export type ReadingUnit = (typeof READING_UNITS)[number];

export interface ReadingWords {
  label: string;
  unit: ReadingUnit;
}

const readingSchema = obj({ label: str, unit: oneOf(READING_UNITS) });

function load() {
  const file = raw as {
    readings: Record<string, unknown>;
    levers: Record<string, unknown>;
    lines: Record<string, unknown>;
  };
  const readings = {} as Record<EventCondition, ReadingWords>;
  for (const c of EVENT_CONDITIONS) {
    if (!(c in file.readings)) {
      throw new ContentError(
        `content/conditions.json.readings.${c}`,
        'every condition needs words',
      );
    }
    readings[c] = validate(
      readingSchema,
      file.readings[c],
      `content/conditions.json.readings.${c}`,
    );
  }
  for (const k of Object.keys(file.readings)) {
    if (!(EVENT_CONDITIONS as readonly string[]).includes(k)) {
      throw new ContentError(`content/conditions.json.readings.${k}`, 'not a condition');
    }
  }
  const levers = {} as Record<EventEffect, string>;
  for (const e of EVENT_EFFECTS) {
    levers[e] = validate(str, file.levers[e], `content/conditions.json.levers.${e}`);
  }
  const lines = validate(
    obj({ reaching: str, holding: str, missing: str, keeping: str }),
    file.lines,
    'content/conditions.json.lines',
  );
  return { readings, levers, lines };
}

const loaded = load();
export const READING_NAMES = loaded.readings;
export const LEVER_NAMES = loaded.levers;
export const MEASURE_WORDS = loaded.lines;
