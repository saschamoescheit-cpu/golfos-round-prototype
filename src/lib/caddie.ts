import type { Club } from '../types';

// AI caddie (feature 008): how long a shot plays under today's conditions and which club fits.
// "Plays like" = distance + wind + temperature + height difference. All factors are rules of thumb from
// club fitting / launch monitor practice – to be confirmed by Chris (marked in the spec).

/** The player's carry distance per club in metres (editable under "My bag"). */
export type CarryBag = { club: Club; carry: number }[];

/** Mid-handicap male amateur carry distances – the start values until the player enters his own. */
export const DEFAULT_CARRY: CarryBag = [
  { club: 'Dr', carry: 200 }, { club: '3W', carry: 185 }, { club: '5W', carry: 172 }, { club: 'Hy', carry: 165 },
  { club: '4i', carry: 160 }, { club: '5i', carry: 150 }, { club: '6i', carry: 140 }, { club: '7i', carry: 130 },
  { club: '8i', carry: 120 }, { club: '9i', carry: 110 }, { club: 'PW', carry: 100 }, { club: 'GW', carry: 85 },
  { club: 'SW', carry: 70 }, { club: 'LW', carry: 55 },
];

export const FACTORS = {
  headPerKmh: 0.005, // into the wind: +0.5 % per km/h
  tailPerKmh: 0.0025, // downwind: −0.25 % per km/h (wind helps less than it hurts)
  gustShare: 0.5, // gusts count half: effective wind = mean + 50 % of (gust − mean)
  tempPerDeg: 0.0025, // ±0.25 % per °C away from 20 °C (cold air is denser, the ball is slower)
  tempRefC: 20,
  heightPerM: 1, // 1 m higher target = 1 m longer
  driftPerKmhPer100m: 0.25, // crosswind: ball drifts 0.25 m per km/h per 100 m carry
};

export interface Conditions {
  windKmh: number;
  gustKmh: number;
  windFromDeg: number; // meteorological: where the wind comes FROM
  tempC: number;
}

export interface PlaysLike {
  distance: number; // to the target, metres
  playsLike: number;
  wind: number; // metres added (+) or saved (−) by the wind
  temp: number; // metres from temperature
  height: number; // metres from the height difference
  headKmh: number; // effective head (+) / tail (−) wind
  crossKmh: number; // effective cross wind, + = from the right
  aimM: number; // aim offset into the wind: + = aim right, − = aim left
}

/**
 * How long a shot of `distance` metres plays. `shotBearing` = direction of the shot (0 = north),
 * `heightDiff` = target minus player height in metres (+ uphill).
 */
export function playsLike(distance: number, shotBearing: number, c: Conditions | null, heightDiff: number | null): PlaysLike {
  let wind = 0;
  let headKmh = 0;
  let crossKmh = 0;
  let aimM = 0;
  if (c) {
    const eff = c.windKmh + FACTORS.gustShare * Math.max(0, c.gustKmh - c.windKmh);
    const a = ((c.windFromDeg - shotBearing) * Math.PI) / 180;
    headKmh = eff * Math.cos(a);
    crossKmh = eff * Math.sin(a);
    wind = distance * (headKmh >= 0 ? FACTORS.headPerKmh * headKmh : FACTORS.tailPerKmh * headKmh);
    // Wind from the right pushes the ball left → aim right (positive).
    aimM = crossKmh * FACTORS.driftPerKmhPer100m * (distance / 100);
  }
  const temp = c ? distance * FACTORS.tempPerDeg * (FACTORS.tempRefC - c.tempC) : 0;
  const height = heightDiff != null ? heightDiff * FACTORS.heightPerM : 0;
  return {
    distance,
    playsLike: distance + wind + temp + height,
    wind,
    temp,
    height,
    headKmh: Math.round(headKmh),
    crossKmh: Math.round(crossKmh),
    aimM: Math.round(aimM),
  };
}

export interface ClubAdvice {
  club: Club;
  carry: number;
  shorter: { club: Club; carry: number } | null; // one club less
  longer: { club: Club; carry: number } | null; // one club more
}

