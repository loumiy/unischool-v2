import raw from './seats.json' with { type: 'json' };
import { EVENT_DOMAINS, type EventDomain } from './events.ts';
import { arr, ContentError, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// DELEGATED SEATS (DD §9.1–§9.2). A seat automates a domain's routine
// according to one policy the player sets, contributes to speed gating
// (§3.2), and costs permanent payroll and a step of the administrative
// ratchet (§5.4) forever.

// What a policy actually does, over the effects an event already carries.
// Three rules, named differently per seat, because a Provost and a
// Facilities Director do not describe the same instinct the same way.
export const POLICY_RULES = ['thrifty', 'thorough', 'popular'] as const;
export type PolicyRule = (typeof POLICY_RULES)[number];

export interface PolicyDef {
  id: string;
  rule: PolicyRule;
  label: string;
  note: string;
}

export interface SeatDef {
  id: string;
  title: string;
  domain: EventDomain;
  // A Dean is a seat per founded school; every other seat is one seat.
  perSchool: boolean;
  outsideSalary: number;
  internalSalary: number;
  // Steps of administrative ratchet this seat adds (DD §5.4).
  ratchet: number;
  policies: PolicyDef[];
  defaultPolicy: string;
  blurb: string;
  outsideLine: string;
  internalLine: string;
}

const fileSchema = obj({
  seats: arr(
    obj({
      id: str,
      title: str,
      domain: oneOf(EVENT_DOMAINS),
      perSchool: (v: unknown, p: string) => {
        if (typeof v !== 'boolean') throw new ContentError(p, 'expected a boolean');
        return v;
      },
      outsideSalary: num,
      internalSalary: num,
      ratchet: num,
      policies: arr(obj({ id: str, rule: oneOf(POLICY_RULES), label: str, note: str })),
      defaultPolicy: str,
      blurb: str,
      outsideLine: str,
      internalLine: str,
    }),
  ),
  rules: obj({ thrifty: str, thorough: str, popular: str }),
  lines: obj({
    vacant: str,
    heldBy: str,
    heldOutside: str,
    appointed: str,
    delegated: str,
    payrollNote: str,
    escalated: str,
    speedNote: str,
    noSchools: str,
    noSenior: str,
    internal: str,
    outside: str,
  }),
});

const loaded = validate(fileSchema, raw, 'seats.json');
uniqueBy(loaded.seats, (s) => s.id, 'seats.json.seats');

for (const seat of loaded.seats) {
  const at = `seats.json.${seat.id}`;
  if (seat.policies.length < 2)
    throw new ContentError(at, 'a seat with one policy is not a choice');
  uniqueBy(seat.policies, (p) => p.id, `${at}.policies`);
  if (!seat.policies.some((p) => p.id === seat.defaultPolicy)) {
    throw new ContentError(at, `defaultPolicy "${seat.defaultPolicy}" is not one of its policies`);
  }
  // Internal is meant to be the cheaper way (DD §9.1); if it is not, the
  // whole trade the seat is built around has been mistyped.
  if (seat.internalSalary >= seat.outsideSalary) {
    throw new ContentError(at, 'the internal appointment must be the cheaper one');
  }
  if (seat.ratchet <= 0) throw new ContentError(at, 'every seat is a step of the ratchet');
}

export const SEATS: readonly SeatDef[] = loaded.seats;
export const SEAT_RULES = loaded.rules;
export const SEAT_WORDS = loaded.lines;

export function findSeat(id: string): SeatDef | undefined {
  return SEATS.find((s) => s.id === id);
}

export function seatById(id: string): SeatDef {
  const found = findSeat(id);
  if (!found) throw new ContentError('seats', `no such seat "${id}"`);
  return found;
}

// The seat that covers a domain, if the game has one. `money` and `board`
// have none, and that is the design: some things are the President's.
export function seatForDomain(domain: EventDomain): SeatDef | undefined {
  return SEATS.find((s) => s.domain === domain && !s.perSchool);
}
