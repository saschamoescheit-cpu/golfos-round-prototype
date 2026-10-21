import type { Club, Round } from '../types';

// More on the tee shots (Sascha 21.10.2026, pre-final list: "more visual elements and analyses would help"): the
// fairways by the club off the tee, and what a missed fairway costs on the hole – both from the player's own par 4
// and par 5 holes with a tee result.

export interface TeeClubRow {
  club: Club;
  left: number;
  hit: number;
  right: number;
  ob: number;
  n: number;
}

export interface TeeCost {
  /** average strokes over par on the holes with the fairway hit / missed (left or right) / out of bounds */
  hit: number | null;
  missed: number | null;
  ob: number | null;
  nHit: number;
  nMissed: number;
  nOb: number;
}

export interface TeeStats {
  byClub: TeeClubRow[];
  cost: TeeCost;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function teeStats(rounds: Round[]): TeeStats {
  const rows = new Map<Club, TeeClubRow>();
  const toPar = { hit: [] as number[], missed: [] as number[], ob: [] as number[] };
  for (const r of rounds) {
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    r.holes.forEach((h, k) => {
      const e = r.entries[me.id]?.[k];
      if (!e || h.par < 4 || !e.fairway) return;
      if (e.strokes != null && !e.pickedUp) (e.fairway === 'hit' ? toPar.hit : e.fairway === 'ob' ? toPar.ob : toPar.missed).push(e.strokes - h.par);
      const club = e.detail?.shots[0]?.club;
      if (!club) return;
      const row = rows.get(club) ?? { club, left: 0, hit: 0, right: 0, ob: 0, n: 0 };
      row[e.fairway]++;
      row.n++;
      rows.set(club, row);
    });
  }
  return {
    byClub: [...rows.values()].sort((a, b) => b.n - a.n),
    cost: { hit: avg(toPar.hit), missed: avg(toPar.missed), ob: avg(toPar.ob), nHit: toPar.hit.length, nMissed: toPar.missed.length, nOb: toPar.ob.length },
  };
}
