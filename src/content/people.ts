import raw from './people.json' with { type: 'json' };
import { obj, str, validate } from './schema.ts';

// The words on the Students screen and the Admissions Day and Convocation
// bodies: the one sentence for every reading, and the few lines the
// screens say.

const fileSchema = obj({
  readings: obj({
    enrolled: str,
    applicants: str,
    admitted: str,
    yield: str,
    classSize: str,
    quality: str,
    tuition: str,
    netTuition: str,
    selectivity: str,
    revenue: str,
    beds: str,
    meals: str,
    seats: str,
    triples: str,
    satisfaction: str,
    attrition: str,
    cohortSize: str,
    cohortQuality: str,
    teachingQuality: str,
    base: str,
    housing: str,
    dining: str,
    seatsTerm: str,
    condition: str,
    teachingTerm: str,
    morale: str,
    placement: str,
    conditions: str,
    distinguished: str,
    placed: str,
    adrift: str,
    outcomeScore: str,
    campusBeauty: str,
    greenery: str,
    landmarks: str,
    upkeep: str,
    lifeTerm: str,
    eventsTerm: str,
  }),
  words: obj({
    noClass: str,
    capped: str,
    triplesWarning: str,
    roomToSpare: str,
    noAlumni: str,
    breakdownTitle: str,
    outcomesTitle: str,
    nextClass: str,
    housingAhead: str,
    housingShort: str,
  }),
});

const file = validate(fileSchema, raw, 'content/people.json');

export const PEOPLE_READINGS = file.readings;
export const PEOPLE_WORDS = file.words;

export function fillWords(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, k: string) =>
    k in vars ? String(vars[k]) : whole,
  );
}
