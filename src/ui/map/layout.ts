import type { Placement } from '../../sim/index.ts';

// WHAT STANDS WHERE (Phase 52). The estate wears every week, so the
// placements array is new every week even when nothing has moved; keyed on
// it, the walk grid, the routes, the dressing and the crowd were rebuilt on
// every tick, and at 8× the map dropped a quarter of its frames. This is
// the part of the campus those layers read: which building, where, how big
// and in what state of works. It changes when the player builds, not when
// the roofs age.
export function layoutKey(placements: readonly Placement[]): string {
  return placements
    .map(
      (p) =>
        `${p.id}:${p.buildingId}:${p.col},${p.row}:${p.w}x${p.h}:${p.status}:${p.storeysAdded ?? 0}`,
    )
    .join(';');
}
