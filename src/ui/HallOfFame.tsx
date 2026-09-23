import { useEffect, useState } from 'react';
import { AXIS_WORDS, type AxisId } from '../content/league.ts';
import { readHall, type HallEntry } from './persistence.ts';

// THE HALL OF FAME (DD §12.3, Phase 28): every run that reached Year 50,
// with its portrait, colours, title, mark and grades, and its chronicle to
// read again. The reason to play again; the cosmetics it unlocks are the
// souvenir.

export function Portrait({ entry }: { entry: HallEntry }) {
  return (
    <div
      className={`hall-portrait ${entry.season}`}
      // The campus the player built, as the map drew it at Year 50.
      dangerouslySetInnerHTML={{ __html: entry.portrait }}
    />
  );
}

export default function HallOfFame({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<HallEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void readHall().then(setEntries);
  }, []);
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label="Hall of fame">
      <article className="letter hall">
        <header className="letter-head">
          <div className="letter-letterhead">The Hall of Fame</div>
          <button
            type="button"
            className="toolbar-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        {entries === null ? (
          <p className="letter-para">…</p>
        ) : entries.length === 0 ? (
          <p className="letter-para">
            No college has reached its fiftieth year yet. The first one to finish hangs here, with a
            portrait of its campus.
          </p>
        ) : (
          <ul className="hall-list hall-wall">
            {entries.map((e) => (
              <li
                key={e.id}
                className="hall-entry hall-frame"
                style={
                  {
                    '--frame': e.colors.primary,
                    '--mat': e.colors.secondary,
                  } as React.CSSProperties
                }
              >
                {/* A frame in the college's colours, and a brass plaque
                    (Phase 49). */}
                <div className="hall-frame-border">
                  <Portrait entry={e} />
                </div>
                <div className="hall-plaque">
                  <span className="hall-plaque-name">{e.school}</span>
                  <span className="hall-plaque-mark">{e.mark}</span>
                  <span className="hall-plaque-years">
                    Years 1–50 · finished {new Date(e.finishedAt).getFullYear()}
                  </span>
                </div>
                <div className="hall-body">
                  <div className="hall-head">
                    <span
                      className="hall-colors"
                      style={{
                        background: `linear-gradient(90deg, ${e.colors.primary} 50%, ${e.colors.secondary} 50%)`,
                      }}
                    />
                    <span className="hall-school">{e.school}</span>
                    <span className="hall-mark">{e.mark}</span>
                  </div>
                  <p className="hall-title">{e.title}</p>
                  <p className="hall-grades">
                    {e.grades
                      .map((g) => `${AXIS_WORDS[g.axis as AxisId]?.label ?? g.axis} ${g.grade}`)
                      .join(' · ')}
                  </p>
                  <p className="hall-eras">{e.eras.join(' · ')}</p>
                  <button
                    type="button"
                    className="species-chip"
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                  >
                    {open === e.id ? 'Close the chronicle' : 'Read the chronicle'}
                  </button>
                  {open === e.id && <pre className="hall-chronicle">{e.chronicle}</pre>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
