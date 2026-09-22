import { CAMPAIGN_WORDS, campaignById } from '../content/campaigns.ts';
import {
  advancementAppointed,
  classLabel,
  formatMoney,
  launchable,
  respondingClasses,
  yearlyResponse,
  type GameState,
} from '../sim/index.ts';
import Figure from './Figure.tsx';

// ADVANCEMENT (DD §9.3): the ledger's payoff surface. A campaign is shown
// with the thing that makes it a campaign rather than a button — WHICH
// classes are answering it, in their own words, loudest first.

export default function CampaignPanel({
  state,
  onLaunch,
}: {
  state: GameState;
  onLaunch: (campaignId: string) => void;
}) {
  const running = state.advancement.running;
  const offers = launchable(state);
  const restricted = state.advancement.restricted;
  const held = restricted.building + restricted.aid;
  return (
    <section className="campaigns">
      <h3>Advancement</h3>
      {!advancementAppointed(state) ? (
        <p className="campaign-note">{CAMPAIGN_WORDS.needsVp}</p>
      ) : running ? (
        <RunningCampaign state={state} />
      ) : (
        <>
          {offers.length === 0 && <p className="campaign-note">{CAMPAIGN_WORDS.none}</p>}
          <ul className="campaign-list">
            {offers.map((def) => (
              <li key={def.id} className="campaign">
                <div className="campaign-head">
                  <span className="campaign-title">{def.title}</span>
                  <span className="campaign-target">
                    {formatMoney(def.target)} · {def.years} years
                  </span>
                </div>
                <p className="campaign-text">{def.text}</p>
                <p className="campaign-note">
                  The ledger would give about {formatMoney(yearlyResponse(state, def))} a year.{' '}
                  {CAMPAIGN_WORDS.askNote}
                </p>
                <button type="button" className="event-choice" onClick={() => onLaunch(def.id)}>
                  <span className="event-choice-label">Launch the campaign</span>
                  <span className="event-choice-note">
                    {formatMoney(def.target)} over {def.years} years
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {held > 0 && (
        <div className="figure-row">
          <Figure
            label="For building"
            value={formatMoney(restricted.building)}
            hint={CAMPAIGN_WORDS.restrictedNote}
          />
          <Figure
            label="For aid"
            value={formatMoney(restricted.aid)}
            hint={CAMPAIGN_WORDS.restrictedNote}
          />
        </div>
      )}
    </section>
  );
}

function RunningCampaign({ state }: { state: GameState }) {
  const running = state.advancement.running!;
  const def = campaignById(running.campaignId);
  const left = running.dueYear - state.clock.year;
  const pct = Math.min(100, Math.round((running.raised / def.target) * 100));
  const answering = respondingClasses(state, def).slice(0, 6);
  return (
    <div className="campaign running">
      <div className="campaign-head">
        <span className="campaign-title">{def.title}</span>
        <span className={`campaign-target ${left <= 1 ? 'soon' : ''}`}>
          {left <= 0 ? 'closing now' : left === 1 ? 'closing this year' : `${left} years to go`}
        </span>
      </div>
      <div className="campaign-bar" role="img" aria-label={`${pct}% of the target`}>
        <span className="campaign-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="campaign-note">
        {formatMoney(running.raised)} of {formatMoney(def.target)} — {pct}%
      </p>
      {/* The point of the whole arrangement: which four years are paying
          for this, and how much the case for support is about them. */}
      <h4 className="campaign-sub">Who is answering</h4>
      <p className="campaign-note">{CAMPAIGN_WORDS.resonance}</p>
      <ul className="campaign-answers">
        {answering.map((row) => (
          <li key={row.alumni.classYear} className={row.resonance > 1 ? 'resonant' : ''}>
            <span className="campaign-class">{classLabel(row.alumni.classYear)}</span>
            <span className="campaign-gives">{formatMoney(row.gives)} /yr</span>
            <span className="campaign-why">
              {row.resonance > 1 ? 'this is about them' : 'giving anyway'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
