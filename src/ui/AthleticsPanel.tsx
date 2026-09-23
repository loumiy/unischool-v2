import {
  ATHLETICS_BUDGETS,
  ATHLETICS_WORDS,
  SPORTS,
  type AthleticsBudget,
} from '../content/athletics.ts';
import { findBuilding } from '../content/buildings.ts';
import { fillWords } from '../content/people.ts';
import {
  annualAthleticsCost,
  canApply,
  formatMoney,
  lastSeason,
  type GameState,
} from '../sim/index.ts';
import RivalLine from './RivalLine.tsx';

// ATHLETICS-LITE (DD §8.5, Phase 23): the teams the college fields, what
// each needs and costs, how the last season went, and the budget they run
// on. No rosters. And the rival, head to head.
export default function AthleticsPanel({
  state,
  onVarsity,
  onBudget,
}: {
  state: GameState;
  onVarsity: (sportId: string, on: boolean) => void;
  onBudget: (budget: AthleticsBudget) => void;
}) {
  const w = ATHLETICS_WORDS;
  return (
    <section className="treasury-panel athletics" id="students-athletics">
      <h3>{w.title}</h3>
      <RivalLine state={state} />
      <div className="athletics-budget" role="group" aria-label={w.budget}>
        <span className="athletics-budget-label" title={w.budgetHint}>
          {w.budget} · {formatMoney(annualAthleticsCost(state))} /yr
        </span>
        {ATHLETICS_BUDGETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`species-chip ${state.athletics.budget === b.id ? 'active' : ''}`}
            aria-pressed={state.athletics.budget === b.id}
            title={b.note}
            onClick={() => onBudget(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <ul className="athletics-list">
        {SPORTS.map((sport) => {
          const on = state.athletics.varsity.includes(sport.id);
          const check = canApply(state, { type: 'setVarsity', sportId: sport.id, on: !on });
          const season = lastSeason(state, sport.id);
          const needs =
            sport.requires.length === 0
              ? w.noNeed
              : fillWords(w.needs, {
                  buildings: sport.requires
                    .map((id) => findBuilding(id)?.name.toLowerCase() ?? id)
                    .join(' or '),
                });
          return (
            <li key={sport.id} className={`athletics-sport ${on ? 'on' : ''}`}>
              <div className="athletics-sport-head">
                <span className="athletics-sport-name">{sport.name}</span>
                <span className="athletics-sport-season">{sport.season}</span>
              </div>
              <p className="athletics-sport-blurb">{sport.blurb}</p>
              <p className="athletics-sport-meta">
                {fillWords(w.cost, { cost: formatMoney(sport.cost) })} · {needs}
              </p>
              {season && (
                <p className={`athletics-sport-record ${season.title ? 'title' : ''}`}>
                  {season.title ? `${w.title_won} · ` : ''}
                  {fillWords(w.record, { wins: season.wins, losses: season.losses })}
                </p>
              )}
              <button
                type="button"
                className={`event-choice athletics-toggle ${on ? 'chosen' : ''}`}
                disabled={!check.ok}
                title={check.ok ? w.lifeHint : check.reason}
                onClick={() => onVarsity(sport.id, !on)}
              >
                <span className="event-choice-label">{on ? w.on : w.off}</span>
                <span className="event-choice-note">
                  {check.ok ? (on ? 'Stand the team down' : 'Field a team') : check.reason}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
