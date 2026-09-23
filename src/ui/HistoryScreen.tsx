import { useState } from 'react';
import { CHRONICLE_WORDS } from '../content/chronicle.ts';
import { describeEntry } from '../content/busLines.ts';
import { leagueSchoolById } from '../content/league.ts';
import { fillWords } from '../content/people.ts';
import {
  chronicleOf,
  classLabel,
  clockFromAbsoluteWeek,
  entriesOfKind,
  formatClockShort,
  institutionName,
  type Chronicle,
  type GameState,
} from '../sim/index.ts';
import AmbitionsPanel from './AmbitionsPanel.tsx';
import JumpBar from './JumpBar.tsx';

// THE HISTORY SCREEN (DD §12.1): the chronicle in draft — the college's
// years as the historians will divide them into named eras, each with its
// buildings, its numbers and what it weathered; the rival's saga; the
// alumni who made something of it; the buildings, year by year; and the
// promises kept and broken. Exportable as text, which is what a share
// sheet is.

function sagaLines(c: Chronicle): string[] {
  const r = c.rival;
  if (!r) return [];
  const name = leagueSchoolById(r.schoolId).short;
  const w = CHRONICLE_WORDS;
  const out = [fillWords(w.sagaNamed, { rival: leagueSchoolById(r.schoolId).name, year: r.since })];
  if (r.games > 0) out.push(fillWords(w.sagaGames, { count: r.games, won: r.won, lost: r.lost }));
  if (r.years > 0)
    out.push(fillWords(w.sagaTable, { rival: name, above: r.above, years: r.years }));
  if (r.poached > 0) out.push(fillWords(w.sagaPoached, { count: r.poached, rival: name }));
  if (r.taunts > 0) out.push(fillWords(w.sagaTaunts, { rival: name, count: r.taunts }));
  return out;
}

export function chronicleText(state: GameState): string {
  const c = chronicleOf(state);
  const school = state.identity ? institutionName(state.identity) : 'The college';
  const out = [`${school}: ${CHRONICLE_WORDS.title}`, ''];
  for (const e of c.eras) out.push(e.name.toUpperCase(), e.lines.join(' '), '');
  const saga = sagaLines(c);
  if (saga.length) out.push(CHRONICLE_WORDS.rival.toUpperCase(), saga.join(' '), '');
  if (c.alumni.length) {
    out.push(CHRONICLE_WORDS.alumni.toUpperCase());
    for (const a of c.alumni)
      out.push(`${a.name}, ${classLabel(a.classYear)}${a.program ? `, ${a.program}` : ''}`);
  }
  return out.join('\n');
}

export default function HistoryScreen({ state }: { state: GameState }) {
  const c = chronicleOf(state);
  const settled = entriesOfKind(state, 'ambitionSettled');
  const w = CHRONICLE_WORDS;
  const [copied, setCopied] = useState(false);
  const years = [...new Set(c.timeline.map((t) => t.year))].sort((a, b) => a - b);
  const saga = sagaLines(c);
  return (
    <div className="history">
      <JumpBar
        label="Sections of the History screen"
        jumps={[
          { label: w.eras, id: 'history-eras' },
          { label: w.rival, id: 'history-rival' },
          { label: w.alumni, id: 'history-alumni' },
          { label: w.timeline, id: 'history-timeline' },
          { label: 'Promises', id: 'history-promises' },
        ]}
      />
      <section className="treasury-panel" id="history-eras">
        <div className="history-head">
          <h3>{w.title}</h3>
          <button
            type="button"
            className="species-chip"
            onClick={() => {
              void navigator.clipboard?.writeText(chronicleText(state)).then(() => setCopied(true));
            }}
          >
            {copied ? w.exported : w.export}
          </button>
        </div>
        <p className="treasury-note">{w.draft}</p>
        <ol className="eras">
          {c.eras.map((e) => (
            <li key={`${e.from}-${e.kind}`} className={`era era-${e.kind}`}>
              <div className="era-head">
                <span className="era-name">{e.name}</span>
                <span className="era-years">
                  {e.from === e.to ? `Year ${e.from}` : `Years ${e.from}–${e.to}`}
                </span>
              </div>
              <p className="era-body">{e.lines.slice(1).join(' ')}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="treasury-panel" id="history-rival">
        <h3>{w.rival}</h3>
        {saga.length ? (
          <p className="era-body">{saga.join(' ')}</p>
        ) : (
          <p className="treasury-note">{w.rivalNone}</p>
        )}
      </section>

      <section className="treasury-panel" id="history-alumni">
        <h3>{w.alumni}</h3>
        {c.alumni.length === 0 ? (
          <p className="treasury-note">{w.alumniNone}</p>
        ) : (
          <ul className="notable-alumni">
            {c.alumni.map((a) => (
              <li key={`${a.name}${a.classYear}`}>
                <strong>{a.name}</strong>, {classLabel(a.classYear)}
                {a.program ? ` · ${a.program}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="treasury-panel" id="history-timeline">
        <h3>{w.timeline}</h3>
        <ul className="building-timeline">
          {years.map((y) => (
            <li key={y}>
              <span className="ts">Year {y}</span>
              {c.timeline
                .filter((t) => t.year === y)
                .map((t) => `${t.building} ${w[t.what]}`)
                .join(' · ')}
            </li>
          ))}
        </ul>
      </section>

      <div id="history-promises">
        <AmbitionsPanel state={state} heading="What the college has promised" />
      </div>
      {settled.length > 0 && (
        <section className="ambitions">
          <h3>As it was recorded</h3>
          <ul className="chronicle">
            {[...settled].reverse().map((entry, i) => {
              const said = describeEntry(entry, state);
              return (
                <li key={i} className={said.tone ?? ''}>
                  <span className="ts">{formatClockShort(clockFromAbsoluteWeek(entry.week))}</span>
                  {said.text}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
