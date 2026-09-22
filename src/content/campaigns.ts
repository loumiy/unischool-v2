import raw from './campaigns.json' with { type: 'json' };
import { MEMORY_CLAUSES } from './alumni.ts';
import { EVENT_CONDITIONS, type EventCondition } from './events.ts';
import { arr, ContentError, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// CAMPAIGNS (DD §9.3). A multi-year drive against a stated goal, answered
// by the alumni ledger: which classes are warm, which are wealthy now, and
// which the case for support is actually about.
//
// `when` is the same closed vocabulary events and ambitions use, so a
// campaign is offered to a college whose state has earned it. `resonates`
// is the new half: the memory clauses (§8.4) a class must carry to feel
// personally asked — the housing campaign is addressed to the people who
// lived three to a room, and they give like it.

export const CAMPAIGN_KINDS = ['building', 'endowment', 'aid'] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export interface CampaignDef {
  id: string;
  kind: CampaignKind;
  title: string;
  weight: number;
  target: number;
  years: number;
  when: Partial<Record<EventCondition, number>>;
  resonates: string[]; // memory clause ids (content/alumni.json)
  text: string; // the case for support
  kept: string;
  missed: string;
}

function optionalNum(v: unknown, p: string): number | undefined {
  return v === undefined ? undefined : num(v, p);
}

const clauses = obj(
  Object.fromEntries(EVENT_CONDITIONS.map((c) => [c, optionalNum])),
) as unknown as (v: unknown, p: string) => Partial<Record<EventCondition, number>>;

const fileSchema = obj({
  campaigns: arr(
    obj({
      id: str,
      kind: oneOf(CAMPAIGN_KINDS),
      title: str,
      weight: num,
      target: num,
      years: num,
      when: clauses,
      resonates: arr(str),
      text: str,
      kept: str,
      missed: str,
    }),
  ),
  lines: obj({
    none: str,
    needsVp: str,
    running: str,
    lastYear: str,
    launched: str,
    closed: str,
    restricted: str,
    restrictedNote: str,
    askNote: str,
    resonance: str,
    oneAtATime: str,
    giftRestricted: str,
  }),
});

const loaded = validate(fileSchema, raw, 'campaigns.json');
uniqueBy(loaded.campaigns, (c) => c.id, 'campaigns.json.campaigns');

const CLAUSE_IDS = new Set(MEMORY_CLAUSES.map((c) => c.id));
for (const def of loaded.campaigns) {
  const at = `campaigns.json.${def.id}`;
  if (def.target <= 0) throw new ContentError(at, 'a campaign needs a number to close at');
  if (def.years < 2)
    throw new ContentError(at, 'a drive shorter than two years is a gift, not a drive');
  if (def.resonates.length === 0) {
    throw new ContentError(at, 'a case for support nobody is personally in is not a case');
  }
  for (const clause of def.resonates) {
    // The resonance names memory clauses by id, so a typo here would
    // silently mean "nobody feels asked" rather than failing to load.
    if (!CLAUSE_IDS.has(clause)) throw new ContentError(at, `no such memory clause "${clause}"`);
  }
}

export const CAMPAIGNS: readonly CampaignDef[] = loaded.campaigns;
export const CAMPAIGN_WORDS = loaded.lines;

export function findCampaign(id: string): CampaignDef | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

export function campaignById(id: string): CampaignDef {
  const found = findCampaign(id);
  if (!found) throw new ContentError('campaigns', `no such campaign "${id}"`);
  return found;
}
