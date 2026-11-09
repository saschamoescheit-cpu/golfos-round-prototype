import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { dayOf, duelLiveText, flipDuel, fromCards, progressOf, type Progress } from '../lib/wagers';
import { loadPools, refreshPool, type PoolEntry } from '../lib/wagerstore';
import { money } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';

// The duels (5+5+10) of today on the hole (Sascha 09.11.2026, the night run: "5+5+10 against Sascha: 1 up after 10
// holes – also when he plays in another flight"). The other one's card comes from the pool every minute; this phone's
// own goes there while playing (wagerstore reportDuelsSoon).

interface Live {
  key: string;
  vs: string;
  p: Progress | undefined;
  sym: string;
}

/** Today's accepted duels of this phone's owner, each from his side. */
export function duelsToday(pools: PoolEntry[], today = dayOf(new Date())): Live[] {
  const out: Live[] = [];
  for (const e of pools) {
    if (!e.me || e.pool.finishedAt || e.pool.deletedAt) continue;
    for (const w of e.pool.wagers) {
      if (!fromCards(w) || w.challenge?.state !== 'accepted' || (w.attempts === 'day' && w.day && w.day !== today)) continue;
      if (w.player !== e.me && w.opponent !== e.me) continue;
      const mine = w.player === e.me;
      const p = progressOf(e.pool, w);
      out.push({ key: `${e.code}|${w.id}`, vs: e.pool.players.find((x) => x.id === (mine ? w.opponent : w.player))?.name ?? '?', p: mine ? p : flip(p), sym: prizeSym(prizeOf(e.pool)) });
    }
  }
  return out;
}
const flip = (p: Progress | undefined): Progress | undefined =>
  p && { ...p, amount: -(p.amount ?? 0), duels: p.duels?.map(flipDuel) };

/** One duel in a few words: "Front 9: 1 vorn nach 6", "Front 9 verloren · Back 9: 1 vorn nach 15 · 18: 2 hinten", "+10 $" once it
 *  is over, "not started" before. */
export function duelLine(x: Pick<Live, 'p' | 'sym'>, today = dayOf(new Date())): string {
  const d = x.p?.duels?.find((y) => y.day === today) ?? x.p?.duels?.[x.p.duels.length - 1];
  if (!d) return tr('not started', 'noch nicht gestartet');
  if (d.total != null) return `${(x.p?.amount ?? 0) > 0 ? '+' : (x.p?.amount ?? 0) < 0 ? '−' : '±'}${money(Math.abs(x.p?.amount ?? 0), x.sym)}`;
  if (!d.thru) return tr('not started', 'noch nicht gestartet');
  return duelLiveText(d);
}

/** The bar on the hole – nothing without a duel today. */
export function DuelBar() {
  const [pools, setPools] = useState(loadPools);
  useEffect(() => {
    const on = () => setPools(loadPools());
    window.addEventListener('golfos:pools-changed', on);
    // the other one's card: fetched every minute while a duel runs today
    const fetchAll = () => {
      for (const e of loadPools()) if (duelsToday([e]).length) void refreshPool(e.code);
    };
    fetchAll();
    const t = window.setInterval(fetchAll, 60000);
    return () => {
      window.removeEventListener('golfos:pools-changed', on);
      window.clearInterval(t);
    };
  }, []);
  const live = duelsToday(pools);
  if (!live.length) return null;
  return (
    <div className="game-bar duel-bar" role="status" aria-label={tr('5+5+10 today', '5+5+10 heute')}>
      <span className="game-bar-head">
        <strong>5+5+10</strong>
        <span className="grow">{live.map((x) => `${tr('vs', 'gg.')} ${x.vs} ${duelLine(x)}`).join(' · ')}</span>
      </span>
    </div>
  );
}

