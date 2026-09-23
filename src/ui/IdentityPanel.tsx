import { TAG_WORDS, tagById } from '../content/identityTags.ts';
import { fillWords } from '../content/people.ts';
import { formatPercent, type GameState } from '../sim/index.ts';
import type { TagId } from '../content/identityTags.ts';

// WHAT THE GUIDEBOOKS SAY (DD §11.2, Phase 24): the tags the college holds,
// why, and what each does to who applies; and the ones it is becoming or
// losing, a year from settling.
export default function IdentityPanel({ state }: { state: GameState }) {
  const p = state.perception;
  const names = (ids: string[]) => ids.map((id) => tagById(id as TagId).name).join(', ');
  const becoming = Object.keys(p.earning);
  const fading = Object.keys(p.shedding);
  return (
    <section className="treasury-panel identity-panel" id="league-identity">
      <h3 title={TAG_WORDS.hint}>{TAG_WORDS.title}</h3>
      {p.tags.length === 0 ? (
        <p className="treasury-note">{TAG_WORDS.none}</p>
      ) : (
        <ul className="identity-tags">
          {p.tags.map((id) => {
            const t = tagById(id);
            const size = `${t.size >= 0 ? '+' : ''}${formatPercent(t.size, 0)}`;
            const quality = `${t.quality >= 0 ? '+' : ''}${t.quality}`;
            return (
              <li key={id} className="identity-tag">
                <span className="identity-tag-name">{t.name}</span>
                <span className="identity-tag-blurb">{t.blurb}</span>
                <span className="identity-tag-why">{t.why}</span>
                <span className="identity-tag-pool">
                  {fillWords(TAG_WORDS.pool, { size, quality })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {becoming.length > 0 && (
        <p className="treasury-note">{fillWords(TAG_WORDS.earning, { tags: names(becoming) })}</p>
      )}
      {fading.length > 0 && (
        <p className="treasury-note">{fillWords(TAG_WORDS.shedding, { tags: names(fading) })}</p>
      )}
    </section>
  );
}
