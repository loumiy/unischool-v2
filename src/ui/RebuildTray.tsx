import { buildingById } from '../content/buildings.ts';
import { conditionWord, ESTATE_WORDS } from '../content/treasury.ts';
import {
  canApply,
  extensionCost,
  formatMoney,
  formatPercent,
  freeLandShare,
  renovationCost,
  type Financing,
  type GameState,
} from '../sim/index.ts';

// THE ESTATE, FACING THE PLAYER (DD §6.6, Phase 25). When the land is
// nearly full the Build menu opens here: every standing building that
// wants renovating or could go up a storey, worst first, with the price of
// each and the Historic ones marked — the rebuild-or-preserve choices the
// late game is made of.
export default function RebuildTray({
  state,
  financing,
  onRenovate,
  onExtend,
}: {
  state: GameState;
  financing: Financing;
  onRenovate: (placementId: string) => void;
  onExtend: (placementId: string) => void;
}) {
  const rows = state.campus.placements
    .filter((p) => p.status === 'open')
    .map((p) => {
      const renovate = canApply(state, { type: 'renovate', placementId: p.id, financing });
      const extend = canApply(state, { type: 'extend', placementId: p.id, financing });
      return { p, renovate: renovate.ok, extend: extend.ok };
    })
    .filter((r) => r.renovate || r.extend || r.p.historic)
    .sort((a, b) => b.p.backlog - a.p.backlog || a.p.id.localeCompare(b.p.id));
  return (
    <div className="rebuild-tray">
      <p className="rebuild-note">
        {formatPercent(freeLandShare(state.campus), 0)} of the parcel's ground is still free.{' '}
        {rows.length === 0 ? 'Nothing standing wants work.' : 'Worst first:'}
      </p>
      <ul className="rebuild-list">
        {rows.map(({ p, renovate, extend }) => {
          const def = buildingById(p.buildingId);
          return (
            <li key={p.id} className={`rebuild-row ${p.historic ? 'historic' : ''}`}>
              <span className="rebuild-name">
                {def.name}
                {p.historic && (
                  <span className="rebuild-historic" title={ESTATE_WORDS.hints.historic}>
                    Historic
                  </span>
                )}
              </span>
              <span className="rebuild-state">
                {conditionWord(p.condition)} · backlog {formatMoney(p.backlog)}
              </span>
              <span className="rebuild-actions">
                {renovate && (
                  <button
                    type="button"
                    className="species-chip"
                    title={ESTATE_WORDS.hints.renovate}
                    onClick={() => onRenovate(p.id)}
                  >
                    Renovate · {formatMoney(renovationCost(p))}
                  </button>
                )}
                {extend && (
                  <button
                    type="button"
                    className="species-chip"
                    title={ESTATE_WORDS.hints.extend}
                    onClick={() => onExtend(p.id)}
                  >
                    Add a storey · {formatMoney(extensionCost(p))}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
