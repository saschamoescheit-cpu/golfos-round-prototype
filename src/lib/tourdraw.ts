// The draw of a tournament round (Sascha 04.11.2026: "not only 'share out' – a random draw, by handicap up or down, and
// at the final day by result: the worst first, the best in the last flight – as at the club championship"): who plays in
// which flight, how many to a flight, and the tee times – from a first time on, one interval apart, from tee 1 or from
// tees 1 and 10 at once.

export type DrawMode = 'manual' | 'random' | 'hcpAsc' | 'hcpDesc' | 'result';

export interface TourDraw {
  mode: DrawMode;
  /** players to a flight, 2 to 4 */
  size: number;
  /** the first tee time, "HH:MM" */
  first: string;
  /** minutes between two tee times */
  gap: number;
  /** from tees 1 and 10 at once – two flights on each time */
  twoTees: boolean;
  /** "by result": when the host dealt it after the rounds before – until then the flights are provisional */
  dealtAt?: string;
}

export const DRAW_MODES: DrawMode[] = ['manual', 'random', 'hcpAsc', 'hcpDesc', 'result'];
export const FLIGHT_SIZES = [2, 3, 4];
export const GAPS = [6, 7, 8, 9, 10, 11, 12, 15];
export const defaultDraw = (): TourDraw => ({ mode: 'hcpDesc', size: 4, first: '09:00', gap: 8, twoTees: false });

export const addMinutes = (t: string, min: number): string => {
  const [h, m] = t.split(':').map(Number);
  const x = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min));
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** n players in flights of `size` at most: as many flights as needed, the players spread as evenly as can be (10 to
 *  fours: 4, 3, 3) – never one alone: then one flight above the size (5 in twos: 3, 2). */
export function flightSizes(n: number, size: number): number[] {
  if (n <= 0) return [];
  const s = Math.max(2, Math.min(4, Math.round(size)));
  let k = Math.max(1, Math.ceil(n / s));
  if (n >= 2 && Math.floor(n / k) < 2) k = Math.floor(n / 2);
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/** The tee time and the tee of each of `k` flights: one after the other from tee 1 – or two on each time, tee 1 and
 *  tee 10 (start 0 and 9: the hole a flight begins on). */
export function teeSlots(k: number, first: string, gap: number, twoTees: boolean): { time: string; start: number }[] {
  return Array.from({ length: k }, (_, i) => (twoTees ? { time: addMinutes(first, Math.floor(i / 2) * gap), start: i % 2 ? 9 : 0 } : { time: addMinutes(first, i * gap), start: 0 }));
}

export interface DrawPlayer {
  id: string;
  /** the handicap index – null: none known (counted as the highest) */
  hcp: number | null;
}

/** Each player's standing from the rounds before (a sum – to par or points); missing: no result yet. */
export type Results = Record<string, number>;

/** A random order that can be repeated (a seed) – the same draw on every phone that works it out again. */
export function shuffled<T>(xs: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const hcpOf = (p: DrawPlayer) => p.hcp ?? 99;

/** The order the players go out in, the first flight first:
 *  - by handicap up: the lowest handicap first; down: the highest first (the best out last);
 *  - by result: the worst first, the best in the last flight – a tie: the higher handicap earlier; without a result
 *    (did not play): out first;
 *  - random: shuffled with the seed; manual: as they are. */
export function drawOrder(mode: DrawMode, players: DrawPlayer[], o: { results?: Results; higherBetter?: boolean; seed?: number } = {}): string[] {
  const ps = [...players];
  if (mode === 'hcpAsc') ps.sort((a, b) => hcpOf(a) - hcpOf(b));
  else if (mode === 'hcpDesc') ps.sort((a, b) => hcpOf(b) - hcpOf(a));
  else if (mode === 'random') return shuffled(ps, o.seed ?? Date.now()).map((p) => p.id);
  else if (mode === 'result') {
    const r = o.results ?? {};
    // worse: more strokes to par, fewer points
    const worse = (v: number) => (o.higherBetter ? -v : v);
    ps.sort((a, b) => {
      const ra = r[a.id];
      const rb = r[b.id];
      if (ra == null || rb == null) return ra == null ? (rb == null ? hcpOf(b) - hcpOf(a) : -1) : 1;
      return worse(rb) - worse(ra) || hcpOf(b) - hcpOf(a);
    });
  }
  return ps.map((p) => p.id);
}

/** The players in that order into flights of `size`: flight 0 first. */
export function deal(order: string[], size: number): Record<string, number> {
  const sizes = flightSizes(order.length, size);
  const out: Record<string, number> = {};
  let k = 0;
  sizes.forEach((n, f) => {
    for (let i = 0; i < n; i++) out[order[k++]] = f;
  });
  return out;
}

/** Who makes the cut: the best `top` by the standing (rows best first, each its sum), and everyone level with the last
 *  of them. */
export function madeCut<R extends { sum: number }>(rows: R[], top: number): R[] {
  if (top <= 0 || rows.length <= top) return rows;
  const line = rows[top - 1].sum;
  return rows.filter((r, k) => k < top || r.sum === line);
}
