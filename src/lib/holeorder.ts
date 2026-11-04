import type { Round } from '../types';

// The order a round is played in (Sascha 04.11.2026: a tournament's flights at tee 1 and tee 10): a round started on
// another hole (`startHole`, 9 = tee 10) plays to the last hole and on from the first – 10 … 18, 1 … 9. Without
// `startHole` everything is as ever: 1 … 18.

type Order = Pick<Round, 'holes' | 'startHole'>;

const start = (r: Order): number => {
  const s = r.startHole ?? 0;
  return s > 0 && s < r.holes.length ? s : 0;
};

/** Where a hole comes in the round: 0 the first played, holes.length − 1 the last. */
export const playPos = (r: Order, hole: number): number => (hole - start(r) + r.holes.length) % r.holes.length;

/** The hole played after this one – null after the last. */
export const nextHole = (r: Order, hole: number): number | null => (playPos(r, hole) >= r.holes.length - 1 ? null : (hole + 1) % r.holes.length);

/** The hole played before this one – null on the first. */
export const prevHole = (r: Order, hole: number): number | null => (playPos(r, hole) <= 0 ? null : (hole - 1 + r.holes.length) % r.holes.length);

/** The last hole of the round (17 from tee 1 on 18 holes, 8 from tee 10). */
export const lastHole = (r: Order): number => (start(r) + r.holes.length - 1) % r.holes.length;

/** Is it the last hole of the round? */
export const isLastHole = (r: Order, hole: number): boolean => playPos(r, hole) === r.holes.length - 1;
