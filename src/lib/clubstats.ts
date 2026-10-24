import type { Club, DetailEntry, Flight, LngLat, Round, Shot, Strike } from '../types';
import { bearingDeg, distanceM, pointAt } from './geo';
import { playsLike, type Conditions } from './caddie';
import { sideOf } from './dispersion';
import { flightOf, mishit, onLine } from './shotfacts';
import { plausibleForClub, shotLengths } from './shots';

// Per club from the checked shots (Sascha 22.10.2026): the bag's distances from good strikes only, taken back to calm
// air and 20 °C with the caddie's own rules; how often the club is struck well and how it misses; the corridor in
// which 80 % of its balls end – "15 m left, 5 m right" – for the caddie to keep hazards out of it, as tour players plan.

export interface HoleWeather {
  tempC: number;
  windKmh: number;
  gustKmh?: number; // stored from 23.10.2026 on
  windFromDeg: number;
}

/** A shot's length in calm air at 20 °C: what the same swing would have flown without this wind and temperature. */
export function calmLength(len: number, from: LngLat, to: LngLat, w: HoleWeather | undefined): number {
  if (!w) return len;
  const c: Conditions = { windKmh: w.windKmh, gustKmh: w.gustKmh ?? w.windKmh, windFromDeg: w.windFromDeg, tempC: w.tempC };
  const p = playsLike(len, bearingDeg(from, to), c, null);
  return len + p.wind + p.temp;
}

/** The lengths a club learns from: good strikes once there are 3 of them, else every shot but the mishits. */
export function learnFrom<T extends { strike?: Strike }>(xs: T[]): T[] {
  const good = xs.filter((x) => x.strike === 'good');
  return good.length >= 3 ? good : xs.filter((x) => !mishit(x.strike));
}

/** Each shot's length as it played with the hole's wind and temperature (Sascha 23.10.2026: 130 m into a strong
 *  headwind played like 160 m – the 6-iron was right): null where the length is unknown. Without weather the length. */
export function playedLengths(d: DetailEntry, w: HoleWeather | undefined): (number | null)[] {
  const lengths = shotLengths(d);
  return d.shots.map((s, k) => {
    const len = lengths[k];
    if (len == null || !s.pos) return len;
    const end = s.penalty && s.missPos ? s.missPos : k + 1 < d.shots.length ? d.shots[k + 1].pos : d.onGreen;
    return end ? Math.round(calmLength(len, s.pos, end, w)) : len;
  });
}

export interface ClubShot {
  club: Club;
  len: number; // as played
  calm: number; // in calm air at 20 °C
  strike?: Strike;
  flight?: Flight;
  side: number | null; // metres off the target line where the ball ended (+ right), null without a target
}

/** The target line of a shot: the pin – a tee shot on a par 4/5 the hole's line at the shot's length (the fairway). */
export type LineOf = (round: Round, hole: number) => LngLat[] | null;

/** Every full shot with a club of the player's own checked rounds. */
export function clubShots(rounds: Round[], lineOf?: LineOf): ClubShot[] {
  const out: ClubShot[] = [];
  for (const r of rounds) {
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    r.holes.forEach((h, i) => {
      const e = r.entries[me.id]?.[i];
      const d = e?.detail;
      if (!d) return;
      const lengths = shotLengths(d);
      d.shots.forEach((s: Shot, k) => {
        const len = lengths[k];
        if (!s.club || s.club === 'Pt' || len == null || s.lie === 'recovery') return;
        if (s.kind && s.kind !== 'full') return;
        if (s.intent === 'recovery') return;
        if (!plausibleForClub(s.club, len)) return;
        const from = s.pos!;
        const end = s.penalty && s.missPos ? s.missPos : k + 1 < d.shots.length ? d.shots[k + 1].pos : d.onGreen;
        if (!end) return;
        let side: number | null = null;
        if (k === 0 && h.par >= 4) {
          const line = lineOf?.(r, i);
          if (line && line.length >= 2) side = sideOf(from, pointAt(line, distanceM(from, end)), end);
        } else if (d.pin && distanceM(from, d.pin) >= 40) side = sideOf(from, d.pin, end);
        out.push({ club: s.club, len, calm: s.penalty ? len : calmLength(len, from, end, e.weather), strike: s.strike, flight: s.flight, side });
      });
    });
  }
  return out;
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (pos - lo);
};

