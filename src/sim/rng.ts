// The sim's one seeded RNG stream (DD §15). sfc32: 128 bits of state, fast,
// and — the property that matters here — its whole state is four integers,
// so it serialises into the save and a replay from seed + action log lands
// on identical numbers.
//
// The stream is owned by the sim core. UI code never draws from it; anything
// presentational that wants randomness (ambient walkers, Phase 13) keeps its
// own, so that watching the map cannot change what the map is watching.

export type RngState = readonly [number, number, number, number];

// Fold a 32-bit seed into four well-mixed words (splitmix32) so that seeds 1
// and 2 do not start the stream a hair apart.
export function seedToState(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
  return [next(), next(), next(), next()];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  static fromSeed(seed: number): Rng {
    const rng = new Rng(seedToState(seed));
    // Warm up: discard the first few outputs so the seed-derived words have
    // mixed through the state before anything reads it.
    for (let i = 0; i < 12; i++) rng.nextU32();
    return rng;
  }

  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  snapshot(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  // Uniform in [0, 1).
  next(): number {
    return this.nextU32() / 4294967296;
  }

  // Uniform integer in [min, max], inclusive.
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`int(${min}, ${max}): max < min`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick: empty list');
    return items[this.int(0, items.length - 1)]!;
  }
}
