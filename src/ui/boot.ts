import { serializeRun, type LoadResult, type Run } from '../sim/index.ts';
import { deleteSave, readSave, writeAutosave } from './persistence.ts';
import { store } from './store.ts';

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

// The week the autosave last wrote, so leaving the tab does not write the
// same run twice.
let savedWeek = -1;

export async function autosave(run: Run): Promise<void> {
  // A run that faulted is not written over the last good one (Phase 33):
  // the week it stopped on would stop it again on the next load.
  if (store.getSnapshot().fault) return;
  const file = serializeRun(run);
  await writeAutosave(file);
  savedWeek = run.state.clock.absoluteWeek;
  store.markAutosaved(file.savedAt);
}

// Which save to open (Phase 33): the autosave if it reads, else the one
// before it, else nothing. A save can be torn — a tab closed mid-write, a
// browser crash — and that should cost a year, never the run.
export function pickBoot(
  primary: LoadResult | null,
  backup: LoadResult | null,
): { from: 'autosave' | 'autosave-prev'; result: LoadResult & { ok: true } } | null {
  if (primary?.ok) return { from: 'autosave', result: primary };
  if (backup?.ok) return { from: 'autosave-prev', result: backup };
  return null;
}

// Resume the autosave if there is a valid one, else the one before it,
// else found a new run. A bad save can never stop the game booting:
// loadSaveFile has already collapsed every failure into a reason.
export async function boot(): Promise<void> {
  store.onYearTurn = (run) => void autosave(run);
  const primary = await readSafely('autosave');
  const picked = pickBoot(primary, primary?.ok ? null : await readSafely('autosave-prev'));
  if (picked) {
    if (picked.from === 'autosave-prev') {
      console.warn(
        `autosave ignored (${primary && !primary.ok ? primary.reason : 'unreadable'}); opened the one before it`,
      );
    }
    const { save } = picked.result;
    store.loadRun({ state: save.state, log: save.log }, save.savedAt);
    savedWeek = save.state.clock.absoluteWeek;
  } else {
    if (primary && !primary.ok) console.warn(`autosave ignored: ${primary.reason}`);
    store.newGame(randomSeed());
  }
  store.start();
  // Leaving the tab is the likeliest end of an evening: write the run
  // then, if a week has passed since the last write.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const { run } = store.getSnapshot();
    if (run && run.state.phase === 'running' && run.state.clock.absoluteWeek !== savedWeek) {
      void autosave(run);
    }
  });
}

async function readSafely(slot: 'autosave' | 'autosave-prev'): Promise<LoadResult | null> {
  try {
    return await readSave(slot);
  } catch (error) {
    return { ok: false, reason: `could not read the ${slot}: ${String(error)}` };
  }
}

// The main menu's New Game: erase the browser's saved run and open the
// doors again on a fresh seed. The founding screen is what a new run is.
export async function eraseAndRestart(): Promise<void> {
  await deleteSave('autosave');
  await deleteSave('autosave-prev');
  savedWeek = -1;
  store.newGame(randomSeed());
}
