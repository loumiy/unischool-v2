import { ordinal } from '../content/busLines.ts';
import { tagById } from '../content/identityTags.ts';
import {
  AXES,
  AXIS_WORDS,
  LEAGUE_WORDS,
  leagueSchoolById,
  methodologyById,
} from '../content/league.ts';
import { fillWords } from '../content/people.ts';
import {
  axisReadings,
  collegePrestige,
  institutionName,
  latestTable,
  PLAYER_ID,
  previousTable,
  rankOf,
  type GameState,
} from '../sim/index.ts';
import Figure from './Figure.tsx';
import RivalLine from './RivalLine.tsx';

// THE LEAGUE SCREEN (DD §11.3): the guide's table, the college's place in
// it, the six standings it is ranked on, and the methodology currently in
// force — which the guide changes, now and then, to everyone's outrage.

function Movement({ now, before }: { now: number; before: number | null }) {
  const w = LEAGUE_WORDS.moved;
  if (before === null) return <span className="league-move new">{w.new}</span>;
  const d = before - now;
  if (d === 0) return <span className="league-move same">–</span>;
  return (
    <span
      className={`league-move ${d > 0 ? 'up' : 'down'}`}
      title={fillWords(d > 0 ? w.up : w.down, { n: Math.abs(d) })}
    >
      {d > 0 ? '▲' : '▼'}
      {Math.abs(d)}
    </span>
  );
}

export default function LeagueScreen({ state }: { state: GameState }) {
  const table = latestTable(state);
  const before = previousTable(state);
  const method = methodologyById(state.league.methodologyId);
  const reading = axisReadings(state);
  const you = state.identity ? institutionName(state.identity) : LEAGUE_WORDS.you;
  const rank = table ? rankOf(table) : null;
  const beforeRank = before ? rankOf(before) : null;
  return (
    <div className="league">
      <div className="figure-row">
        <Figure
          label="Rank"
          value={rank === null ? '—' : `${ordinal(rank)} of ${table!.rows.length}`}
          hint={LEAGUE_WORDS.rankHint}
          size="lg"
          tone={rank !== null && beforeRank !== null && rank < beforeRank ? 'good' : undefined}
        />
        <Figure
          label="Score"
          value={table ? (table.rows.find((r) => r.id === PLAYER_ID)?.score ?? 0).toFixed(1) : '—'}
          hint={LEAGUE_WORDS.scoreHint}
        />
        <Figure
          label="Prestige"
          value={collegePrestige(state).toFixed(0)}
          hint={LEAGUE_WORDS.prestigeHint}
        />
        <Figure label={LEAGUE_WORDS.methodology} value={method.name} hint={method.line} />
      </div>

      <section className="treasury-panel">
        <h3>Where {you} stands</h3>
        <table className="budget-table league-axes">
          <thead>
            <tr>
              <th>Axis</th>
              <th>Standing</th>
              <th>This year</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {AXES.map((a) => {
              const standing = state.prestige.axes[a];
              return (
                <tr key={a}>
                  <th>{AXIS_WORDS[a].label}</th>
                  <td className="figure league-bar-cell" tabIndex={0}>
                    <span className="league-bar-row">
                      <span className="league-bar">
                        <span
                          className="league-bar-fill"
                          style={{ width: `${Math.max(0, Math.min(100, standing))}%` }}
                        />
                      </span>
                      <span className="league-bar-value">{standing.toFixed(0)}</span>
                    </span>
                    <span className="figure-hint" role="tooltip">
                      {AXIS_WORDS[a].hint}{' '}
                      {fillWords(LEAGUE_WORDS.axisHint, {
                        axis: AXIS_WORDS[a].label.toLowerCase(),
                      })}
                    </span>
                  </td>
                  <td
                    className={
                      reading[a] > standing + 1 ? 'good' : reading[a] < standing - 1 ? 'bad' : ''
                    }
                  >
                    {reading[a].toFixed(0)}
                  </td>
                  <td>{Math.round(method.weights[a] * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="treasury-note">
          {state.league.methodologySince > 1
            ? fillWords(LEAGUE_WORDS.changedIn, {
                year: state.league.methodologySince,
                line: method.line,
              })
            : fillWords(LEAGUE_WORDS.since, { year: state.league.methodologySince })}
        </p>
      </section>

      <section className="treasury-panel">
        <h3>{LEAGUE_WORDS.title}</h3>
        <RivalLine state={state} />
        {!table ? (
          <p className="treasury-note">{LEAGUE_WORDS.notYet}</p>
        ) : (
          <table className="budget-table league-table">
            <thead>
              <tr>
                <th>#</th>
                <th />
                <th>College</th>
                <th>Known as</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => {
                const mine = row.id === PLAYER_ID;
                const def = mine ? null : leagueSchoolById(row.id);
                const was = before ? rankOf(before, row.id) : null;
                return (
                  <tr
                    key={row.id}
                    className={
                      mine ? 'league-you' : row.id === state.athletics.rivalId ? 'league-rival' : ''
                    }
                  >
                    <td className="league-rank">
                      {i + 1} <Movement now={i + 1} before={was} />
                    </td>
                    <td>
                      <span
                        className="league-crest"
                        style={{ background: def?.hue ?? 'var(--school-primary)' }}
                        aria-hidden="true"
                      >
                        {def?.mark ?? you.charAt(0)}
                      </span>
                    </td>
                    <th>
                      {mine ? you : def!.name}
                      {row.id === state.athletics.rivalId && (
                        <span className="league-near rival">the rival</span>
                      )}
                      {def?.region === 'near' && row.id !== state.athletics.rivalId && (
                        <span className="league-near">{LEAGUE_WORDS.region.near}</span>
                      )}
                    </th>
                    <td className="league-tag">{def ? tagById(def.tag).name : ''}</td>
                    <td>{row.score.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
