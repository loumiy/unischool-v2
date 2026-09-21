import { serializeRun, type Run } from '../sim/index.ts';
import { deleteSave, readSave, writeSave } from './persistence.ts';
import { store } from './store.ts';

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export async function autosave(run: Run): Promise<void> {
  const file = serializeRun(run);
  await writeSave('autosave', file);
  store.markAutosaved(file.savedAt);
}

// Resume the autosave if there is a valid one, else found a new run. A bad
// save can never stop the game booting: loadSaveFile has already collapsed
// every failure into a reason, and here that reason means "new game".
export async function boot(): Promise<void> {
  store.onYearTurn = (run) => void autosave(run);
  const saved = await readSave('autosave');
  if (saved?.ok) {
    store.loadRun({ state: saved.save.state, log: saved.save.log }, saved.save.savedAt);
  } else {
    if (saved && !saved.ok) console.warn(`autosave ignored: ${saved.reason}`);
    store.newGame(randomSeed());
  }
  store.start();
}

// The main menu's New Game: erase the browser's saved run and open the
// doors again on a fresh seed. The founding screen is what a new run is.
export async function eraseAndRestart(): Promise<void> {
  await deleteSave('autosave');
  store.newGame(randomSeed());
}
