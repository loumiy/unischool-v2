import { useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import type { Placement } from '../sim/index.ts';

// The card for a placed building: what it is, how much ground it covers,
// and the one thing Phase 3 lets you do to it. A fixed corner card, not a
// popover: the building moves under pan and zoom and the card should not.
export default function BuildingInfoPanel({
  placement,
  onClose,
  onDemolish,
}: {
  placement: Placement;
  onClose: () => void;
  onDemolish: () => void;
}) {
  const def = buildingById(placement.buildingId);
  const [armed, setArmed] = useState(false);
  return (
    <aside className="building-panel" role="dialog" aria-label={def.name}>
      <div className="building-panel-head">
        <h2>{def.name}</h2>
        <button
          type="button"
          className="toolbar-popup-close"
          onClick={onClose}
          aria-label={`Close ${def.name}`}
        >
          ✕
        </button>
      </div>
      <p className="building-panel-blurb">{def.blurb}</p>
      <dl className="building-panel-facts">
        <dt>Footprint</dt>
        <dd>
          {placement.w} × {placement.h} tiles
        </dd>
        <dt>Kind</dt>
        <dd>{def.category}</dd>
      </dl>
      <div className="building-panel-actions">
        {armed ? (
          <>
            <span className="newgame-confirm-label">Demolish {def.name}?</span>
            <button type="button" className="newgame-btn armed" onClick={onDemolish}>
              Demolish
            </button>
            <button type="button" className="newgame-btn" onClick={() => setArmed(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="newgame-btn" onClick={() => setArmed(true)}>
            Demolish…
          </button>
        )}
      </div>
    </aside>
  );
}
