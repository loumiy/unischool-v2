import { useSyncExternalStore } from 'react';
import { store, type Snapshot } from './store.ts';

export function useGame(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
