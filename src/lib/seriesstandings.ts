import { eventStandings, type RoundEvent } from './sharedround';

/** The total of a series (Sascha 01.11.2026: "the sum of all rounds"): each player's results of the rounds played added
 *  up – to par, or Stableford points – with the rounds counted. Players are the same by name. */
export interface SeriesPart {
  /** the round's place in the series, 0 = round 1 */
  k: number;
  sort: number;
  thru: number;
  finished: boolean;
}
export function seriesStandings(evs: RoundEvent[]): { higherBetter: boolean; rows: { name: string; sum: number; rounds: number; pos: string; parts: SeriesPart[] }[] } {
  const by = new Map<string, { name: string; sum: number; rounds: number; parts: SeriesPart[] }>();
  let hb = false;
  evs.forEach((ev, k) => {
    const st = eventStandings(ev, { gross: (ev.format?.scoring ?? 'net') === 'stroke' });
    hb = st.higherBetter;
    for (const r of st.rows) {
      if (r.sort == null || !r.thru) continue;
      const key = r.name.trim().toLowerCase();
      const x = by.get(key) ?? { name: r.name, sum: 0, rounds: 0, parts: [] };
      x.sum += r.sort;
      x.rounds++;
      // what each round added (Sascha 03.11.2026: "a live leaderboard for the series too") – a running one with its holes
      x.parts.push({ k, sort: r.sort, thru: r.thru, finished: r.finished });
      by.set(key, x);
    }
  });
  const rows = [...by.values()].sort((a, b) => (hb ? b.sum - a.sum : a.sum - b.sum));
  return { higherBetter: hb, rows: rows.map((x) => ({ ...x, pos: `${rows.filter((y) => y.sum === x.sum).length > 1 ? 'T' : ''}${rows.findIndex((y) => y.sum === x.sum) + 1}` })) };
}
