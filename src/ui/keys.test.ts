import { describe, expect, it } from 'vitest';

import { KEY_GROUPS, MAP_KEYS, PAN_KEYS, SHELL_KEYS, TAB_HOTKEYS } from './keys.ts';
import { TABS } from './tabs.ts';

// The playtest found `s` bound twice — the map glided on it and the
// Students screen opened on it — which no type could have caught. These are
// the checks that would have.

describe('the key map (Phase 21A)', () => {
  it('gives the map first claim: no screen takes a key the map owns', () => {
    const owned = new Set(MAP_KEYS);
    for (const key of Object.keys(TAB_HOTKEYS)) {
      expect(owned.has(key), `the map already owns "${key}"`).toBe(false);
    }
  });

  it('claims no key twice anywhere', () => {
    const all = [...MAP_KEYS, ...Object.keys(TAB_HOTKEYS), ...SHELL_KEYS];
    const seen = new Set<string>();
    for (const key of all) {
      expect(seen.has(key), `"${key}" is claimed twice`).toBe(false);
      seen.add(key);
    }
  });

  it('gives every screen on the dock a key, and binds no screen that is not one', () => {
    const bound = new Set(Object.values(TAB_HOTKEYS));
    for (const tab of TABS) {
      expect(bound.has(tab.id), `${tab.id} has no hotkey`).toBe(true);
    }
    expect(bound.size).toBe(Object.keys(TAB_HOTKEYS).length);
  });

  it('pans in four directions, on both W/A/S/D and the arrows', () => {
    for (const cluster of [
      ['w', 'a', 's', 'd'],
      ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'],
    ]) {
      const dirs = cluster.map((k) => PAN_KEYS[k]);
      for (const [i, d] of dirs.entries()) expect(d, `${cluster[i]} does not pan`).toBeDefined();
      // Opposite keys cancel: a player holding both goes nowhere.
      expect([dirs[0]![0] + dirs[2]![0], dirs[0]![1] + dirs[2]![1]]).toEqual([0, 0]);
      expect([dirs[1]![0] + dirs[3]![0], dirs[1]![1] + dirs[3]![1]]).toEqual([0, 0]);
    }
  });

  // The help panel is rendered from KEY_GROUPS, so a binding nobody
  // described is a binding nobody can find.
  it('describes every key it answers in the help panel', () => {
    const described = new Set(
      KEY_GROUPS.flatMap((g) => g.bindings).flatMap((b) => b.keys.map((k) => k.toLowerCase())),
    );
    const undescribed = [
      ...Object.keys(TAB_HOTKEYS),
      ...SHELL_KEYS,
      'q',
      'e',
      'z',
      'x',
      'r',
      'p',
      'n',
    ]
      .map((k) => (k === ' ' ? 'space' : k))
      .filter((k) => !described.has(k));
    expect(undescribed, `undescribed keys: ${undescribed.join(', ')}`).toEqual([]);
  });
});
