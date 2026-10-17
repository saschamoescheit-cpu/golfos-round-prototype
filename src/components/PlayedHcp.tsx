import { useState } from 'react';
import type { Round } from '../types';
import { handicapIndex, playedHandicap, roundRating } from '../lib/handicap';
import { teeName } from '../data/tees';
import { dec, getLang, tr } from '../lib/i18n';

// The handicap played today (WHS score differential) on the scorecard of a finished 18-hole round,
// and across rounds in the stats. Course rating and slope come with the course or from the player's scorecard.

const num = (s: string) => Number(s.replace(',', '.'));
const fmt = (v: number) => dec(v.toFixed(1));

export function PlayedHcpCard(props: { round: Round; onChange: (r: Round) => void }) {
  const { round } = props;
  const rating = roundRating(round);
  const [editing, setEditing] = useState(false);
  const [cr, setCr] = useState(rating ? dec(String(rating.cr)) : '');
  const [slope, setSlope] = useState(rating ? String(rating.slope) : '');
  if (round.holes.length !== 18 || !round.finishedAt) return null;
  const p = playedHandicap(round);
  if (rating && !p) return null; // a hole without a score
  const valid = num(cr) >= 50 && num(cr) <= 85 && num(slope) >= 55 && num(slope) <= 155 && Number.isInteger(num(slope));

  return (
    <section className="card stats-card">
      <h2>{tr('Handicap played today', 'Heute gespieltes Handicap')}</h2>
      {p && !editing && (
        <>
          <div className="played-hcp">
            <span className="num">{fmt(p.differential)}</span>
            <span className="muted small">{tr('score differential (WHS)', 'Score Differential nach WHS')}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {tr(
              `${p.adjustedGross} adjusted strokes · course rating ${fmt(p.rating.cr)} · slope ${p.rating.slope}`,
              `${p.adjustedGross} bereinigte Schläge · Course Rating ${fmt(p.rating.cr)} · Slope ${p.rating.slope}`,
            )}
            {round.tee && !round.rating ? ` (${teeName(round.tee)})` : ''}.{' '}
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              {tr('Change', 'Ändern')}
            </button>
          </p>
        </>
      )}
      {(!p || editing) && (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            {tr(
              'Enter course rating and slope of your tee from the club’s scorecard – then you see the handicap you played today.',
              'Trag Course Rating und Slope deines Abschlags von der Scorekarte des Clubs ein – dann siehst du, welches Handicap du heute gespielt hast.',
            )}
          </p>
          <div className="rating-form">
            <label>
              <span className="muted small">Course Rating</span>
              <input className="input" inputMode="decimal" value={cr} placeholder={dec('72.2')} onChange={(e) => setCr(e.target.value)} />
            </label>
            <label>
              <span className="muted small">Slope</span>
              <input className="input" inputMode="numeric" value={slope} placeholder="136" onChange={(e) => setSlope(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn-secondary"
              disabled={!valid}
              onClick={() => {
                props.onChange({ ...round, rating: { cr: num(cr), slope: num(slope) } });
                setEditing(false);
              }}
            >
              {tr('Save', 'Speichern')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Stats: the handicap played in the last rounds and the index they add up to by the WHS table. */
export function PlayedHcpStats(props: { rounds: Round[] }) {
  const played = props.rounds.flatMap((r) => {
    const p = playedHandicap(r);
    return p ? [{ r, p }] : [];
  }); // newest first
  if (!played.length) return null;
  const idx = handicapIndex(played.map((x) => x.p.differential));
  const date = (r: Round) => new Date(r.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { day: 'numeric', month: 'numeric' });
  return (
    <section className="card stats-card">
      <h2>{tr('Handicap played', 'Gespieltes Handicap')}</h2>
      <div className="played-hcp">
        <span className="num">{fmt(played[0].p.differential)}</span>
        <span className="muted small">
          {tr('last round', 'letzte Runde')} · {played[0].r.courseName}
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
                <td>{r.courseName}</td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{fmt(p.differential)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