/** Club whose carry reaches the plays-like distance (up to 5 m short – the ball still rolls); between two clubs the longer one. */
export function adviseClub(target: number, bag: CarryBag, teeShot = false): ClubAdvice {
  const clubs = bag.filter((b) => teeShot || b.club !== 'Dr').slice().sort((a, b) => a.carry - b.carry);
  const fit = clubs.find((b) => b.carry >= target - 5) ?? clubs[clubs.length - 1];
  const k = clubs.indexOf(fit);
  return { club: fit.club, carry: fit.carry, shorter: clubs[k - 1] ?? null, longer: clubs[k + 1] ?? null };
}

const CLUB_NAMES: Record<Club, string> = {
  Dr: 'Driver', '3W': '3-wood', '5W': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
  '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge',
};
export const clubName = (c: Club) => CLUB_NAMES[c];

/** One line per factor for the caddie card, e.g. "Into the wind 25 km/h (gusts): +20 m". */
export function explain(p: PlaysLike, c: Conditions | null): string[] {
  const out: string[] = [];
  const m = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} m`;
  if (c && Math.abs(p.wind) >= 1) out.push(`${p.headKmh >= 0 ? 'Into the wind' : 'Downwind'} ${Math.abs(p.headKmh)} km/h${c.gustKmh > c.windKmh + 5 ? ' (gusty)' : ''}: ${m(p.wind)}`);
  if (c && Math.abs(p.temp) >= 1) out.push(`${Math.round(c.tempC)} °C: ${m(p.temp)}`);
  if (Math.abs(p.height) >= 1) out.push(`${p.height > 0 ? 'Uphill' : 'Downhill'} ${Math.abs(Math.round(p.height))} m: ${m(p.height)}`);
  if (Math.abs(p.aimM) >= 2) out.push(`Crosswind ${Math.abs(p.crossKmh)} km/h from the ${p.crossKmh > 0 ? 'right' : 'left'}`);
  return out;
}

/**
 * Where to aim: into the crosswind, and against the player's own tendency with this club
 * (`biasM` > 0 = the club goes right on average, known from ≥ 5 tracked shots).
 */
export function aimAdvice(windAimM: number, biasM: number | null, club: Club, slopeAimM = 0): string | null {
  const total = Math.round(windAimM - (biasM ?? 0) + slopeAimM);
  const parts: string[] = [];
  if (Math.abs(windAimM) >= 2) parts.push('wind');
  if (Math.abs(slopeAimM) >= 2) parts.push('slope');
  if (biasM != null && Math.abs(biasM) >= 3) parts.push(`your ${clubName(club)} goes ${Math.abs(biasM)} m ${biasM > 0 ? 'right' : 'left'} on average`);
  if (Math.abs(total) < 2 || !parts.length) return null;
  const side = total > 0 ? 'right' : 'left';
  // More than 15 m on a fairway: a caddie would name the edge, not a number.
  if (Math.abs(total) > 15 && Math.abs(slopeAimM) >= 2) return `Aim at the ${side} edge of the fairway (${parts.join(' + ')})`;
  return `Aim ${Math.min(20, Math.abs(total))} m ${side} (${parts.join(' + ')})`;
}

/** Green slope for the player: strength and how the putt behaves, seen from where he stands. */
export function readGreen(slope: { pct: number; downDeg: number }, puttBearing: number): { level: string; text: string } {
  const level = slope.pct < 1 ? 'flat' : slope.pct < 2 ? 'gentle' : slope.pct < 3.5 ? 'moderate' : 'strong';
  if (level === 'flat') return { level, text: 'Green is almost flat' };
  // Angle between the putt and the fall line: 0 = falls away (downhill putt), 180 = towards the player (uphill).
  const rel = (((slope.downDeg - puttBearing) % 360) + 360) % 360;
  const along = rel < 45 || rel > 315 ? 'downhill putt' : rel > 135 && rel < 225 ? 'uphill putt' : null;
  const side = rel >= 45 && rel <= 135 ? 'breaks right' : rel >= 225 && rel <= 315 ? 'breaks left' : null;
  return { level, text: [along, side].filter(Boolean).join(', ') || 'slope across' };
}
