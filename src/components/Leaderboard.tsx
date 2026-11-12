import type { Round } from '../types';
import { leaderboard } from '../lib/games';
import { tr } from '../lib/i18n';
import { Avatar } from './Avatar';
import { EventBoardCard } from './ShareRound';
import { useEffect, useState } from 'react';
import { duelPoolsOn, refreshPool, reportWagers, type PoolEntry } from '../lib/wagerstore';
import { dayOf, withDuels } from '../lib/wagers';
import { Standings } from '../screens/Wagers';
import { StandingCard } from '../screens/Games';
import { sideGamesOf, sideGameView } from '../lib/sidegames';

// Live leaderboard of the flight (Sascha 14.10.2026): everyone entered on this phone, after every hole.

export function LeaderboardCard(props: { round: Round }) {
  const b = leaderboard(props.round);
  const me = props.round.players.find((p) => p.isMe);
  // the eyebrow above the card, not a heading inside it (Facelift-Abnahme O6)
  return (
    <>
    <span className="eyebrow">Leaderboard</span>
    <section className="card stats-card leaderboard">
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
    </>
  );
}

/** The pools of bets of a round's day with bets in them – the "Wetten" tab of its leaderboard. */
const poolsOfDay = (day: string): PoolEntry[] => duelPoolsOn(day).filter((e) => e.pool.wagers.length > 0);

export function LeaderboardSheet(props: { round: Round; onClose: () => void; /** opened on this tab – the 5+5+10 bar tapped: the bets (Sascha 10.11.2026) */ tab?: 'board' | 'bets' }) {
  // the bets of the day beside the leaderboard (Sascha 10.11.2026: "a side bet – in the live leaderboard on the round the
  // overview of the bets too"): a tab "Wetten" when a pool of the day has bets
  const day = dayOf(props.round.createdAt);
  const [pools, setPools] = useState(() => poolsOfDay(day));
  // the side games of this round (Skins, Nassau … – judged from its strokes)
  const [sides, setSides] = useState(() => sideGamesOf(props.round.id));
  useEffect(() => {
    const on = () => setSides(sideGamesOf(props.round.id));
    window.addEventListener('golfos:sidegames-changed', on);
    return () => window.removeEventListener('golfos:sidegames-changed', on);
  }, [props.round.id]);
  const [tab, setTab] = useState<'board' | 'bets'>(props.tab ?? 'board');
  const anyBets = pools.length > 0 || sides.length > 0;
  useEffect(() => {
    if (tab !== 'bets') return;
    let alive = true;
    // the own bets judged, then the pools as the server has them – at once and every 30 s while shown
    const tick = () =>
      void reportWagers()
        .then(() => Promise.all(poolsOfDay(day).map((e) => refreshPool(e.code))))
        .then(() => alive && setPools(poolsOfDay(day)));
    tick();
    const t = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [tab, day]);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label="Leaderboard" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.round.courseName}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {anyBets && (
          <div className="chip-set board-tabs" role="group" aria-label={tr('Show', 'Anzeigen')}>
            <button type="button" className={`chip${tab === 'board' ? ' on' : ''}`} aria-pressed={tab === 'board'} onClick={() => setTab('board')}>
              {tr('Leaderboard', 'Leaderboard')}
            </button>
            <button type="button" className={`chip${tab === 'bets' ? ' on' : ''}`} aria-pressed={tab === 'bets'} onClick={() => setTab('bets')}>
              {tr('Bets', 'Wetten')}
            </button>
          </div>
        )}
        {tab === 'bets' && anyBets ? (
          <>
            {sides.map((s) => {
              const g = sideGameView(s, props.round);
              return (
                <div key={s.id} className="board-pool">
                  <span className="eyebrow">{`${tr('Side bet', 'Side-Bet')} · ${g.players.map((p) => p.name).join(', ')}`}</span>
                  <StandingCard game={g} />
                </div>
              );
            })}
            {pools.map((e) => (
              <div key={e.code} className="board-pool">
                {pools.length > 1 && <span className="eyebrow">{e.pool.name}</span>}
                <Standings pool={withDuels(e.pool)} today={day} me={e.me} round={{ day, course: props.round.courseName }} />
              </div>
            ))}
          </>
        ) : (
          <>
            {/* on several phones (Sascha 29.10.2026): everyone's own score live – this phone's entries of the others
                are its counts as their marker, so not its own board */}
            {props.round.shared && <EventBoardCard code={props.round.shared.code} myFlight={props.round.shared.flight} />}
            {props.round.players.length > 1 && !props.round.shared && <LeaderboardCard round={props.round} />}
          </>
        )}
      </section>
    </div>
  );
}
