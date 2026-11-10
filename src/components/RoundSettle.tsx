import { useEffect, useState } from 'react';
import { goPool } from '../lib/nav';
import { tr } from '../lib/i18n';
import { dayOf, roundLedger, withDuels, type WagerPool } from '../lib/wagers';
import { loadPools, type PoolEntry } from '../lib/wagerstore';
import { money } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';

// "Settled after every round played" (Sascha 09.11.2026): once a round of the pool's days is over, the start page says
// what it brought – each player's money of that round, this phone's owner first. Once per pool and day; "OK" puts it
// away (the pool keeps the whole settlement).

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

export function RoundSettleCards() {
  const [pools, setPools] = useState(loadPools);
  const [shown, setShown] = useState(seen);
  useEffect(() => {
    const on = () => setPools(loadPools());
    window.addEventListener('golfos:pools-changed', on);
    return () => window.removeEventListener('golfos:pools-changed', on);
  }, []);
  const list = roundsSettled(pools, dayOf(new Date()), shown);
  if (!list.length) return null;
  const ok = (key: string) => {
    const next = [...shown, key];
    setShown(next);
    try {
      localStorage.setItem(SEEN, JSON.stringify(next.slice(-200)));
    } catch {
      /* shown again next time */
    }
  };
  return (
    <>
      {list.slice(0, 2).map(({ e, day, money: m }) => {
        const sym = prizeSym(prizeOf(e.pool));
        const rows = [...e.pool.players].filter((p) => m[p.id]).sort((a, b) => (a.id === e.me ? -1 : b.id === e.me ? 1 : (m[b.id] ?? 0) - (m[a.id] ?? 0)));
        const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(Math.abs(v), sym)}`;
        return (
          <section key={`${e.code}|${day}`} className="card round-settle" aria-label={tr('Round settled', 'Runde abgerechnet')}>
            <button type="button" className="eyebrow link-eyebrow" aria-label={tr(`Open ${e.pool.name}`, `${e.pool.name} öffnen`)} onClick={() => goPool(e.code, day)}>
              {`${e.pool.name} · ${tr('round', 'Runde')} ${day.slice(8, 10)}.${day.slice(5, 7)}.`} ›
            </button>
            <div className="round-settle-rows">
              {rows.map((p) => (
                <span key={p.id} className="round-settle-row">
                  <span className="grow">{p.id === e.me ? tr('You', 'Du') : p.name}</span>
                  <span className={`badge ${(m[p.id] ?? 0) > 0 ? 'ok' : 'bad'}`}>{sign(m[p.id] ?? 0)}</span>
                </span>
              ))}
            </div>
            <button type="button" className="btn-secondary" onClick={() => ok(`${e.code}|${day}`)}>
              {tr('OK', 'Verstanden')}
            </button>
          </section>
        );
      })}
    </>
  );
}
