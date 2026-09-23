import { ATHLETICS_WORDS } from '../content/athletics.ts';
import { leagueSchoolById } from '../content/league.ts';
import { fillWords } from '../content/people.ts';
import { latestTable, PLAYER_ID, rankOf, type GameState } from '../sim/index.ts';

// THE RIVAL, HEAD TO HEAD (DD §11.3, Phase 23): one line wherever the
// college is measured — the board meeting, the League screen, the teams —
// saying who the rival is and where the two stand in the guide.
export default function RivalLine({ state }: { state: GameState }) {
  const id = state.athletics.rivalId;
  if (!id) return <p className="rival-line none">{ATHLETICS_WORDS.rivalNone}</p>;
  const rival = leagueSchoolById(id);
  const table = latestTable(state);
  const since = fillWords(ATHLETICS_WORDS.rivalSince, { year: state.athletics.rivalSince ?? 1 });
  let standing = '';
  if (table) {
    const gap = rankOf(table, PLAYER_ID) - rankOf(table, id);
    standing =
      gap > 0
        ? fillWords(ATHLETICS_WORDS.rivalAhead, { rival: rival.short, n: gap })
        : gap < 0
          ? fillWords(ATHLETICS_WORDS.rivalBehind, { rival: rival.short, n: -gap })
          : fillWords(ATHLETICS_WORDS.rivalLevel, { rival: rival.short });
  }
  return (
    <p className="rival-line">
      <span className="league-crest" style={{ background: rival.hue }} aria-hidden="true">
        {rival.mark}
      </span>{' '}
      {fillWords(ATHLETICS_WORDS.rivalLine, { rival: rival.name, since })} {standing}
    </p>
  );
}
