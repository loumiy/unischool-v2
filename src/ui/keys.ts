import type { TabId } from './tabs.ts';

// THE KEY MAP, IN ONE PLACE (Phase 21A). Every key the game answers is
// declared here and nowhere else, for two reasons the playtest found the
// hard way.
//
// The first is collision. `s` opened the Students screen while W/A/S/D
// glided the camera, so a player panning left-handed opened a screen by
// accident and the glide stopped. A key claimed in two files is a bug no
// type can catch, so the claims live together and a test asserts they are
// disjoint (keys.test.ts).
//
// The second is discovery. The help panel is rendered from this table, so
// the keys a player is told about and the keys the game answers cannot
// drift apart: adding a binding without describing it fails the test.
//
// THE RULE: the map owns the left hand. Pan, turn, tilt, the building's own
// quarter-turn and the path tool are all within reach of one hand resting
// on W/A/S/D, and no screen may take a key from that cluster.

export interface KeyBinding {
  keys: string[]; // the caps to draw, in order
  does: string;
}

export interface KeyGroup {
  title: string;
  bindings: KeyBinding[];
}

// Which way the camera slides for a key held down, in grid terms.
export const PAN_KEYS: Record<string, readonly [number, number]> = {
  w: [0, 1],
  a: [1, 0],
  s: [0, -1],
  d: [-1, 0],
  arrowup: [0, 1],
  arrowleft: [1, 0],
  arrowdown: [0, -1],
  arrowright: [-1, 0],
};

// The cluster the map keeps, and no screen may claim.
export const MAP_KEYS: readonly string[] = [
  ...Object.keys(PAN_KEYS),
  'q',
  'e', // turn the view
  'z',
  'x', // tilt it
  'r', // turn the building being placed
  'p', // the path tool
  'home', // back to the opening view
];

// The screens on the dock. Students moved off `s` in Phase 21A because the
// map had the better claim on it; League is bound here so the key exists
// before Phase 22 fills the screen behind it.
export const TAB_HOTKEYS: Record<string, TabId> = {
  c: 'curriculum',
  f: 'faculty',
  u: 'students',
  t: 'treasury',
  g: 'league',
  h: 'history',
};

// The rest of the shell's keys, declared so the test can see them all.
export const SHELL_KEYS: readonly string[] = ['b', 'l', '`', '1', '2', '3', '4', ' ', 'escape'];

export const KEY_GROUPS: readonly KeyGroup[] = [
  {
    title: 'The map',
    bindings: [
      { keys: ['W', 'A', 'S', 'D'], does: 'glide the camera; the arrow keys do the same' },
      { keys: ['Q', 'E'], does: 'turn the view a quarter turn round the campus' },
      { keys: ['Z', 'X'], does: 'tilt: Z toward level, X toward a straight-down view' },
      { keys: ['Home'], does: 'back to the opening view' },
      { keys: ['drag', 'scroll'], does: 'pan and zoom with the mouse' },
    ],
  },
  {
    title: 'Building',
    bindings: [
      { keys: ['B'], does: 'open and close the Build menu' },
      { keys: ['R'], does: 'turn the building you are holding a quarter turn' },
      { keys: ['P'], does: 'the path tool; drag to draw, right button to erase' },
      { keys: ['Escape'], does: 'put down what you are holding, then back out a layer' },
    ],
  },
  {
    title: 'The screens',
    bindings: [
      { keys: ['C'], does: 'Curriculum' },
      { keys: ['F'], does: 'Faculty' },
      { keys: ['U'], does: 'Students' },
      { keys: ['T'], does: 'Treasury' },
      { keys: ['G'], does: 'League' },
      { keys: ['H'], does: 'History' },
      { keys: ['L'], does: 'the journal' },
    ],
  },
  {
    title: 'The clock',
    bindings: [
      { keys: ['Space'], does: 'pause, and start again at the speed you left' },
      { keys: ['1', '2', '3', '4'], does: '1×, 2×, 4×, 8× — the top two want a Provost and Deans' },
    ],
  },
  {
    title: 'Under the bonnet',
    bindings: [
      { keys: ['`'], does: 'the debug panel: the state tree, the clock and the action log' },
    ],
  },
];