export interface ClubReport {
  club: Club;
  shots: number;
  /** Median length in calm air from the shots it learns from (good strikes when there are 3). */
  median: number;
  basis: 'good' | 'all';
  rated: number; // shots with a strike set
  good: number; // of them good
  misses: Partial<Record<Strike, number>>; // the contact: fat, thin, shank
  /** the flights other than straight (Sascha 23.10.2026) – with "slice"/"hook" set as strike before */
  flights: Partial<Record<Flight, number>>;
  flown: number; // shots with a flight set
  /** 80 % of the balls between `lo` and `hi` metres off the target line (− left, + right), from 5 shots on. */
  corridor: { lo: number; hi: number; shots: number } | null;
  /** 80 % of the lengths (calm air) between `lo` and `hi` metres short / long of the median, from 5 shots on */
  lenBand: { lo: number; hi: number } | null;
  /** every shot with a target line: metres off it (+ right) and its length in calm air – the dispersion chart */
  points: { side: number; len: number; strike: 'good' | 'miss' | null }[];
}

export function clubReports(rounds: Round[], lineOf?: LineOf): ClubReport[] {
  const by = new Map<Club, ClubShot[]>();
  for (const s of clubShots(rounds, lineOf)) by.set(s.club, [...(by.get(s.club) ?? []), s]);
  return [...by.entries()].map(([club, xs]) => {
    const learn = learnFrom(xs);
    // the contact only: an old "slice"/"hook" strike is a flight, it says nothing about the contact – else "0 % good" stood
    // next to "0× missed" (Sascha 23.10.2026)
    const rated = xs.filter((x) => x.strike && x.strike !== 'slice' && x.strike !== 'hook');
    const misses: Partial<Record<Strike, number>> = {};
    for (const x of rated) if (x.strike !== 'good') misses[x.strike!] = (misses[x.strike!] ?? 0) + 1;
    const flights: Partial<Record<Flight, number>> = {};
    let flown = 0;
    for (const x of xs) {
      const f = flightOf(x);
      if (!f) continue;
      flown++;
      if (!onLine(f)) flights[f] = (flights[f] ?? 0) + 1; // a draw or a fade is played on purpose – not off the line
    }
    const sides = xs.map((x) => x.side).filter((v): v is number => v != null);
    const med = median(learn.map((x) => x.calm));
    const lens = xs.filter((x) => !mishit(x.strike)).map((x) => x.calm - med);
    return {
      club,
      shots: xs.length,
      median: Math.round(med),
      basis: learn.length && learn.every((x) => x.strike === 'good') ? 'good' : 'all',
      rated: rated.length,
      good: rated.filter((x) => x.strike === 'good').length,
      misses,
      flights,
      flown,
      corridor: sides.length >= 5 ? { lo: Math.round(quantile(sides, 0.1)), hi: Math.round(quantile(sides, 0.9)), shots: sides.length } : null,
      lenBand: lens.length >= 5 ? { lo: Math.round(quantile(lens, 0.1)), hi: Math.round(quantile(lens, 0.9)) } : null,
      points: xs.flatMap((x) => (x.side != null ? [{ side: Math.round(x.side), len: Math.round(x.calm), strike: x.strike === 'good' ? ('good' as const) : mishit(x.strike) ? ('miss' as const) : null }] : [])),
    };
  });
}

/** "15 m left to 5 m right", "5 to 25 m right" – the corridor in words. */
export function corridorText(c: { lo: number; hi: number }, tr: (en: string, de: string) => string): string {
  const side = (v: number) => (v < 0 ? tr('left', 'links') : tr('right', 'rechts'));
  if (c.lo < 0 && c.hi > 0) return tr(`${-c.lo} m left to ${c.hi} m right`, `${-c.lo} m links bis ${c.hi} m rechts`);
  const a = Math.min(Math.abs(c.lo), Math.abs(c.hi));
  const b = Math.max(Math.abs(c.lo), Math.abs(c.hi));
  return tr(`${a} to ${b} m ${side(c.hi)}`, `${a} bis ${b} m ${side(c.hi)}`);
}
