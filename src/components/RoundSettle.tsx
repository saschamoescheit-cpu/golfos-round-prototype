import { useEffect, useState } from 'react';
import { goPool } from '../lib/nav';
import { tr } from '../lib/i18n';
import { dayOf, roundLedger, withDuels, type WagerPool } from '../lib/wagers';
import { loadPools, type PoolEntry } from '../lib/wagerstore';
import { money } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';
import { SwipeRow } from './SwipeRow';

// "Settled after every round played" (Sascha 09.11.2026): once a round of the pool's days is over, the start page says
// what it brought – each player's money of that round, this phone's owner first. Once per pool and day; "OK" puts it
// away (the pool keeps the whole settlement). Facelift 11.11.2026 (S1): a row under "Jetzt dran" that opens the pool,
// swiped away as every row of the app.

const SEEN = 'golfos.roundsettle.seen.v1';
const seen = (): string[] => {
  try {
    const x = JSON.parse(localStorage.getItem(SEEN) ?? '[]');
    return Array.isArray(x) ? x.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
};

/** The rounds settled and not shown yet: a day of the pool up to today with money in it and nothing of it still played. */
export function roundsSettled(pools: PoolEntry[], today = dayOf(new Date()), shown: string[] = seen()): { e: PoolEntry; day: string; money: Record<string, number> }[] {
  const out: { e: PoolEntry; day: string; money: Record<string, number> }[] = [];
  for (const e of pools) {
    if (!e.me || e.pool.deletedAt) continue;
    const pool: WagerPool = withDuels(e.pool);
    const days = new Set<string>();
    for (const p of Object.values(pool.progress)) for (const r of [...(p?.perRound ?? []), ...(p?.duels ?? [])]) if (r.day <= today) days.add(r.day);
    for (const day of [...days].sort()) {
      if (shown.includes(`${e.code}|${day}`)) continue;
      // a round of that day still being played (a bet's round open, a duel without its 18): later
      const playing = Object.values(pool.progress).some((p) => p?.perRound?.some((r) => r.day === day && r.open) || p?.duels?.some((d) => d.day === day && d.total == null));
      if (playing) continue;
      const m = roundLedger(pool, day);
      if (m && Object.values(m).some((v) => v !== 0)) out.push({ e, day, money: m });
    }
  }
  return out;
}

export function RoundSettleCards(props: { /** "Jetzt dran" above it – not when the card "Jetzt dran" stands right above */ eyebrow?: boolean }) {
  const [pools, setPools] = useState(loadPools);
  const [shown, setShown] = useState(seen);
  useEffect(() => {
    const on = () => setPools(loadPools());
    window.addEventListener('golfos:pools-changed', on);
    return () => window.removeEventListener('golfos:pools-changed', on);
  }, []);
  const list = roundsSettled(pools, dayOf(new Date()), shown);
  if (!list.length) return null;
  const store = (next: string[]) => {
    setShown(next);
    try {
      localStorage.setItem(SEEN, JSON.stringify(next.slice(-200)));
    } catch {
      /* shown again next time */
    }
  };
  // swiped away: put aside, "Rückgängig" in the toast brings it back (Facelift 11.11.2026, S1 – before a "Verstanden" button)
  const hide = (key: string, label: string) => {
    store([...seen(), key]);
    window.dispatchEvent(
      new CustomEvent('golfos:deleted', { detail: { kind: 'purged', id: key, label, text: tr('Put aside', 'Ausgeblendet'), undo: () => store(seen().filter((k) => k !== key)) } }),
    );
  };
  return (
    <section className="eb-block round-settle" aria-label={tr('Round settled', 'Runde abgerechnet')}>
      {props.eyebrow !== false && <span className="eyebrow">{tr('Up now', 'Jetzt dran')}</span>}
      <ul className="list">
        {list.slice(0, 2).map(({ e, day, money: m }) => {
          const sym = prizeSym(prizeOf(e.pool));
          const rows = [...e.pool.players].filter((p) => m[p.id]).sort((a, b) => (a.id === e.me ? -1 : b.id === e.me ? 1 : (m[b.id] ?? 0) - (m[a.id] ?? 0)));
          const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(Math.abs(v), sym)}`;
          const title = `${e.pool.name} · ${tr('round', 'Runde')} ${day.slice(8, 10)}.${day.slice(5, 7)}.`;
          const mine = e.me ? m[e.me] ?? 0 : 0;
          const key = `${e.code}|${day}`;
          return (
            <li key={key}>
              {/* the row opens the pool on that round, swiped away it is put aside – as every row of the app */}
              <SwipeRow label={title} onDelete={() => hide(key, title)}>
                <button type="button" className="list-item round-settle-row" aria-label={tr(`${title} – open`, `${title} öffnen`)} onClick={() => goPool(e.code, day)}>
                  <span className="running-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z" />
                      <path d="M14 4v12" />
                    </svg>
                  </span>
                  <span className="grow">
                    <span className="title">{title}</span>
                    <span className="muted small">{rows.map((p) => `${p.id === e.me ? tr('You', 'Du') : p.name} ${sign(m[p.id] ?? 0)}`).join(' · ')}</span>
                  </span>
                  {e.me && mine !== 0 && <strong className={`running-value${mine > 0 ? ' good-text' : ''}`}>{sign(mine)}</strong>}
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
