import { PLACEMENT_READINGS, PLACEMENT_WORDS } from '../content/placement.ts';
import { fillWords } from '../content/people.ts';
import {
  beautyTerms,
  detectQuads,
  formatPercent,
  pairingResults,
  placementPoolEffect,
  placementSatisfaction,
  type GameState,
} from '../sim/index.ts';
import Figure from './Figure.tsx';

// WHAT THE LAYOUT IS WORTH (DD §6.2, guardrail §17.2), with its arithmetic
// on the page: every term that placement contributes, the sum, and the cap
// that clamps it. The cap is the point — a player must be able to see that
// arranging buildings well is worth something and that ignoring it costs
// little — so the panel shows the raw total and the capped one side by
// side rather than quietly applying the smaller number.

const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function PlacementPanel({ state }: { state: GameState }) {
  const sat = placementSatisfaction(state);
  const pool = placementPoolEffect(state);
  const beauty = beautyTerms(state);
  const quads = detectQuads(state.campus);
  const pairs = pairingResults(state);
  return (
    <section className="treasury-panel placement-panel" id="students-layout">
      <h3>What the layout is worth</h3>
      <div className="figure-row inner">
        <Figure
          label="Campus beauty"
          value={beauty.score.toFixed(0)}
          note={`greenery ${formatPercent(beauty.greenery, 0)} · landmarks ${formatPercent(
            beauty.landmarks,
            0,
          )} · upkeep ${formatPercent(beauty.upkeep, 0)} · quads ${formatPercent(
            beauty.enclosure,
            0,
          )}`}
          hint={PLACEMENT_READINGS.beautySwing}
        />
        <Figure
          label="Quads"
          value={String(quads.length)}
          note={quads.length === 0 ? undefined : quads.map((q) => q.name).join(' · ')}
          hint={PLACEMENT_READINGS.quads}
        />
        <Figure
          label="Applicants"
          value={`${signed(pool.applied * 100)}%`}
          hint={PLACEMENT_READINGS.placement}
          tone={pool.applied > 0 ? 'good' : pool.applied < 0 ? 'bad' : undefined}
        />
      </div>
      <table className="budget-table satisfaction-table placement-table">
        <tbody>
          {sat.terms.map((t) => (
            <tr key={t.id} className={t.value < 0 ? 'bad' : t.value > 0 ? 'good' : ''}>
              <th>{t.label}</th>
              <td className="figure" tabIndex={0}>
                {signed(t.value)}
                <span className="figure-hint" role="tooltip">
                  {t.line}
                </span>
              </td>
            </tr>
          ))}
          <tr className="satisfaction-total">
            <th>Satisfaction</th>
            <td className="figure" tabIndex={0}>
              {signed(sat.applied)}
              <span className="figure-hint" role="tooltip">
                {PLACEMENT_READINGS.cap}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className={`treasury-note ${sat.capped ? 'bad' : ''}`}>
        {sat.capped
          ? fillWords(PLACEMENT_WORDS.capped, {
              raw: signed(sat.raw),
              applied: signed(sat.applied),
            })
          : PLACEMENT_WORDS.uncapped}
      </p>
      <table className="budget-table placement-pairings">
        <tbody>
          {pairs.map((r) => (
            <tr
              key={r.def.id}
              className={r.total === 0 ? 'muted' : r.paired < r.total ? 'bad' : ''}
            >
              <th>{r.def.label}</th>
              <td>
                {r.total === 0
                  ? '—'
                  : fillWords(PLACEMENT_WORDS.pairingShare, {
                      paired: r.paired,
                      total: r.total,
                    })}
              </td>
              <td className="figure" tabIndex={0}>
                {r.total === 0 ? '' : signed(r.points)}
                <span className="figure-hint" role="tooltip">
                  {r.def.line}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {quads.length === 0 && <p className="treasury-note">{PLACEMENT_WORDS.noQuads}</p>}
    </section>
  );
}
