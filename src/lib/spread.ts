import type { Club, LngLat } from '../types';
import type { ClubReport } from './clubstats';
import { move } from './aimpoint';
import { bearingDeg } from './geo';
import { spreadFactor } from './hcp';
import { launchFor, type LmClub } from './launchmonitor';

// The spread of a club (Sascha 23.10.2026: "with such a dispersion triangle you can plan courses, holes and single
// shots – in the stats and on the round, for the club or the caddie's club"): where 80 % of the balls end around the
// landing spot – sideways off the target line and in length. From the player's own checked shots once there are 5;
// before that an estimate from the playing handicap (the same spread the caddie already plans with).

export interface ClubSpread {
  club: Club;
  /** metres off the target line, − left / + right (80 % of the balls between) */
  side: { lo: number; hi: number };
  /** metres short (−) / long (+) of the typical length */
  len: { lo: number; hi: number };
  /** shots it rests on – 0 = estimated from the handicap */
  shots: number;
  /** where it comes from: the checked rounds, the launch monitor (037), or the estimate */
  source?: 'own' | 'lm' | 'est';
}

export const OWN_SPREAD_FROM = 5;

/** The estimate: sideways ±1.28 σ with σ = (6.5 % of the length + 2 m) × the handicap's factor (as aimPoint and
 *  caddieplan reckon); in length σ = (3 % of the length + 7 m) × the factor. Long clubs miss more to the side, short ones
 *  more in length (Sascha 25.10.2026: "a wedge as a circle is not realistic" – launch monitor and shot tracking data of
 *  amateurs): from about 143 m down the ellipse is longer than wide – a wedge at 70 m ±8 m wide and ±12 m long, a driver at
 *  220 m ±21 m wide and ±17 m long (handicap factor 1). */
export function estimatedSpread(club: Club, lengthM: number, playing: number | null | undefined): ClubSpread {
  const k = spreadFactor(playing);
  const side = Math.round(1.28 * (0.065 * lengthM + 2) * k);
  const len = Math.round(1.28 * (0.03 * lengthM + 7) * k);
  return { club, side: { lo: -side, hi: side }, len: { lo: -len, hi: len }, shots: 0, source: 'est' };
}

/** The player's spread with this club: own shots on the course when there are enough, else the launch monitor's (from
 *  5 measured shots, feature 037), else the estimate. */
export function clubSpread(club: Club, lengthM: number, report: ClubReport | undefined, playing: number | null | undefined, lm: LmClub | null = launchFor(club)): ClubSpread {
  const est = estimatedSpread(club, lengthM, playing);
  if (report?.corridor && report.corridor.shots >= OWN_SPREAD_FROM) {
    return { club, side: { lo: report.corridor.lo, hi: report.corridor.hi }, len: report.lenBand ?? est.len, shots: report.corridor.shots, source: 'own' };
  }
  if (lm) return { club, side: lm.side ?? est.side, len: lm.len, shots: lm.shots, source: 'lm' };
  return est;
}

/** The spread on the map: an ellipse around the landing spot (along the shot), and the cone from the ball to it. */
export function spreadShape(from: LngLat, target: LngLat, s: ClubSpread, steps = 40): { ellipse: LngLat[]; cone: [LngLat, LngLat][] } {
  const along = bearingDeg(from, target);
  const across = along + 90;
  const mid = (s.side.lo + s.side.hi) / 2;
  const a = Math.max(2, (s.side.hi - s.side.lo) / 2); // half width
  const b = Math.max(2, (s.len.hi - s.len.lo) / 2); // half length
  const centre = move(move(target, across, mid), along, (s.len.lo + s.len.hi) / 2);
  const ellipse: LngLat[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = (2 * Math.PI * k) / steps;
    ellipse.push(move(move(centre, across, a * Math.cos(t)), along, b * Math.sin(t)));
  }
  const left = move(centre, across, -a);
  const right = move(centre, across, a);
  return { ellipse, cone: [[from, left], [from, right]] };
}

/** "12 m left to 9 m right" etc. for the caddie card: the width in words. */
export function spreadWidth(s: ClubSpread): number {
  return Math.round(s.side.hi - s.side.lo);
}
