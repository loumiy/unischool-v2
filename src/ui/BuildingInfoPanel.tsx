import { useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import { conditionWord, ESTATE_WORDS } from '../content/treasury.ts';
import {
  affordableFinancing,
  ageYearsOf,
  canPay,
  demolitionCost,
  formatMoney,
  formatPercent,
  renovationCost,
  upkeepOf,
  type Financing,
  type GameState,
  type Placement,
} from '../sim/index.ts';

// The card for a placed building: what it is, where it is in its life, what
// it costs to keep, what the backlog has done to it, and the two things you
// can do about it — renovate and demolish — each with its price. A fixed
// corner card, not a popover: the building moves under pan and zoom and the
// card should not. Every number carries its sentence (the one-tooltip rule).

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, k: string) =>
    k in vars ? String(vars[k]) : whole,
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={hint ? 'figure' : ''} tabIndex={hint ? 0 : undefined}>
        {value}
        {hint && (
          <span className="figure-hint" role="tooltip">
            {hint}
          </span>
        )}
      </dd>
    </>
  );
}

export default function BuildingInfoPanel({
  placement,
  state,
  financing,
  onClose,
  onRenovate,
  onDemolish,
}: {
  placement: Placement;
  state: GameState;
  financing: Financing;
  onClose: () => void;
  onRenovate: (financing: Financing) => void;
  onDemolish: () => void;
}) {
  const def = buildingById(placement.buildingId);
  const [armed, setArmed] = useState(false);
  const week = state.clock.absoluteWeek;
  const weeksLeft = placement.completesWeek === null ? 0 : placement.completesWeek - week;
  const openedYear =
    placement.openedWeek === null ? null : Math.floor(placement.openedWeek / 36) + 1;
  const status = fill(ESTATE_WORDS.status[placement.status], {
    weeks: weeksLeft,
    year: openedYear ?? '',
  });
  const open = placement.status === 'open';
  const renoCost = renovationCost(placement);
  const canRenovate = open && placement.backlog > 0;
  // The chosen route if it can pay, else whichever can: the button never
  // dispatches something the sim will refuse.
  const renoPayWith = canPay(state, renoCost, financing)
    ? financing
    : affordableFinancing(state, renoCost);
  const demoCost = demolitionCost(def);
  const demoPayable = canPay(state, demoCost, 'cash');
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
      <p className={`building-panel-status ${placement.status}`}>{status}</p>
      <p className="building-panel-blurb">{def.blurb}</p>
      <dl className="building-panel-facts">
        <Fact label="Footprint" value={`${placement.w} × ${placement.h} tiles`} />
        {open && (
          <>
            <Fact label="Age" value={`${Math.floor(ageYearsOf(placement, week))} years`} />
            <Fact
              label="Upkeep"
              value={`${formatMoney(upkeepOf(placement, week))} /yr`}
              hint={ESTATE_WORDS.hints.upkeep}
            />
            <Fact
              label="Condition"
              value={`${conditionWord(placement.condition)} · ${formatPercent(placement.condition, 0)}`}
              hint={ESTATE_WORDS.hints.condition}
            />
            <Fact
              label="Backlog"
              value={formatMoney(placement.backlog)}
              hint={ESTATE_WORDS.hints.backlog}
            />
          </>
        )}
        {!open && (
          <Fact label="Build cost" value={formatMoney(def.cost)} hint={ESTATE_WORDS.hints.cost} />
        )}
      </dl>
      <div className="building-panel-actions">
        {canRenovate && (
          <button
            type="button"
            className="save-btn"
            disabled={renoPayWith === null}
            title={ESTATE_WORDS.hints.renovate}
            onClick={() => {
              if (renoPayWith) onRenovate(renoPayWith);
            }}
          >
            Renovate · {formatMoney(renoCost)}
          </button>
        )}
        {armed ? (
          <>
            <span className="newgame-confirm-label">Demolish {def.name}?</span>
            <button
              type="button"
              className="newgame-btn armed"
              disabled={!demoPayable}
              onClick={onDemolish}
            >
              Demolish · {formatMoney(demoCost)}
            </button>
            <button type="button" className="newgame-btn" onClick={() => setArmed(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            className="newgame-btn"
            title={ESTATE_WORDS.hints.demolish}
            onClick={() => setArmed(true)}
          >
            Demolish…
          </button>
        )}
      </div>
    </aside>
  );
}
