import { useState } from 'react';
import { AXIS_WORDS } from '../content/league.ts';
import { fillWords } from '../content/people.ts';
import { REPORT_WORDS } from '../content/report.ts';
import { ordinal } from '../content/busLines.ts';
import type { FinalReport as Report, GameState } from '../sim/index.ts';

// THE FINAL REPORT (DD §12.2, §2.3): full-screen, in the letter style, at
// Year 50. The mark first, as a verdict; the college's composed title under
// it; then the six axes graded over the arc, the promises, the money and
// the eras. Continuing puts the run into Epilogue.

export function reportText(r: Report): string {
  const w = REPORT_WORDS;
  const lines = [
    `${r.school} — ${w.title}`,
    r.title,
    `${w.mark}: ${r.mark}`,
    '',
    w.axes,
    ...r.axes.map((a) => `  ${AXIS_WORDS[a.axis].label}: ${a.grade} (${a.first} → ${a.last})`),
    '',
    w.ambitions,
    r.kept.length + r.missed.length === 0
      ? `  ${w.ambitionsNone}`
      : `  ${fillWords(w.ambitionsLine, { kept: r.kept.length, missed: r.missed.length, declined: r.declined })}`,
    '',
    w.finances,
    ...r.finances.map((f) => `  ${f}`),
    '',
    w.chronicle,
    ...r.eras.map((e) => `  ${e}`),
  ];
  return lines.join('\n');
}

export default function FinalReport({
  state,
  onContinue,
}: {
  state: GameState;
  onContinue: () => void;
}) {
  const r = state.ending.report!;
  const w = REPORT_WORDS;
  const [copied, setCopied] = useState(false);
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label={w.title}>
      <article className="letter final-report">
        <header className="letter-head">
          <div className="letter-letterhead">{w.title}</div>
          <div className="letter-school">{r.school}</div>
          <div className="letter-date">{w.eyebrow}</div>
        </header>
        <div className="report-mark" title={w.markHint}>
          <span className="report-mark-letter">{r.mark}</span>
          <span className="report-mark-label">{w.mark}</span>
        </div>
        <h2 className="report-title">{r.title}</h2>
        {r.rank !== null && r.total !== null && (
          <p className="letter-para report-rank">
            {fillWords(w.rank, { rank: ordinal(r.rank), total: r.total })}
          </p>
        )}
        <h3 className="report-h">{w.axes}</h3>
        <ul className="report-axes">
          {r.axes.map((a) => (
            <li key={a.axis} className={`report-axis grade-${a.grade}`}>
              <span className="report-axis-grade">{a.grade}</span>
              <span className="report-axis-name">{AXIS_WORDS[a.axis].label}</span>
              <span className="report-axis-line">
                {fillWords(w.axisLine, { mean: a.mean, first: a.first, last: a.last })}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="report-h">{w.ambitions}</h3>
        <p className="letter-para">
          {r.kept.length + r.missed.length === 0
            ? w.ambitionsNone
            : fillWords(w.ambitionsLine, {
                kept: r.kept.length,
                missed: r.missed.length,
                declined: r.declined,
              })}
        </p>
        <h3 className="report-h">{w.finances}</h3>
        {r.finances.map((f, i) => (
          <p key={i} className="letter-para">
            {f}
          </p>
        ))}
        <h3 className="report-h">{w.chronicle}</h3>
        <p className="letter-para">{r.eras.join(' · ')}</p>
        <div className="letter-actions">
          <button
            type="button"
            className="species-chip"
            onClick={() => {
              void navigator.clipboard?.writeText(reportText(r)).then(() => setCopied(true));
            }}
          >
            {copied ? w.copied : w.copy}
          </button>
          <button type="button" className="beat-resolve" onClick={onContinue}>
            {w.continue}
          </button>
        </div>
      </article>
    </div>
  );
}
