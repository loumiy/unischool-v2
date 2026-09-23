import raw from './report.json' with { type: 'json' };
import { TAG_IDS } from './identityTags.ts';
import { AXES } from './league.ts';
import { arr, num, obj, str, validate } from './schema.ts';

// THE FINAL REPORT'S WORDS (DD §12.2): the grade bands, the phrases the
// identity title is composed from, the financial verdicts, and the
// report's own words.

const schema = obj({
  grades: arr(obj({ at: num, letter: str })),
  tagPhrases: obj(Object.fromEntries(TAG_IDS.map((t) => [t, str]))),
  axisPhrases: obj(Object.fromEntries(AXES.map((a) => [a, str]))),
  weaknesses: obj(Object.fromEntries(AXES.map((a) => [a, str]))),
  strengthTail: str,
  titleShape: str,
  verdicts: obj({
    rich: str,
    steady: str,
    poorer: str,
    distress: str,
    scars: str,
    debt: str,
    clean: str,
  }),
  words: obj({
    title: str,
    eyebrow: str,
    mark: str,
    markHint: str,
    axes: str,
    axisLine: str,
    ambitions: str,
    ambitionsLine: str,
    ambitionsNone: str,
    finances: str,
    chronicle: str,
    rank: str,
    continue: str,
    copy: str,
    copied: str,
    epilogue: str,
    epilogueNote: str,
    addendum: str,
  }),
});

const file = validate(schema, raw, 'content/report.json');

export const GRADE_BANDS = [...file.grades].sort((a, b) => b.at - a.at);
export const TAG_PHRASES = file.tagPhrases as Record<(typeof TAG_IDS)[number], string>;
export const AXIS_PHRASES = file.axisPhrases as Record<(typeof AXES)[number], string>;
export const WEAKNESSES = file.weaknesses as Record<(typeof AXES)[number], string>;
export const REPORT_SHAPES = { strengthTail: file.strengthTail, titleShape: file.titleShape };
export const VERDICTS = file.verdicts;
export const REPORT_WORDS = file.words;

export function gradeFor(score: number): string {
  return GRADE_BANDS.find((b) => score >= b.at)?.letter ?? 'F';
}
