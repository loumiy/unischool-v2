import { describe, expect, it } from 'vitest';
import { newRun, serializeRun, loadSaveFile, type LoadResult } from '../sim/index.ts';
import { pickBoot } from './boot.ts';

// CRASH-SAFE AUTOSAVE (Phase 33): the autosave is rotated, and a torn one
// costs a year rather than the run.

const good = loadSaveFile(JSON.parse(JSON.stringify(serializeRun(newRun(3)))));
const torn: LoadResult = { ok: false, reason: 'file is not a save' };

describe('which save the game opens', () => {
  it('opens the autosave when it reads', () => {
    expect(good.ok).toBe(true);
    expect(pickBoot(good, good)?.from).toBe('autosave');
  });

  it('falls back to the one before it when the autosave is torn or gone', () => {
    expect(pickBoot(torn, good)?.from).toBe('autosave-prev');
    expect(pickBoot(null, good)?.from).toBe('autosave-prev');
  });

  it('founds a new run only when neither reads', () => {
    expect(pickBoot(torn, torn)).toBeNull();
    expect(pickBoot(null, null)).toBeNull();
  });
});
