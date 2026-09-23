import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { clockHeld, defaultResolution, type Action, type Speed } from '../sim/index.ts';
import { GameStore } from './store.ts';

// THE CLOCK CONTROL AND THE HOLD (DD §3.3). A beat, a letter from the board
// or a seismic event stops the week in the sim; the speed control is where
// the player reads the clock's state, so it must say so. These are the four
// ways in and out of a hold.

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

const PLACE_HALL = {
  type: 'placeBuilding',
  buildingId: 'founders-hall',
  col: 28,
  row: 28,
  rotated: false,
} as const;

function held(store: GameStore): boolean {
  const { run } = store.getSnapshot();
  return run !== null && clockHeld(run.state);
}

function resolve(store: GameStore): void {
  const { run } = store.getSnapshot();
  const action = run ? defaultResolution(run.state) : null;
  expect(action).not.toBeNull();
  expect(store.dispatch(action as Action)).toBe(true);
}

// A founded college running at `speed`, stepped forward to the first thing
// the calendar holds the clock for.
function upToHold(speed: Speed): GameStore {
  const store = new GameStore();
  store.newGame(4);
  expect(store.dispatch(FOUND)).toBe(true);
  expect(store.dispatch(PLACE_HALL)).toBe(true);
  store.setSpeed(speed);
  for (let i = 0; i < 60 && !held(store); i++) store.stepWeeks(1);
  expect(held(store)).toBe(true);
  return store;
}

describe('the speed control while the clock is held', () => {
  it('drops to Paused when a beat takes hold, and goes back afterwards', () => {
    const store = upToHold('x2');
    expect(store.getSnapshot().speed).toBe('paused');
    // The speed it will come back at is carried, not lost.
    expect(store.getSnapshot().queuedSpeed).toBe('x2');
    resolve(store);
    expect(held(store)).toBe(false);
    expect(store.getSnapshot().speed).toBe('x2');
    expect(store.getSnapshot().queuedSpeed).toBeNull();
  });

  it('queues a speed set while the beat waits rather than claiming the week moves', () => {
    const store = upToHold('x2');
    // DD §3.3 leaves the control live through a hold; a press during one is
    // a deliberate choice about what happens next, not about right now, and
    // no pill may say the clock is running while it is not.
    store.setSpeed('x1');
    expect(store.getSnapshot().speed).toBe('paused');
    expect(store.getSnapshot().queuedSpeed).toBe('x1');
    resolve(store);
    expect(store.getSnapshot().speed).toBe('x1');
  });

  it('takes Paused pressed during a hold as a decision not to start again', () => {
    const store = upToHold('x2');
    store.setSpeed('paused');
    resolve(store);
    expect(store.getSnapshot().speed).toBe('paused');
  });

  it('leaves a player who was already paused paused', () => {
    const store = upToHold('paused');
    expect(store.getSnapshot().speed).toBe('paused');
    resolve(store);
    expect(store.getSnapshot().speed).toBe('paused');
  });

  it('invents no speed to resume at for a save loaded mid-hold', () => {
    const source = upToHold('x2');
    const run = source.getSnapshot().run;
    expect(run).not.toBeNull();

    const store = new GameStore();
    store.loadRun(run!);
    expect(store.getSnapshot().speed).toBe('paused');
    resolve(store);
    // Nothing was running when the save was opened, so nothing starts.
    expect(store.getSnapshot().speed).toBe('paused');
  });

  it('queues a speed pressed on a save loaded mid-hold, rather than lighting it', () => {
    const source = upToHold('x2');
    const store = new GameStore();
    store.loadRun(source.getSnapshot().run!);
    // The playtest: Space on a save opened at a board letter lit Play while
    // the week stood still.
    store.setSpeed('x1');
    expect(store.getSnapshot().speed).toBe('paused');
    expect(store.getSnapshot().queuedSpeed).toBe('x1');
    resolve(store);
    expect(store.getSnapshot().speed).toBe('x1');
  });
});

describe('a fault stops the clock rather than the game (Phase 33)', () => {
  it('keeps the last whole run, stops, and refuses speed until the player has seen it', () => {
    const store = new GameStore();
    store.newGame(7);
    store.dispatch(FOUND);
    store.dispatch(PLACE_HALL);
    const before = store.getSnapshot().run!;
    // A state the sim cannot tick: the treasury gone from under it.
    const broken = { ...before, state: { ...before.state, treasury: undefined } } as never;
    store.loadRun(broken);
    store.stepWeeks(1);
    const snap = store.getSnapshot();
    expect(snap.fault).toBeTruthy();
    expect(snap.speed).toBe('paused');
    expect(snap.run).toBe(broken);
    store.setSpeed('x1');
    expect(store.getSnapshot().speed).toBe('paused');
    store.clearFault();
    expect(store.getSnapshot().fault).toBeNull();
  });

  it('catches an action that throws, and says so', () => {
    const store = new GameStore();
    store.newGame(7);
    store.dispatch(FOUND);
    const run = store.getSnapshot().run!;
    store.loadRun({ ...run, state: { ...run.state, campus: undefined } } as never);
    expect(store.dispatch(PLACE_HALL)).toBe(false);
    expect(store.getSnapshot().fault).toBeTruthy();
  });
});
