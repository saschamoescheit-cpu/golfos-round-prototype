import type { Round } from '../types';
import { RATINGS, type TeeRating } from '../data/ratings';
import { grossForHole, handicapStrokes, netDoubleBogey } from './scoring';
import { isTeamRound } from './games';

// The handicap played today (World Handicap System): the score differential of an 18-hole round,
//   differential = 113 / slope × (adjusted gross score − course rating),
// where the adjusted gross caps every hole at net double bogey (par + 2 + handicap strokes on that hole).
// The playing conditions calculation (PCC) is published by the federation a day later and left at 0.

/** Course rating and slope for the round: corrected by the player, else from the bundled scorecard data. */
export function roundRating(r: Round): TeeRating | null {
  return r.rating ?? (r.tee ? ratingFor(r.courseId, r.tee, r.holes) : null);
}

const OWN = 'golfos.ratings.v1';
const loopsKey = (holes: { loop: string }[]): string => [...new Set(holes.map((h) => h.loop))].sort().join('');
function ownRatings(): Record<string, TeeRating> {
  try {
    return JSON.parse(localStorage.getItem(OWN) ?? '{}') as Record<string, TeeRating>;
  } catch {
    return {};
  }
}

/** Course rating and slope for a tee and the holes played: what the player entered for them (from the club's
 *  scorecard), else the bundled values – per 18-hole combination where a course has loops (Hetzenhof A+B …).
 *  9 holes of a loop: the first combination with that loop (the course handicap is halved, within a stroke). */
export function ratingFor(courseId: string, tee: string, holes: { loop: string }[]): TeeRating | null {
  const key = loopsKey(holes);
  // a value entered before a tee could be chosen ("–") counts until there is one for this tee (22.10.2026)
  const own = ownRatings()[`${courseId}|${tee}|${key}`] ?? ownRatings()[`${courseId}|–|${key}`];
  if (own) return own;
  const all = RATINGS[courseId] ?? {};
  if (all[`${tee}@${key}`]) return all[`${tee}@${key}`];
  if (key.length === 1) {
    const combo = Object.keys(all).filter((k) => k.startsWith(`${tee}@`) && k.slice(tee.length + 1).includes(key)).sort()[0];
    if (combo) return all[combo];
  }
  return all[tee] ?? null;
}

/** The player's own course rating and slope for this tee and these holes – kept for the next round. */
export function saveOwnRating(courseId: string, tee: string, holes: { loop: string }[], rating: TeeRating | null): void {
  try {
    const all = ownRatings();
    const k = `${courseId}|${tee}|${loopsKey(holes)}`;
    if (rating) all[k] = rating;
    else delete all[k];
    localStorage.setItem(OWN, JSON.stringify(all));
  } catch {
    /* storage full – this round only */
  }
}

export interface PlayedHandicap {
  adjustedGross: number;
  differential: number;
  rating: TeeRating;
}

/** Score differential of the player's round; null for 9-hole rounds, holes without a score or no rating. */
export function playedHandicap(r: Round): PlayedHandicap | null {
  if (isTeamRound(r)) return null; // a team score is no handicap of the player
  const me = r.players.find((p) => p.isMe);
  const rating = roundRating(r);
  if (!me || !rating || r.holes.length !== 18) return null;
  const received = handicapStrokes(r.holes, me.playingHandicap);
  let adjustedGross = 0;
  for (let i = 0; i < r.holes.length; i++) {
    const g = grossForHole(r.entries[me.id][i], r.holes[i].par, received[i]);
    if (g == null) return null;
    adjustedGross += Math.min(g, netDoubleBogey(r.holes[i].par, received[i]));
  }
  return { adjustedGross, differential: scoreDifferential(adjustedGross, rating), rating };
}

export function scoreDifferential(adjustedGross: number, rating: TeeRating): number {
  return Math.round((113 / rating.slope) * (adjustedGross - rating.cr) * 10) / 10;
}

/**
 * Handicap index from the most recent (up to 20) differentials, newest first, per the WHS table:
 * with fewer than 20 rounds fewer of the best count, with an adjustment for 3, 4 and 6 rounds. Null below 3.
 */
export function handicapIndex(differentials: number[]): { index: number; used: number; of: number } | null {
  const recent = differentials.slice(0, 20);
  const n = recent.length;
  if (n < 3) return null;
  const [used, adjust] = n <= 3 ? [1, -2] : n === 4 ? [1, -1] : n === 5 ? [1, 0] : n === 6 ? [2, -1] : n <= 8 ? [2, 0] : n <= 11 ? [3, 0] : n <= 14 ? [4, 0] : n <= 16 ? [5, 0] : n <= 18 ? [6, 0] : n === 19 ? [7, 0] : [8, 0];
  const best = recent.slice().sort((a, b) => a - b).slice(0, used);
  const avg = best.reduce((s, x) => s + x, 0) / used;
  return { index: Math.min(54, Math.round((avg + adjust) * 10) / 10), used, of: n };
}

/**
 * Course handicap (WHS) – the strokes the player gets on this course and tee: index × slope / 113 + (course rating − par),
 * rounded. Used as the playing handicap (100 %, a private round). Plus handicaps are negative indexes ("+1.2" → −1.2).
 */
export function courseHandicap(index: number, rating: TeeRating, par: number): number {
  return Math.round(index * (rating.slope / 113) + (rating.cr - par));
}

/** Handicap index as typed: "7,4", "7.4", "+1,2" (plus handicap → −1.2); null when empty or not a number. */
export function parseIndex(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = t.startsWith('+') ? -Number(t.slice(1)) : Number(t);
  return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null;
}
