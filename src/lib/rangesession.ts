import type { Club, Flight } from '../types';
import { CLUB_ORDER } from './clubs';
import type { LmShot } from './launchmonitor';

// A launch monitor session on its own page (Sascha 26.10.2026: "all four tabs – spread, gaps, flight, swing"): what the
// device measured, worked out per club. The numbers stay as measured (Sascha: "1:1, nothing converted").

export const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
export const median = (xs: number[]): number => quantile(xs, 0.5);

/** The clubs of a session in playing order (longest first), with their shots. */
export function clubsOf(shots: LmShot[]): { club: Club; shots: LmShot[] }[] {
  const by = new Map<Club, LmShot[]>();
  for (const s of shots) by.set(s.club, [...(by.get(s.club) ?? []), s]);
  return [...by.entries()].map(([club, xs]) => ({ club, shots: xs })).sort((a, b) => CLUB_ORDER.indexOf(a.club) - CLUB_ORDER.indexOf(b.club));
}

/** A clear mishit: under 60 % of the club's median carry – as the import leaves them out. */
export function mishits(shots: LmShot[]): Set<LmShot> {
  const med = median(shots.map((s) => s.carry));
  return new Set(shots.filter((s) => s.carry < 0.6 * med));
}

export interface ClubSpreadStats {
  shots: number;
  carry: number;
  total: number | null;
  /** where 8 of 10 balls land: carry and side (metres) */
  carryLo: number;
  carryHi: number;
  sideLo: number | null;
  sideHi: number | null;
}
/** The good shots' carry, total and where 8 of 10 land. */
export function spreadOf(shots: LmShot[]): ClubSpreadStats {
  const miss = mishits(shots);
  const good = shots.filter((s) => !miss.has(s));
  const carries = good.map((s) => s.carry);
  const sides = good.map((s) => s.side).filter((v): v is number => v != null);
  const totals = good.map((s) => s.total).filter((v): v is number => v != null);
  return {
    shots: good.length,
    carry: Math.round(median(carries)),
    total: totals.length ? Math.round(median(totals)) : null,
    carryLo: quantile(carries, 0.1),
    carryHi: quantile(carries, 0.9),
    sideLo: sides.length >= 3 ? quantile(sides, 0.1) : null,
    sideHi: sides.length >= 3 ? quantile(sides, 0.9) : null,
  };
}

/** The spread in one sentence: is it the direction or the length that costs. */
export function spreadSay(s: ClubSpreadStats, name: string, tr: (en: string, de: string) => string): string | null {
  if (s.shots < 5) return tr(`Only ${s.shots} shots – from 5 on the spread says something.`, `Erst ${s.shots} Schläge – ab 5 sagt die Streuung etwas.`);
  if (s.sideLo == null || s.sideHi == null) return null;
  const wide = s.sideHi - s.sideLo;
  const long = s.carryHi - s.carryLo;
  if (wide >= 1.8 * long) return tr(`Your ${name} spreads about twice as much sideways as in length (${Math.round(wide)} m against ${Math.round(long)} m). The length is reliable – the direction costs.`, `Seitlich streut dein ${name} gut doppelt so viel wie in der Länge (${Math.round(wide)} m gegen ${Math.round(long)} m). Die Weite ist verlässlich – die Richtung kostet.`);
  if (wide >= 1.25 * long) return tr(`Your ${name} spreads more sideways than in length (${Math.round(wide)} m against ${Math.round(long)} m).`, `Seitlich streut dein ${name} mehr als in der Länge (${Math.round(wide)} m gegen ${Math.round(long)} m).`);
  if (long >= 1.25 * wide) return tr(`Your ${name} spreads more in length than sideways (${Math.round(long)} m against ${Math.round(wide)} m). The direction holds – the length varies.`, `In der Länge streut dein ${name} mehr als seitlich (${Math.round(long)} m gegen ${Math.round(wide)} m). Die Richtung hält – die Weite schwankt.`);
  return tr(`Your ${name} spreads about as much sideways as in length (${Math.round(wide)} m and ${Math.round(long)} m).`, `Dein ${name} streut seitlich etwa so viel wie in der Länge (${Math.round(wide)} m und ${Math.round(long)} m).`);
}

/**
 * The flight of a measured shot, in the names of the round check: where it started (launch direction) and how it curved
 * (the carry's angle off the line minus the start). Draw and fade: started beside the line and curved back near it. For a
 * left-hander the sides are mirrored – his "pull" goes right. Null without a launch direction.
 */
export function flightOf(s: LmShot, lefty = false): Flight | null {
  if (s.dir == null) return null;
  const sideAngle = s.sideAngle ?? (s.side != null && s.carry > 0 ? (Math.atan2(s.side, s.carry) * 180) / Math.PI : null);
  if (sideAngle == null) return null;
  const k = lefty ? -1 : 1;
  const dir = s.dir * k;
  const curve = (sideAngle - s.dir) * k;
  const start = dir > 2 ? 1 : dir < -2 ? -1 : 0;
  const bend = curve > 1.5 ? 1 : curve < -1.5 ? -1 : 0;
  const near = s.side != null && Math.abs(s.side) <= Math.max(6, s.carry * 0.04);
  if (start === 1 && bend === -1 && near) return 'draw';
  if (start === -1 && bend === 1 && near) return 'fade';
  const names: Record<string, Flight> = { '-1,-1': 'pullHook', '-1,0': 'pull', '-1,1': 'pullSlice', '0,-1': 'hook', '0,0': 'straight', '0,1': 'slice', '1,-1': 'pushHook', '1,0': 'push', '1,1': 'pushSlice' };
  return names[`${start},${bend}`];
}

