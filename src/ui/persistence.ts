import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { loadSaveFile, type LoadResult, type SaveFile } from '../sim/index.ts';

// Saves live in IndexedDB (DD §15): one autosave slot written every year-turn
// and three manual slots; export/import as a JSON file. The FORMAT is the
// sim's (sim/save.ts); this module only moves bytes.

export type SlotId = 'autosave' | 'slot-1' | 'slot-2' | 'slot-3';
export const SLOTS: readonly SlotId[] = ['autosave', 'slot-1', 'slot-2', 'slot-3'];
export const MANUAL_SLOTS: readonly SlotId[] = ['slot-1', 'slot-2', 'slot-3'];

// THE HALL OF FAME (DD §12.3, Phase 28): every completed run, kept across
// runs in this browser — its portrait, its colours, its title and grades,
// and its chronicle.
export interface HallEntry {
  id: string;
  school: string;
  colors: { primary: string; secondary: string };
  motif: string;
  title: string;
  mark: string;
  grades: { axis: string; grade: string }[];
  eras: string[];
  chronicle: string;
  // The campus as it stood at Year 50: the map's own SVG, and the season
  // class its colours were drawn under.
  portrait: string;
  season: string;
  finishedAt: string;
}

interface SaveDb extends DBSchema {
  saves: { key: SlotId; value: SaveFile };
  hall: { key: string; value: HallEntry };
}

let dbPromise: Promise<IDBPDatabase<SaveDb>> | null = null;

function db(): Promise<IDBPDatabase<SaveDb>> {
  dbPromise ??= openDB<SaveDb>('unischool-v2', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore('saves');
      if (oldVersion < 2) database.createObjectStore('hall');
    },
  });
  return dbPromise;
}

export async function hangInHall(entry: HallEntry): Promise<void> {
  await (await db()).put('hall', entry, entry.id);
}

export async function readHall(): Promise<HallEntry[]> {
  const all = await (await db()).getAll('hall');
  return all.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

export async function writeSave(slot: SlotId, file: SaveFile): Promise<void> {
  await (await db()).put('saves', file, slot);
}

// null when the slot is empty; otherwise the sim's verdict on what was there.
export async function readSave(slot: SlotId): Promise<LoadResult | null> {
  const raw = await (await db()).get('saves', slot);
  return raw === undefined ? null : loadSaveFile(raw);
}

export async function deleteSave(slot: SlotId): Promise<void> {
  await (await db()).delete('saves', slot);
}

export interface SlotSummary {
  slot: SlotId;
  savedAt: string;
  version: number;
}

export async function listSaves(): Promise<SlotSummary[]> {
  const d = await db();
  const out: SlotSummary[] = [];
  for (const slot of SLOTS) {
    const raw = await d.get('saves', slot);
    if (raw) out.push({ slot, savedAt: raw.savedAt, version: raw.version });
  }
  return out;
}

export function exportSave(file: SaveFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `unischool-seed${file.seed}-week${file.state.clock.absoluteWeek}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file: File): Promise<LoadResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, reason: 'file is not JSON' };
  }
  return loadSaveFile(parsed);
}
