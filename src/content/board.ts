import raw from './board.json' with { type: 'json' };
import { arr, int, obj, optional, str, uniqueBy, validate } from './schema.ts';

// The board's words (DD §5.5, §13.3): a name, rule and demand per rung, a
// letter for every transition that gets one, the austerity cuts, and the
// sentences for the readings. Distress is written straight.

export interface RungWords {
  id: number;
  name: string;
  rule: string;
  demand: string;
}

export interface BoardLetter {
  title: string;
  body: string[];
  signed: string;
}

export interface CutWords {
  id: string;
  label: string;
  blurb: string;
  phase?: number; // arrives with this phase; unavailable until then
}

const letterSchema = obj({ title: str, body: arr(str), signed: str });

const fileSchema = obj({
  rungs: arr(obj({ id: int, name: str, rule: str, demand: str })),
  letters: obj({
    'enter-1': letterSchema,
    'enter-2': letterSchema,
    'enter-3': letterSchema,
    'enter-4': letterSchema,
    'enter-5': letterSchema,
    'exit-5': letterSchema,
    recovered: letterSchema,
  }),
  cuts: arr(obj({ id: str, label: str, blurb: str, phase: optional(int) })),
  words: obj({
    confidence: str,
    rung: str,
    reserves: str,
    surplusRun: str,
    deficitRun: str,
    termsAtRung: str,
    receivership: str,
    policy: str,
    cutsRequired: str,
    cutsNone: str,
    letterPrompt: str,
  }),
});

const file = validate(fileSchema, raw, 'content/board.json');

export const RUNG_WORDS: readonly RungWords[] = uniqueBy(
  file.rungs,
  (r) => String(r.id),
  'content/board.json.rungs',
);
export const BOARD_LETTERS = file.letters;
export type BoardLetterId = keyof typeof BOARD_LETTERS;
export const CUT_WORDS: readonly CutWords[] = uniqueBy(
  file.cuts,
  (c) => c.id,
  'content/board.json.cuts',
);
export const BOARD_WORDS = file.words;

export function rungWords(rung: number): RungWords {
  const w = RUNG_WORDS.find((r) => r.id === rung);
  if (!w) throw new Error(`no words for rung ${rung}`);
  return w;
}

export function letterById(id: string): BoardLetter {
  const letter = (BOARD_LETTERS as Record<string, BoardLetter>)[id];
  if (!letter) throw new Error(`unknown board letter ${id}`);
  return letter;
}