/** The PGA Tour average per club (TrackMan): club and ball speed (km/h), smash, attack angle, launch, spin, apex (m), carry (m). */
export interface TourRef {
  clubSpeed: number;
  ballSpeed: number;
  smash: number;
  attack: number;
  launch: number;
  spin: number;
  apex: number;
  carry: number;
}
const mph = (x: number) => Math.round(x * 1.609344);
const yd = (x: number) => Math.round(x * 0.9144);
const ref = (cs: number, aa: number, bs: number, sf: number, la: number, sp: number, h: number, c: number): TourRef => ({ clubSpeed: mph(cs), attack: aa, ballSpeed: mph(bs), smash: sf, launch: la, spin: sp, apex: yd(h), carry: yd(c) });
export const TOUR: Partial<Record<Club, TourRef>> = {
  Dr: ref(113, -1.3, 167, 1.48, 10.9, 2686, 32, 275),
  '3W': ref(107, -2.9, 158, 1.48, 9.2, 3655, 30, 243),
  '5W': ref(103, -3.3, 152, 1.47, 9.4, 4350, 31, 230),
  Hy: ref(100, -3.5, 146, 1.46, 10.2, 4437, 29, 225),
  '3i': ref(98, -3.1, 142, 1.45, 10.4, 4630, 27, 212),
  '4i': ref(96, -3.4, 137, 1.43, 11.0, 4836, 28, 203),
  '5i': ref(94, -3.7, 132, 1.41, 12.1, 5361, 31, 194),
  '6i': ref(92, -4.1, 127, 1.38, 14.1, 6231, 30, 183),
  '7i': ref(90, -4.3, 120, 1.33, 16.3, 7097, 32, 172),
  '8i': ref(87, -4.5, 115, 1.32, 18.1, 7998, 31, 160),
  '9i': ref(85, -4.7, 109, 1.28, 20.4, 8647, 30, 148),
  PW: ref(83, -5.0, 102, 1.23, 24.2, 9304, 29, 136),
};

/** The median of a measurement over a club's good shots; null when the file has it for fewer than 3. */
export function medianOf(shots: LmShot[], key: keyof LmShot): number | null {
  const miss = mishits(shots);
  const xs = shots.filter((s) => !miss.has(s)).map((s) => s[key]).filter((v): v is number => typeof v === 'number');
  return xs.length >= 3 ? median(xs) : null;
}

/** What stands out against the tour: spin off by a quarter, attack angle by 2.5°, smash 0.06 below. */
export function offTour(key: keyof TourRef, mine: number, tour: number): boolean {
  if (key === 'spin') return Math.abs(mine - tour) > 0.25 * tour;
  if (key === 'attack') return Math.abs(mine - tour) > 2.5;
  if (key === 'smash') return mine < tour - 0.06;
  return false;
}

/**
 * The bag beside the measurement: the clubs whose carry does not fit the measured ones' order – a club shorter than a
 * measured club below it, or longer than one above it. Measured clubs never count as wrong.
 */
export function outOfOrder(measured: Map<Club, number>, bag: { club: Club; carry: number }[]): Set<Club> {
  const out = new Set<Club>();
  const idx = (c: Club) => CLUB_ORDER.indexOf(c);
  for (const b of bag) {
    if (measured.has(b.club)) continue;
    for (const [m, carry] of measured) {
      if (idx(m) > idx(b.club) && carry > b.carry) out.add(b.club); // a shorter club flies farther
      if (idx(m) < idx(b.club) && carry < b.carry) out.add(b.club); // a longer club flies shorter
    }
  }
  return out;
}

/** Neighbouring measured clubs that lie close together: less than 4 m per club between them. */
export function closeGaps(measured: Map<Club, number>): { long: Club; short: Club; gap: number; steps: number }[] {
  const list = [...measured.entries()].sort((a, b) => CLUB_ORDER.indexOf(a[0]) - CLUB_ORDER.indexOf(b[0]));
  const out: { long: Club; short: Club; gap: number; steps: number }[] = [];
  for (let k = 1; k < list.length; k++) {
    const [long, a] = list[k - 1];
    const [short, b] = list[k];
    // irons and wedges count in clubs between (7i → PW: three); between woods and hybrids one step
    const ironOrWedge = (c: Club) => /^\di$|^(PW|GW|SW|LW)$/.test(c);
    const steps = ironOrWedge(long) && ironOrWedge(short) ? CLUB_ORDER.indexOf(short) - CLUB_ORDER.indexOf(long) : 1;
    if (steps >= 1 && (a - b) / steps < 4) out.push({ long, short, gap: Math.round(a - b), steps });
  }
  return out;
}
