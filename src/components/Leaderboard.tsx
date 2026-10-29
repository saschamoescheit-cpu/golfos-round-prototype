import type { Round } from '../types';
import { leaderboard } from '../lib/games';
import { tr } from '../lib/i18n';
import { Avatar } from './Avatar';
import { EventBoardCard } from './ShareRound';

// Live leaderboard of the flight (Sascha 14.10.2026): everyone entered on this phone, after every hole.

export function LeaderboardCard(props: { round: Round }) {
  const b = leaderboard(props.round);
  const me = props.round.players.find((p) => p.isMe);
  return (
    <section className="card stats-card leaderboard">
      <h2>Leaderboard</h2>
      <span className="muted small">{b.title}</span>
      {b.status && <strong className="lb-status">{b.status}</strong>}
      <ol className="lb-rows">
        {b.rows.map((r) => (
          <li key={r.key}>
            <span className="lb-rank">{r.rank}</span>
            <span className="lb-name">
              <Avatar name={r.name} me={me != null && (r.key === me.id || r.name === me.name)} size={24} />
              {r.name}
            </span>
            <span className="lb-value">{r.value}</span>
            <span className="lb-thru muted small">{r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '–'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LeaderboardSheet(props: { round: Round; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label="Leaderboard" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.round.courseName}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {/* on several phones (Sascha 29.10.2026): everyone's own score live – this phone's entries of the others are
            its counts as their marker, so not its own board */}
        {props.round.shared && <EventBoardCard code={props.round.shared.code} myFlight={props.round.shared.flight} />}
        {props.round.players.length > 1 && !props.round.shared && <LeaderboardCard round={props.round} />}
      </section>
    </div>
  );
}
