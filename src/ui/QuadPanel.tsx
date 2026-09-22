import { useState } from 'react';
import { PLACEMENT_READINGS, PLACEMENT_WORDS } from '../content/placement.ts';
import { fillWords } from '../content/people.ts';
import { formatPercent, type Quad } from '../sim/index.ts';

// A quad's card (DD §6.2): what the buildings have enclosed, how well, and
// the name — the game's until the player takes it over. A fixed corner
// card, like the building inspector, because the ground moves under pan
// and zoom and the card should not.

export default function QuadPanel({
  quad,
  onRename,
  onClose,
}: {
  quad: Quad;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  // The draft follows the quad it is editing — a different quad, or the
  // same one renamed — as a reset during render rather than an effect that
  // lags a frame (the idiom the map uses for its own prop resets).
  const [draft, setDraft] = useState(quad.name);
  const identity = `${quad.key}:${quad.name}`;
  const [prevIdentity, setPrevIdentity] = useState(identity);
  if (prevIdentity !== identity) {
    setPrevIdentity(identity);
    setDraft(quad.name);
  }
  const commit = () => {
    if (draft.trim() !== quad.name) onRename(draft);
  };
  return (
    <aside className="building-panel quad-panel" role="dialog" aria-label={quad.name}>
      <div className="building-panel-head">
        <h2>Quad</h2>
        <button
          type="button"
          className="toolbar-popup-close"
          onClick={onClose}
          aria-label="Close quad"
        >
          ✕
        </button>
      </div>
      <form
        className="quad-rename"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          value={draft}
          maxLength={48}
          aria-label="Quad name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
        <button type="submit" className="newgame-btn">
          Rename
        </button>
      </form>
      <p className="building-panel-blurb">{PLACEMENT_WORDS.renameHint}</p>
      <dl className="building-panel-facts">
        <dt>Size</dt>
        <dd>{quad.area} tiles</dd>
        <dt>Enclosed</dt>
        <dd className="figure" tabIndex={0}>
          {formatPercent(quad.enclosure, 0)}
          <span className="figure-hint" role="tooltip">
            {PLACEMENT_READINGS.enclosure}
          </span>
        </dd>
        <dt>Green</dt>
        <dd className="figure" tabIndex={0}>
          {formatPercent(quad.green, 0)}
          <span className="figure-hint" role="tooltip">
            {PLACEMENT_READINGS.green}
          </span>
        </dd>
        {/* The card used to print enclosure twice under two different
            numbers — "Enclosed 100%" and then "82% enclosed" for what is
            actually the quality. Three figures, three names (Phase 21C). */}
        <dt>Worth</dt>
        <dd className="figure" tabIndex={0}>
          {fillWords(PLACEMENT_WORDS.quadWorth, { count: formatPercent(quad.quality, 0) })}
          <span className="figure-hint" role="tooltip">
            {PLACEMENT_READINGS.quadWorth}
          </span>
        </dd>
      </dl>
    </aside>
  );
}
