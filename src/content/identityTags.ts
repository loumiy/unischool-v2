import raw from './identity-tags.json' with { type: 'json' };
import { arr, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// PERCEIVED IDENTITY (DD §11.2): the ten things the guidebooks say about a
// college. The league's schools each carry one from the start; the
// player's college earns and sheds them from how it is run.

export const TAG_IDS = [
  'research-powerhouse',
  'teaching-college',
  'party-school',
  'jock-school',
  'artsy',
  'commuter',
  'country-club',
  'pressure-cooker',
  'the-bargain',
  'old-money',
] as const;
export type TagId = (typeof TAG_IDS)[number];

export interface TagDef {
  id: TagId;
  name: string;
  blurb: string;
  // What the tag does to the applicant pool (DD §8.2, §11.2): a share on
  // its size and points on the admitted class's quality.
  size: number;
  quality: number;
  // Why the college has it, in a sentence.
  why: string;
  // What it does beyond the pool (Phase 43): one lever, an amount, and the
  // sentence that says so.
  teeth: { lever: TagLever; amount: number; line: string };
}

export const TAG_LEVERS = [
  'giving', // a share more alumni giving
  'attrition', // points on every class's yearly attrition
  'studentCost', // dollars a student a year on the programs line
  'athletics', // points on every team's strength
  'beauty', // points of campus beauty
  'satisfaction', // points on every class's satisfaction
  'yield', // points on the admissions yield
] as const;
export type TagLever = (typeof TAG_LEVERS)[number];

const schema = obj({
  tags: arr(
    obj({
      id: str,
      name: str,
      blurb: str,
      size: num,
      quality: num,
      why: str,
      teeth: obj({ lever: oneOf(TAG_LEVERS), amount: num, line: str }),
    }),
  ),
  words: obj({
    title: str,
    none: str,
    hint: str,
    pool: str,
    earning: str,
    shedding: str,
  }),
});

const file = validate(schema, raw, 'content/identity-tags.json');
export const TAG_WORDS = file.words;

function load(): TagDef[] {
  const tags = uniqueBy(file.tags, (t) => t.id, 'content/identity-tags.json.tags');
  for (const id of TAG_IDS) {
    if (!tags.some((t) => t.id === id)) throw new Error(`identity-tags.json: missing ${id}`);
  }
  return tags as TagDef[];
}

export const TAGS: readonly TagDef[] = load();

export function tagById(id: TagId): TagDef {
  return TAGS.find((t) => t.id === id)!;
}
