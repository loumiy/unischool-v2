// A very small validator for content files (DD §15: content is JSON with a
// condition/effect DSL, validated at build time). Hand-rolled because the sim
// core is dependency-free; it grows with the DSL, phase by phase.

export type Validator<T> = (value: unknown, path: string) => T;

export class ContentError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContentError';
  }
}

export const str: Validator<string> = (v, p) => {
  if (typeof v !== 'string') throw new ContentError(p, 'expected a string');
  return v;
};

export const num: Validator<number> = (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ContentError(p, 'expected a number');
  return v;
};

export const int: Validator<number> = (v, p) => {
  if (!Number.isInteger(num(v, p))) throw new ContentError(p, 'expected an integer');
  return v as number;
};

export function oneOf<const T extends readonly string[]>(options: T): Validator<T[number]> {
  return (v, p) => {
    if (typeof v !== 'string' || !options.includes(v)) {
      throw new ContentError(p, `expected one of ${options.join(', ')}`);
    }
    return v as T[number];
  };
}

export function optional<T>(inner: Validator<T>): Validator<T | undefined> {
  return (v, p) => (v === undefined ? undefined : inner(v, p));
}

export function arr<T>(item: Validator<T>): Validator<T[]> {
  return (v, p) => {
    if (!Array.isArray(v)) throw new ContentError(p, 'expected an array');
    return v.map((x, i) => item(x, `${p}[${i}]`));
  };
}

type Shape = Record<string, Validator<unknown>>;
type Infer<S extends Shape> = { [K in keyof S]: S[K] extends Validator<infer T> ? T : never };

export function obj<S extends Shape>(shape: S): Validator<Infer<S>> {
  return (v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ContentError(p, 'expected an object');
    }
    const record = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) out[key] = shape[key]!(record[key], `${p}.${key}`);
    for (const key of Object.keys(record)) {
      if (!(key in shape)) throw new ContentError(`${p}.${key}`, 'unknown field');
    }
    return out as Infer<S>;
  };
}

// Also checks that `key` is unique across the list — every content list is
// keyed by id, and a duplicated id is the classic copy-paste content bug.
export function uniqueBy<T>(items: T[], key: (item: T) => string, path: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) throw new ContentError(path, `duplicate id "${k}"`);
    seen.add(k);
  }
  return items;
}

export function validate<T>(validator: Validator<T>, raw: unknown, file: string): T {
  return validator(raw, file);
}
