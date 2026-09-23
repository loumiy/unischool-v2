import raw from './charters.json' with { type: 'json' };
import { findBuilding } from './buildings.ts';
import { findSchool } from './schools.ts';
import { TAG_IDS, type TagId } from './identityTags.ts';
import { arr, ContentError, num, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// FOUNDING CHARTERS (Phase 43, DD §2.4 and §11.2 amended): what the founders
// meant the college to be, chosen on the startup screen. A charter is not a
// class and locks nothing: a school it favours is cheaper to found, a
// project and a grand landmark come at a discount, the standings lean its
// way while the lean fades, and the world's questions lean its way too.

export const CHARTER_IDS = [
  'liberal-arts',
  'research-university',
  'polytechnic',
  'land-grant',
] as const;
export type CharterId = (typeof CHARTER_IDS)[number];

export interface CharterDef {
  id: CharterId;
  name: string;
  blurb: string;
  school: string; // founded at half the cost
  project: string; // a capital project at a discount
  landmark: string; // the grand landmark at half the price
  demand: number; // a factor on the applicant pool, fading
  lean: Partial<Record<'academics' | 'research' | 'experience' | 'athletics' | 'access', number>>;
  domains: Record<string, number>; // event weights by domain
  tag: TagId; // what the guidebooks are first inclined to call it
  suffix: string; // the second word of its name, carved on the facade
}

const schema = obj({
  charters: arr(
    obj({
      id: str,
      name: str,
      blurb: str,
      school: str,
      project: str,
      landmark: str,
      tag: oneOf(TAG_IDS),
      suffix: str,
      demand: num,
      lean: obj({
        academics: optional(num),
        research: optional(num),
        experience: optional(num),
        athletics: optional(num),
        access: optional(num),
      }),
      domains: (v: unknown, p: string) => {
        if (typeof v !== 'object' || v === null) throw new ContentError(p, 'expected an object');
        const out: Record<string, number> = {};
        for (const [k, n] of Object.entries(v)) {
          if (typeof n !== 'number') throw new ContentError(`${p}.${k}`, 'expected a number');
          out[k] = n;
        }
        return out;
      },
    }),
  ),
  words: obj({ title: str, hint: str, school: str, project: str, landmark: str, tag: str }),
});

function load() {
  const file = validate(schema, raw, 'content/charters.json');
  const list = uniqueBy(file.charters, (c) => c.id, 'content/charters.json.charters');
  for (const [i, c] of list.entries()) {
    const at = `content/charters.json.charters[${i}]`;
    if (!(CHARTER_IDS as readonly string[]).includes(c.id))
      throw new ContentError(`${at}.id`, `unknown charter ${c.id}`);
    if (!findSchool(c.school)) throw new ContentError(`${at}.school`, `unknown school ${c.school}`);
    if (!findBuilding(c.project)?.project)
      throw new ContentError(`${at}.project`, `${c.project} is not a capital project`);
    if (findBuilding(c.landmark)?.group !== 'grand')
      throw new ContentError(`${at}.landmark`, `${c.landmark} is not a grand landmark`);
  }
  for (const id of CHARTER_IDS)
    if (!list.some((c) => c.id === id))
      throw new ContentError('content/charters.json', `missing ${id}`);
  return { charters: list as CharterDef[], words: file.words };
}

const loaded = load();
export const CHARTERS: readonly CharterDef[] = loaded.charters;
export const CHARTER_WORDS = loaded.words;

export function charterById(id: CharterId): CharterDef {
  return CHARTERS.find((c) => c.id === id)!;
}
