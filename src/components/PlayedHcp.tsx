import type { Round } from '../types';
import { handicapIndex, playedHandicap, roundRating } from '../lib/handicap';
import { teeName } from '../data/tees';
import { dec, getLang, tr } from '../lib/i18n';
import { Block } from './Block';
import { RatingLine } from '../screens/RoundSetup';

// The handicap played today (WHS score differential) on the scorecard of a finished 18-hole round,
// and across rounds in the stats. Course rating and slope come with the course or from the player's scorecard.

const fmt = (v: number) => dec(v.toFixed(1));

/** Facelift 11.11.2026 (R12): the title small above, course rating and slope the same row as in "Neue Runde" (RatingLine),
 *  a change saved by itself – no "Ändern" link, no "Speichern" button. */
export function PlayedHcpCard(props: { round: Round; onChange: (r: Round) => void }) {
  const { round } = props;
  const rating = roundRating(round);
  if (round.holes.length !== 18 || !round.finishedAt) return null;
  const p = playedHandicap(round);
  if (rating && !p) return null; // a hole without a score

  return (
    <Block title={tr('Handicap played today', 'Heute gespieltes Handicap')} className="played-hcp-block">
      {p && (
        <section className="card stats-card">
          <div className="played-hcp">
            <span className="num">{fmt(p.differential)}</span>
            <span className="muted small">{tr('score differential (WHS)', 'Score Differential nach WHS')}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {tr(`${p.adjustedGross} adjusted strokes`, `${p.adjustedGross} bereinigte Schläge`)}
            {round.tee && !round.rating ? ` · ${teeName(round.tee)}` : ''}
          </p>
        </section>
      )}
      <RatingLine
        rating={rating}
        nine={false}
        hint={tr('From the club’s scorecard – then you see the handicap you played today', 'Von der Scorekarte des Clubs – dann siehst du, welches Handicap du heute gespielt hast')}
        onSave={(v) => props.onChange({ ...round, rating: v })}
      />
    </Block>
  );
}

/** Stats: the handicap played in the last rounds and the index they add up to by the WHS table. */
export function PlayedHcpStats(props: { rounds: Round[]; /** a round tapped: its scorecard (Sascha 10.11.2026: click paths) */ onOpen?: (r: Round) => void }) {
  const played = props.rounds.flatMap((r) => {
    const p = playedHandicap(r);
    return p ? [{ r, p }] : [];
  }); // newest first
  if (!played.length) return null;
  const idx = handicapIndex(played.map((x) => x.p.differential));
  const date = (r: Round) => new Date(r.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { day: 'numeric', month: 'numeric' });
  return (
    <Block title={tr('Handicap played', 'Gespieltes Handicap')}>
    <section className="card stats-card">
      <div className="played-hcp">
        <span className="num">{fmt(played[0].p.differential)}</span>
        <span className="muted small">
          {tr('last round', 'letzte Runde')} ·{' '}
          {props.onOpen ? (
            <button type="button" className="link-text" onClick={() => props.onOpen!(played[0].r)}>
              {played[0].r.courseName}
            </button>
          ) : (
            played[0].r.courseName
          )}
        </span>
      </div>
      {idx ? (
        <p style={{ margin: 0 }}>
          {tr('Your handicap index from these rounds: ', 'Dein Handicap-Index aus diesen Runden: ')}
          <strong>{fmt(idx.index)}</strong>
          <span className="muted small" style={{ display: 'block' }}>
            {tr(
              `WHS: best ${idx.used} of your last ${idx.of} rounds${idx.of < 20 ? ' (from 20 rounds: best 8)' : ''}. The official index comes from your federation.`,
              `WHS: beste ${idx.used} deiner letzten ${idx.of} Runden${idx.of < 20 ? ' (ab 20 Runden: beste 8)' : ''}. Der offizielle Index kommt von deinem Verband.`,
            )}
          </span>
        </p>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {tr('From 3 rounds of 18 holes the app works out your handicap index.', 'Ab 3 Runden über 18 Löcher rechnet die App deinen Handicap-Index aus.')}
        </p>
      )}
      {played.length > 1 && (
        <table className="mini-table">
          <tbody>
            {played.slice(0, 5).map(({ r, p }) => (
              <tr key={r.id}>
                <td className="muted">{date(r)}</td>
                <td>
                  {props.onOpen ? (
                    <button type="button" className="link-text" onClick={() => props.onOpen!(r)}>
                      {r.courseName}
                    </button>
                  ) : (
                    r.courseName
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{fmt(p.differential)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
    </Block>
  );
}
