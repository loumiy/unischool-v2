import { useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import { fillWords } from '../content/people.ts';
import { ACADEMIC_WORDS, schoolById } from '../content/schools.ts';
import { conditionWord, ESTATE_WORDS, providesLine } from '../content/treasury.ts';
import {
  affordableFinancing,
  ageYearsOf,
  canApply,
  canPay,
  extensionCost,
  placementCapacity,
  storeysAdded,
  demolitionCost,
  formatMoney,
  formatPercent,
  isHall,
  renovationCost,
  schoolInHall,
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
  onExtend,
  onDemolish,
}: {
  placement: Placement;
  state: GameState;
  financing: Financing;
  onClose: () => void;
  onRenovate: (financing: Financing) => void;
  onExtend: (financing: Financing) => void;
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
  const housed = schoolInHall(state, placement.id);
  const renoCost = renovationCost(placement);
  const canRenovate = open && placement.backlog > 0;
  // The chosen route if it can pay, else whichever can: the button never
  // dispatches something the sim will refuse.
  const renoPayWith = canPay(state, renoCost, financing)
    ? financing
    : affordableFinancing(state, renoCost);
  // Up instead of out (Phase 25): the financing chosen if it can pay.
  const extendPayWith = canPay(state, extensionCost(placement), financing)
    ? financing
    : (affordableFinancing(state, extensionCost(placement)) ?? financing);
  const extendCheck = canApply(state, {
    type: 'extend',
    placementId: placement.id,
    financing: extendPayWith,
  });
  const demoCost = demolitionCost(def);
  const demoPayable = canPay(state, demoCost, 'cash');
  // What the sim would say (Phase 21L): Founders Hall and a housed hall
  // are refused whatever the cash.
  const demoCheck = canApply(state, { type: 'demolish', placementId: placement.id });
  const demoRefusal = demoCheck.ok || /cash/.test(demoCheck.reason) ? null : demoCheck.reason;
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
      {placement.historic && (
        <p className="building-panel-historic" title={ESTATE_WORDS.hints.historic}>
          {fill(ESTATE_WORDS.historic, { year: placement.historicSince ?? '' })}
        </p>
      )}
      <p className="building-panel-blurb">{def.blurb}</p>
      {isHall(placement) && open && (
        <p className="building-panel-school">
          {housed
            ? fillWords(ACADEMIC_WORDS.lines.houses, { school: schoolById(housed.schoolId).name })
            : ACADEMIC_WORDS.lines.noSchool}
        </p>
      )}
      <dl className="building-panel-facts">
        <Fact label="Footprint" value={`${placement.w} × ${placement.h} tiles`} />
        <Fact
          label="Gives"
          value={providesLine({ ...def, capacity: placementCapacity(placement) })}
          hint={ESTATE_WORDS.hints.provides}
        />
        {storeysAdded(placement) > 0 && (
          <Fact
            label="Storeys"
            value={`${def.storeys + storeysAdded(placement)} (${storeysAdded(placement)} added)`}
            hint={ESTATE_WORDS.hints.extend}
          />
        )}
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
        {open && extendCheck.ok && (
          <button
            type="button"
            className="save-btn"
            title={ESTATE_WORDS.hints.extend}
            onClick={() => onExtend(extendPayWith)}
          >
            Add a storey · {formatMoney(extensionCost(placement))}
          </button>
        )}
        {armed ? (
          <>
            {placement.historic && (
              <span className="building-panel-refusal">{ESTATE_WORDS.historicWarning}</span>
            )}
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
        ) : demoRefusal ? (
          <span className="building-panel-refusal">
            {demoRefusal.charAt(0).toUpperCase() + demoRefusal.slice(1)}.
          </span>
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
