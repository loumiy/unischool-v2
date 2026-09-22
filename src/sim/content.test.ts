import { describe, expect, it } from 'vitest';
import { beatsAt, CALENDAR_BEATS } from '../content/calendarBeats.ts';
import {
  arr,
  ContentError,
  int,
  obj,
  oneOf,
  optional,
  str,
  uniqueBy,
  validate,
} from '../content/schema.ts';

describe('content: calendar beats', () => {
  it('loads the four annual beats (DD §3.3)', () => {
    expect(CALENDAR_BEATS.map((b) => b.id)).toEqual([
      'convocation',
      'board-meeting',
      'admissions-day',
      'budget-and-hiring',
    ]);
    expect(beatsAt('spring', 10).map((b) => b.name)).toEqual(['Admissions Day']);
    expect(beatsAt('summer', 4).map((b) => b.name)).toEqual(['Budget & Hiring']);
    expect(beatsAt('fall', 1).map((b) => b.name)).toEqual(['Convocation']);
    expect(beatsAt('fall', 12).map((b) => b.name)).toEqual(['Board Meeting']);
    expect(beatsAt('fall', 2)).toEqual([]);
  });
});

describe('content: schema', () => {
  const schema = obj({ id: str, n: int, kind: oneOf(['a', 'b']) });

  it('accepts a well-formed object', () => {
    expect(validate(schema, { id: 'x', n: 1, kind: 'a' }, 'f')).toEqual({
      id: 'x',
      n: 1,
      kind: 'a',
    });
  });

  it('names the path of the failure', () => {
    expect(() => validate(schema, { id: 'x', n: 1.5, kind: 'a' }, 'f')).toThrow('f.n');
    expect(() => validate(schema, { id: 'x', n: 1, kind: 'z' }, 'f')).toThrow('f.kind');
    expect(() => validate(arr(schema), [{ id: 1 }], 'f')).toThrow('f[0].id');
  });

  it('rejects unknown fields (typos in content files)', () => {
    expect(() => validate(schema, { id: 'x', n: 1, kind: 'a', extra: true }, 'f')).toThrow(
      'f.extra: unknown field',
    );
  });

  it('leaves an absent optional field absent', () => {
    // Not cosmetic: a key present with an undefined value survives
    // Object.keys and Object.entries, and content code counts and
    // iterates those — an event's effects map reached its levers with
    // `undefined` amounts and turned every figure it touched into NaN.
    const loose = obj({ id: str, note: optional(str), n: optional(int) });
    const parsed = validate(loose, { id: 'x' }, 'f');
    expect(parsed).toEqual({ id: 'x' });
    expect(Object.keys(parsed)).toEqual(['id']);
    expect('note' in parsed).toBe(false);
    expect(validate(loose, { id: 'x', n: 2 }, 'f')).toEqual({ id: 'x', n: 2 });
  });

  it('rejects duplicate ids', () => {
    expect(() => uniqueBy([{ id: 'a' }, { id: 'a' }], (x) => x.id, 'f')).toThrow(ContentError);
  });
});
