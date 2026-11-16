import { eventStandings, type RoundEvent } from './sharedround';

/** The total of a series (Sascha 01.11.2026: "the sum of all rounds"): each player's results of the rounds played added
 *  up – to par, or Stableford points – with the rounds counted. Players are the same by name. */
export interface SeriesPart {
  /** the round's place in the series, 0 = round 1 */
  k: number;
  sort: number;
  thru: number;
  finished: boolean;
  /** given up in that round – the holes missing counted as set (double bogey, net par or par) */
  retired?: boolean;
  /** given up as "No Return" – shown "NR", not counted in the total (Sascha 11.11.2026) */
  noReturn?: boolean;
}
/** `gross`: every round gross (true) or with its handicap allowance (false) – the series' prizes (Sascha 15.11.2026); left
 *  out: as each round is scored (stroke play gross, else net) */
export function seriesStandings(evs: RoundEvent[], o: { gross?: boolean; /** all rounds of the series, those to come too – who is a guest (seriesGuests); left out: the rounds given */ field?: (RoundEvent | null | undefined)[] } = {}): { higherBetter: boolean; anyNoReturn: boolean; anyGuest: boolean; rows: { name: string; sum: number; rounds: number; pos: string; parts: SeriesPart[]; noReturn: boolean; guest: boolean }[] } {
  const guests = seriesGuests(o.field ?? evs);
  const by = new Map<string, { name: string; sum: number; rounds: number; parts: SeriesPart[]; noReturn: boolean }>();
  let hb = false;
  evs.forEach((ev, k) => {
    const st = eventStandings(ev, { gross: o.gross ?? (ev.format?.scoring ?? 'net') === 'stroke' });
    hb = st.higherBetter;
    for (const r of st.rows) {
      // "No Return" (Sascha 11.11.2026): the round shown "NR", not added – he stands on the rounds he finished
      if (r.retired && r.noReturn) {
        const key = r.name.trim().toLowerCase();
        const x = by.get(key) ?? { name: r.name, sum: 0, rounds: 0, parts: [], noReturn: false };
        x.noReturn = true;
        x.parts.push({ k, sort: 0, thru: r.thru, finished: true, retired: true, noReturn: true });
        by.set(key, x);
        continue;
      }
      // given up: the holes missing filled as set – double bogey, net par or par (Sascha 12.11.2026) – he stays in the total
      const sort = r.retired && r.filled != null ? r.filled : r.sort;
      if (sort == null || !r.thru) continue;
      const key = r.name.trim().toLowerCase();
      const x = by.get(key) ?? { name: r.name, sum: 0, rounds: 0, parts: [], noReturn: false };
      x.sum += sort;
      x.rounds++;
      // what each round added (Sascha 03.11.2026: "a live leaderboard for the series too") – a running one with its holes
      x.parts.push({ k, sort, thru: r.thru, finished: r.finished, ...(r.retired ? { retired: true } : {}) });
      by.set(key, x);
    }
  });
  // one with a "No Return" after those who played every round (on fewer rounds his total is not comparable)
  const same = (a: { sum: number; noReturn: boolean }, b: { sum: number; noReturn: boolean }) => a.sum === b.sum && a.noReturn === b.noReturn;
  // a guest below them all, without a place (Sascha 16.11.2026: "Nur Tageswertung")
  const all = [...by.values()].map((x) => ({ ...x, guest: guests.has(x.name.trim().toLowerCase()) }));
  const order = (a: { sum: number; noReturn: boolean }, b: { sum: number; noReturn: boolean }) => Number(a.noReturn) - Number(b.noReturn) || (hb ? b.sum - a.sum : a.sum - b.sum);
  const ranked = all.filter((x) => !x.guest).sort(order);
  const rows = [
    ...ranked.map((x) => ({ ...x, pos: `${ranked.filter((y) => same(x, y)).length > 1 ? 'T' : ''}${ranked.findIndex((y) => same(x, y)) + 1}` })),
    ...all.filter((x) => x.guest).sort(order).map((x) => ({ ...x, pos: '–' })),
  ];
  return { higherBetter: hb, anyNoReturn: rows.some((x) => x.noReturn), anyGuest: rows.some((x) => x.guest), rows };
}

/** Guests of a series (Sascha 16.11.2026, Orlando: "Thomas und Daniel spielen morgen und übermorgen Legends mit" – "Nur
 *  Tageswertung"): in the flights of fewer than half its rounds – in each of their rounds in full, in the total below
 *  the line, without a place and without the series' prizes. `evs`: all rounds of the series, those still to come too;
 *  from three rounds on. Names lower-case. */
export function seriesGuests(evs: (RoundEvent | null | undefined)[]): Set<string> {
  const rounds = evs.filter((e): e is RoundEvent => !!e && Object.values(e.flights ?? {}).some((f) => f.players.length > 0));
  const out = new Set<string>();
  if (rounds.length < 3) return out;
  const count = new Map<string, number>();
  for (const e of rounds) {
    const names = new Set(Object.values(e.flights).flatMap((f) => f.players.map((p) => p.name.trim().toLowerCase())).filter(Boolean));
    for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  }
  for (const [n, c] of count) if (c * 2 < rounds.length) out.add(n);
  return out;
}
