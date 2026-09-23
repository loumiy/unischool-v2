import raw from './league.json' with { type: 'json' };
import { TAG_IDS, type TagId } from './identityTags.ts';
import { arr, ContentError, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// THE LEAGUE (DD §11.3): twenty-four colleges the player is ranked
// against, each with a home on the six axes it drifts around, an identity,
// and a crest; and the guide's methodologies, one of which is in force.

export const AXES = [
  'academics',
  'research',
  'experience',
  'athletics',
  'access',
  'finance',
] as const;
export type AxisId = (typeof AXES)[number];
export type Axes = Record<AxisId, number>;

export interface LeagueSchoolDef {
  id: string;
  name: string;
  short: string;
  mark: string;
  hue: string;
  tag: TagId;
  // A neighbour is near enough to be a rival (DD §11.3); the rest are far.
  region: 'near' | 'far';
  home: Axes;
}

export interface MethodologyDef {
  id: string;
  name: string;
  line: string;
  weights: Axes;
}

const axes = obj({
  academics: num,
  research: num,
  experience: num,
  athletics: num,
  access: num,
  finance: num,
});

const schema = obj({
  schools: arr(
    obj({
      id: str,
      name: str,
      short: str,
      mark: str,
      hue: str,
      tag: oneOf(TAG_IDS),
      region: oneOf(['near', 'far'] as const),
      home: axes,
    }),
  ),
  methodologies: arr(obj({ id: str, name: str, line: str, weights: axes })),
  axes: obj(Object.fromEntries(AXES.map((a) => [a, obj({ label: str, hint: str })]))),
  words: obj({
    title: str,
    you: str,
    methodology: str,
    changedIn: str,
    since: str,
    notYet: str,
    rankHint: str,
    scoreHint: str,
    prestigeHint: str,
    axisHint: str,
    moved: obj({ up: str, down: str, same: str, new: str }),
    region: obj({ near: str, far: str }),
  }),
});

function load() {
  const file = validate(schema, raw, 'content/league.json');
  const schools = uniqueBy(file.schools, (s) => s.id, 'content/league.json.schools');
  if (schools.length !== 24) throw new ContentError('content/league.json', 'twenty-four schools');
  for (const [i, s] of schools.entries()) {
    for (const a of AXES) {
      const v = s.home[a];
      if (v < 0 || v > 100)
        throw new ContentError(`content/league.json.schools[${i}].home.${a}`, 'must be 0–100');
    }
  }
  const methods = uniqueBy(file.methodologies, (m) => m.id, 'content/league.json.methodologies');
  for (const [i, m] of methods.entries()) {
    const sum = AXES.reduce((t, a) => t + m.weights[a], 0);
    if (Math.abs(sum - 1) > 1e-6)
      throw new ContentError(`content/league.json.methodologies[${i}].weights`, 'must sum to 1');
  }
  return {
    schools: schools as LeagueSchoolDef[],
    methodologies: methods as MethodologyDef[],
    axes: file.axes as Record<AxisId, { label: string; hint: string }>,
    words: file.words,
  };
}

const loaded = load();

export const LEAGUE_SCHOOLS: readonly LeagueSchoolDef[] = loaded.schools;
export const METHODOLOGIES: readonly MethodologyDef[] = loaded.methodologies;
export const AXIS_WORDS = loaded.axes;
export const LEAGUE_WORDS = loaded.words;

export function leagueSchoolById(id: string): LeagueSchoolDef {
  const s = LEAGUE_SCHOOLS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown league school "${id}"`);
  return s;
}

export function methodologyById(id: string): MethodologyDef {
  return METHODOLOGIES.find((m) => m.id === id) ?? METHODOLOGIES[0]!;
}
