import type { Club } from '../types';
import { sideWord, tr } from './i18n';
import { CLUB_CATALOG, CLUB_ORDER } from './clubs';

// AI caddie (feature 008): how long a shot plays under today's conditions and which club fits.
// "Plays like" = distance + wind + temperature + height difference. All factors are rules of thumb from
// club fitting / launch monitor practice – to be confirmed by Chris (marked in the spec).

/** The player's carry distance per club in metres (editable under "My bag"). */
export type CarryBag = { club: Club; carry: number; swing?: 'full' | 'threeQ' | 'half' }[];

/** Mid-handicap male amateur carry distances – the start values until the player enters his own. */
export const DEFAULT_CARRY: CarryBag = CLUB_CATALOG.filter((c) => c.standard).map((c) => ({ club: c.club, carry: c.carry }));

export const FACTORS = {
  // the rule of thumb (TrackMan): +1 % per mph into the wind, −0.5 % per mph downwind (Sascha 15.10.2026: "a real
  // caddie takes a 6 or a 5 iron into a strong wind") – per km/h 0.62 % and 0.31 %
  headPerKmh: 0.0062, // into the wind: +0.62 % per km/h
  tailPerKmh: 0.0031, // downwind: −0.31 % per km/h (wind helps less than it hurts)
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

type BagClub = CarryBag[number];
export interface ClubAdvice {
  club: Club;
  carry: number;
  swing?: 'full' | 'threeQ' | 'half'; // wedges: a partial swing (feature 016)
  shorter: BagClub | null; // one club (or swing) less
  longer: BagClub | null; // one club (or swing) more
}

/**
 * Club whose carry reaches the plays-like distance (up to 5 m short – the ball still rolls); between two clubs the
 * longer one. Wedge range (30 m up to the full pitching wedge) with partial swings in the bag: the full or partial
 * swing whose carry is closest – the fuller swing when it is about as close.
 */
export function adviseClub(target: number, bag: CarryBag, teeShot = false): ClubAdvice {
  const usable = bag.filter((b) => teeShot || b.club !== 'Dr');
  const full = usable.filter((b) => !b.swing || b.swing === 'full').sort((a, b) => a.carry - b.carry);
  const pw = full.find((b) => b.club === 'PW')?.carry;
  if (pw != null && target >= 30 && target <= pw + 2 && usable.some((b) => b.swing && b.swing !== 'full')) {
    const wedge = usable.filter((b) => ['PW', 'GW', 'SW', 'LW'].includes(b.club)).sort((a, b) => a.carry - b.carry || (a.swing ? 1 : -1));
    // The fuller swing is the steadier one: a half swing has to be 2 m closer, a three-quarter 1 m, to win.
    const cost = (b: BagClub) => Math.abs(b.carry - target) + (b.swing === 'half' ? 2 : b.swing === 'threeQ' ? 1 : 0);
    const fit = wedge.reduce((best, b) => (cost(b) < cost(best) - 1e-9 ? b : best));
    const k = wedge.indexOf(fit);
    const longer = wedge[k + 1] ?? full.find((b) => b.carry > fit.carry) ?? null;
    return { club: fit.club, carry: fit.carry, swing: fit.swing, shorter: wedge[k - 1] ?? null, longer };
  }
  const fit = full.find((b) => b.carry >= target - 5) ?? full[full.length - 1];
  const k = full.indexOf(fit);
  return { club: fit.club, carry: fit.carry, shorter: full[k - 1] ?? null, longer: full[k + 1] ?? null };
}

const CLUB_NAMES: Record<Club, string> = {
  Dr: 'Driver', '3W': '3-wood', '4W': '4-wood', '5W': '5-wood', '7W': '7-wood', '9W': '9-wood', '2H': '2-hybrid', '3H': '3-hybrid', Hy: '4-hybrid',
  '5H': '5-hybrid', '6H': '6-hybrid', '2i': '2-iron', '3i': '3-iron', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
  '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge', Pt: 'Putter (Texas wedge)',
};
const CLUB_NAMES_DE: Record<Club, string> = {
  Dr: 'Driver', '3W': 'Holz 3', '4W': 'Holz 4', '5W': 'Holz 5', '7W': 'Holz 7', '9W': 'Holz 9', '2H': 'Hybrid 2', '3H': 'Hybrid 3', Hy: 'Hybrid 4',
  '5H': 'Hybrid 5', '6H': 'Hybrid 6', '2i': 'Eisen 2', '3i': 'Eisen 3', '4i': 'Eisen 4', '5i': 'Eisen 5', '6i': 'Eisen 6', '7i': 'Eisen 7',
  '8i': 'Eisen 8', '9i': 'Eisen 9', PW: 'Pitching Wedge', GW: 'Gap Wedge', SW: 'Sand Wedge', LW: 'Lob Wedge', Pt: 'Putter (Texas Wedge)',
};
export const clubName = (c: Club) => tr(CLUB_NAMES[c], CLUB_NAMES_DE[c]);

/** One line per factor for the caddie card, e.g. "Into the wind 25 km/h (gusts): +20 m". */
export function explain(p: PlaysLike, c: Conditions | null): string[] {
  const out: string[] = [];
  const m = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} m`;
  if (c && Math.abs(p.wind) >= 1)
    out.push(`${p.headKmh >= 0 ? tr('Into the wind', 'Gegenwind') : tr('Downwind', 'Rückenwind')} ${Math.abs(p.headKmh)} km/h${c.gustKmh > c.windKmh + 5 ? tr(' (gusty)', ' (böig)') : ''}: ${m(p.wind)}`);
  if (c && Math.abs(p.temp) >= 1) out.push(`${Math.round(c.tempC)} °C: ${m(p.temp)}`);
  if (Math.abs(p.height) >= 1) out.push(`${p.height > 0 ? tr('Uphill', 'Bergauf') : tr('Downhill', 'Bergab')} ${Math.abs(Math.round(p.height))} m: ${m(p.height)}`);
  if (Math.abs(p.aimM) >= 2)
    out.push(tr(`Crosswind ${Math.abs(p.crossKmh)} km/h from the ${p.crossKmh > 0 ? 'right' : 'left'}`, `Seitenwind ${Math.abs(p.crossKmh)} km/h von ${p.crossKmh > 0 ? 'rechts' : 'links'}`));
  return out;
}

/**
 * Where to aim: into the crosswind, and against the player's own tendency with this club
 * (`biasM` > 0 = the club goes right on average, known from ≥ 5 tracked shots).
 */
export function aimAdvice(windAimM: number, biasM: number | null, club: Club, slopeAimM = 0): string | null {
  const total = Math.round(windAimM - (biasM ?? 0) + slopeAimM);
  const parts: string[] = [];
  if (Math.abs(windAimM) >= 2) parts.push(tr('wind', 'Wind'));
  if (Math.abs(slopeAimM) >= 2) parts.push(tr('slope', 'Hang'));
  if (biasM != null && Math.abs(biasM) >= 3)
    parts.push(tr(`your ${clubName(club)} goes ${Math.abs(biasM)} m ${biasM > 0 ? 'right' : 'left'} on average`, `dein ${clubName(club)} geht im Schnitt ${Math.abs(biasM)} m ${biasM > 0 ? 'rechts' : 'links'}`));
  if (Math.abs(total) < 2 || !parts.length) return null;
  const side = total > 0 ? 'right' : 'left';
  // More than 15 m on a fairway: a caddie would name the edge, not a number.
  if (Math.abs(total) > 15 && Math.abs(slopeAimM) >= 2)
    return tr(`Aim at the ${side} edge of the fairway (${parts.join(' + ')})`, `Ziele auf den ${side === 'right' ? 'rechten' : 'linken'} Fairwayrand (${parts.join(' + ')})`);
  return tr(`Aim ${Math.min(20, Math.abs(total))} m ${side} (${parts.join(' + ')})`, `Ziele ${Math.min(20, Math.abs(total))} m ${sideWord(side)} (${parts.join(' + ')})`);
}

/** Green slope for the player: strength and how the putt behaves, seen from where he stands. */
export function readGreen(slope: { pct: number; downDeg: number }, puttBearing: number): { level: string; text: string } {
  const level = slope.pct < 1 ? 'flat' : slope.pct < 2 ? 'gentle' : slope.pct < 3.5 ? 'moderate' : 'strong';
  if (level === 'flat') return { level, text: tr('Green is almost flat', 'Grün ist fast flach') };
  // Angle between the putt and the fall line: 0 = falls away (downhill putt), 180 = towards the player (uphill).
  const rel = (((slope.downDeg - puttBearing) % 360) + 360) % 360;
  const along = rel < 45 || rel > 315 ? tr('downhill putt', 'Putt bergab') : rel > 135 && rel < 225 ? tr('uphill putt', 'Putt bergauf') : null;
  const side = rel >= 45 && rel <= 135 ? tr('breaks right', 'bricht nach rechts') : rel >= 225 && rel <= 315 ? tr('breaks left', 'bricht nach links') : null;
  return { level, text: [along, side].filter(Boolean).join(', ') || tr('slope across', 'Hang quer') };
}

/** Green slope strength for display: "moderate" / "mittlere" (before "slope" / "Neigung"); short form for the map arrow. */
export function levelName(level: string, short = false): string {
  const de: Record<string, string> = short ? { gentle: 'leicht', moderate: 'mittel', strong: 'stark' } : { gentle: 'leichte', moderate: 'mittlere', strong: 'starke' };
  return tr(level, de[level] ?? level);
}

// ---- Lie of the ball (feature 019) – rules of thumb, to be confirmed by Chris ----
export type LieKind = 'normal' | 'lightRough' | 'heavyRough' | 'fairwayBunker' | 'uphill' | 'downhill' | 'above' | 'below';
export const LIE_OPTIONS: { value: LieKind; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'lightRough', label: tr('Light rough', 'Leichtes Rough') },
  { value: 'heavyRough', label: tr('Deep rough', 'Tiefes Rough') },
  { value: 'fairwayBunker', label: tr('Fairway bunker', 'Fairwaybunker') },
  { value: 'uphill', label: tr('Uphill', 'Bergauf') },
  { value: 'downhill', label: tr('Downhill', 'Bergab') },
  { value: 'above', label: tr('Ball above feet', 'Ball über den Füßen') },
  { value: 'below', label: tr('Ball below feet', 'Ball unter den Füßen') },
];

/** How the lie changes the shot: plays-like factor, aim (m, + right, right-handed player), longest club, tip. */
export function lieEffect(lie: LieKind): { factor: number; aimM: number; maxClub: Club | null; text: string } | null {
  switch (lie) {
    case 'lightRough':
      return { factor: 0.95, aimM: 0, maxClub: null, text: tr('Light rough: the ball can jump ("flyer") and fly further – land it short of the target', 'Leichtes Rough: der Ball kann springen („Flyer“) und weiter fliegen – lande ihn vor dem Ziel') };
    case 'heavyRough':
      return { factor: 1.15, aimM: 0, maxClub: '7i', text: tr('Deep rough: 7-iron at most, take loft', 'Tiefes Rough: höchstens Eisen 7, nimm Loft') };
    case 'fairwayBunker':
      return { factor: 1.05, aimM: 0, maxClub: '5i', text: tr('Fairway bunker: one club more, ball first – enough loft for the lip', 'Fairwaybunker: ein Schläger mehr, Ball zuerst treffen – genug Loft für die Kante') };
    case 'uphill':
      return { factor: 1.06, aimM: 3, maxClub: null, text: tr('Uphill lie: one club more, the ball goes higher and left – aim a little right', 'Hanglage bergauf: ein Schläger mehr, der Ball steigt höher und geht nach links – ziele etwas rechts') };
    case 'downhill':
      return { factor: 0.95, aimM: -3, maxClub: null, text: tr('Downhill lie: one club less, the ball flies lower and right – aim a little left', 'Hanglage bergab: ein Schläger weniger, der Ball fliegt flacher und nach rechts – ziele etwas links') };
    case 'above':
      return { factor: 1, aimM: 4, maxClub: null, text: tr('Ball above your feet: it curves left – aim right, grip down', 'Ball über den Füßen: er dreht nach links – ziele rechts, greif kürzer') };
    case 'below':
      return { factor: 1, aimM: -4, maxClub: null, text: tr('Ball below your feet: it curves right – aim left, flex the knees', 'Ball unter den Füßen: er dreht nach rechts – ziele links, geh tiefer in die Knie') };
    default:
      return null;
  }
}

/** Club advice limited to clubs not longer than `maxClub` (deep rough, fairway bunker). */
export function adviseClubMax(target: number, bag: CarryBag, teeShot: boolean, maxClub: Club | null): ClubAdvice {
  const allowed = maxClub ? bag.filter((b) => CLUB_ORDER.indexOf(b.club) >= CLUB_ORDER.indexOf(maxClub)) : bag;
  return adviseClub(target, allowed.length ? allowed : bag, teeShot);
}

// ---- Stableford strategy (feature 019) ----
/** One line about the score on this hole: strokes received on the tee, pick up when no point is left. */
export function scoreStrategy(o: { par: number; received: number; shotsSoFar: number | null }): string | null {
  const net2 = o.par + o.received; // gross score that still gives 2 Stableford points
  if (o.shotsSoFar != null && o.shotsSoFar >= net2 + 1) return tr('No Stableford point left on this hole – pick up and keep the pace', 'Kein Stableford-Punkt mehr möglich – heb auf und halte das Tempo');
  if (o.shotsSoFar !== 0) return null; // the stroke reminder belongs on the tee
  if (o.received >= 1)
    return tr(
      `You get ${o.received} stroke${o.received > 1 ? 's' : ''} here – a ${net2} still scores 2 points, no need to force it`,
      `Du bekommst hier ${o.received} ${o.received > 1 ? 'Schläge' : 'Schlag'} – eine ${net2} bringt noch 2 Punkte, kein Risiko nötig`,
    );
  return null;
}
