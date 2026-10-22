import type { HoleEntry, Round, RoundHole } from '../types';
import { grossForHole, handicapStrokes, playerTotals } from './scoring';
import { playedHandicap } from './handicap';
import { roundsSg, SG_CATEGORIES, type SgCategory } from './sg';
import { shotLengths } from './shots';
import { tr } from './i18n';
import { isTeamRound } from './games';

// The player's history (feature 012): every finished round as one point for the trend charts, the stats per
// course (average per hole, hardest and best hole) and personal bests.

const mine = (r: Round) => r.players.find((p) => p.isMe) ?? null;

export interface RoundPoint {
  round: Round;
  toPar18: number; // strokes over par, scaled to 18 holes
  stableford18: number | null;
  putts18: number | null;
  differential: number | null; // handicap played (18-hole rounds with course rating)
  sg: Record<SgCategory | 'total', number> | null; // strokes gained per 18 against the tour
}

/** Finished rounds of the player, oldest first, as points for the trend charts. */
export function roundPoints(rounds: Round[]): RoundPoint[] {
  rounds = rounds.filter((r) => !isTeamRound(r)); // team scores (scramble, foursomes) are not the player's own
  return rounds
    .filter((r) => r.finishedAt && mine(r))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((r) => {
      const me = mine(r)!;
      const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
      if (!t.holesPlayed) return [];
      const f = 18 / t.holesPlayed;
      const entries = r.entries[me.id];
      const puttsKnown = entries.every((e, i) => e.putts != null || e.pickedUp || grossForHole(e, r.holes[i].par, 0) == null);
      const putts = entries.reduce((s, e) => s + (e.putts ?? 0), 0);
      const sg = roundsSg([r]);
      return [{
        round: r,
        toPar18: Math.round(t.toPar * f * 10) / 10,
        stableford18: t.stableford == null ? null : Math.round(t.stableford * f * 10) / 10,
        putts18: puttsKnown && putts > 0 ? Math.round(putts * f * 10) / 10 : null,
        differential: playedHandicap(r)?.differential ?? null,
        sg: sg && sg.holes >= 9 ? sg.per18 : null,
      }];
    });
}

/** Change over the rounds from a straight line through the values (null below 3 values). */
export function trendChange(values: (number | null)[]): { change: number; rounds: number } | null {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  return { change: Math.round(slope * (pts[n - 1][0] - pts[0][0]) * 10) / 10, rounds: n };
}

/** The strokes-gained area that improved most and the one that got worse most (at least 0.5 strokes). */
export function sgTrends(points: RoundPoint[]): { better: { c: SgCategory; change: number } | null; worse: { c: SgCategory; change: number } | null } {
  const t = SG_CATEGORIES.map((c) => ({ c, t: trendChange(points.map((p) => p.sg?.[c] ?? null)) })).filter((x) => x.t);
  const sorted = t.map((x) => ({ c: x.c, change: x.t!.change })).sort((a, b) => b.change - a.change);
  const better = sorted[0] && sorted[0].change >= 0.5 ? sorted[0] : null;
  const last = sorted[sorted.length - 1];
  const worse = last && last.change <= -0.5 ? last : null;
  return { better, worse };
}

// ---- per course ----

export interface CourseHoleStat {
  hole: RoundHole;
  played: number;
  avg: number; // average strokes
  toPar: number; // average over par
  best: number;
  notes: string[]; // e.g. "fairway mostly right", "2× water"
}

export interface CourseStat {
  courseName: string;
  rounds: Round[]; // newest first
  avgGross18: number | null;
  best18: { gross: number; round: Round } | null;
  holes: CourseHoleStat[];
  hardest: CourseHoleStat | null;
  easiest: CourseHoleStat | null;
}

/** Courses the player has finished rounds on, most played first (both OSM ids of one course count as one). */
export function playedCourses(rounds: Round[]): { courseName: string; rounds: number; lastAt: string }[] {
  const by = new Map<string, { courseName: string; rounds: number; lastAt: string }>();
  for (const r of rounds) {
    if (!r.finishedAt || !mine(r)) continue;
    const x = by.get(r.courseName) ?? { courseName: r.courseName, rounds: 0, lastAt: '' };
    x.rounds++;
    if (r.createdAt > x.lastAt) x.lastAt = r.createdAt;
    by.set(r.courseName, x);
  }
  return [...by.values()].sort((a, b) => b.rounds - a.rounds || b.lastAt.localeCompare(a.lastAt));
}

export function courseStats(rounds: Round[], courseName: string): CourseStat {
  const list = rounds.filter((r) => r.finishedAt && mine(r) && r.courseName === courseName).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // holes by label, in the order of the most recent round
  const holes = new Map<string, { hole: RoundHole; entries: HoleEntry[]; gross: number[] }>();
  const full: { gross: number; round: Round }[] = [];
  for (const r of list) {
    const me = mine(r)!;
    const received = handicapStrokes(r.holes, me.playingHandicap);
    r.holes.forEach((h, i) => {
      const e = r.entries[me.id][i];
      const g = grossForHole(e, h.par, received[i]);
      if (g == null) return;
      const x = holes.get(h.label) ?? { hole: h, entries: [], gross: [] };
      x.entries.push(e);
      x.gross.push(g);
      holes.set(h.label, x);
    });
    const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
    if (r.holes.length === 18 && t.holesPlayed === 18) full.push({ gross: t.gross, round: r });
  }
  const stats: CourseHoleStat[] = [...holes.values()]
    .sort((a, b) => a.hole.index - b.hole.index)
    .map(({ hole, entries, gross }) => {
      const avg = gross.reduce((s, g) => s + g, 0) / gross.length;
      return { hole, played: gross.length, avg: Math.round(avg * 10) / 10, toPar: Math.round((avg - hole.par) * 10) / 10, best: Math.min(...gross), notes: holeNotes(entries, hole.par) };
    });
  const ranked = stats.filter((s) => s.played > 0).sort((a, b) => b.toPar - a.toPar);
  return {
    courseName,
    rounds: list,
    avgGross18: full.length ? Math.round((full.reduce((s, x) => s + x.gross, 0) / full.length) * 10) / 10 : null,
    best18: full.length ? full.reduce((b, x) => (x.gross < b.gross ? x : b)) : null,
    holes: stats,
    hardest: ranked[0] ?? null,
    easiest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

/** What stands out on a hole over the rounds: tee-shot side, water and bunkers, three-putts. */
function holeNotes(entries: HoleEntry[], par: number): string[] {
  const out: string[] = [];
  const fw = entries.map((e) => e.fairway).filter((f) => f != null);
  if (par >= 4 && fw.length >= 2) {
    const left = fw.filter((f) => f === 'left').length;
    const right = fw.filter((f) => f === 'right').length;
    const hit = fw.length - left - right;
    if (hit / fw.length >= 0.67) out.push(tr('fairway hit', 'Fairway getroffen'));
    else if (left > right && left / fw.length >= 0.5) out.push(tr('tee shot mostly left', 'Abschlag meist links'));
    else if (right > left && right / fw.length >= 0.5) out.push(tr('tee shot mostly right', 'Abschlag meist rechts'));
  }
  const pens = entries.flatMap((e) => (e.detail ? e.detail.shots.filter((x) => x.penalty) : Array.from({ length: e.penalties }, () => null)));
  const water = pens.filter((x) => x?.penaltyKind === 'water').length;
  const ob = pens.filter((x) => x?.penaltyKind === 'ob').length;
  const lost = pens.filter((x) => x?.penaltyKind === 'lost').length;
  const unplayable = pens.filter((x) => x?.penaltyKind === 'unplayable').length;
  const other = pens.length - water - ob - lost - unplayable;
  if (water) out.push(tr(`${water}× water`, `${water}× Wasser`));
  if (ob) out.push(tr(`${ob}× out of bounds`, `${ob}× Aus`));
  if (lost) out.push(tr(`${lost}× lost ball`, `${lost}× Ball verloren`));
  if (unplayable) out.push(tr(`${unplayable}× unplayable`, `${unplayable}× unspielbar`));
  if (other) out.push(tr(`${other}× penalty`, `${other}× Strafschlag`));
  const bunker = entries.filter((e) => e.greensideBunker || e.detail?.shots.some((x) => x.lie === 'bunker')).length;
  if (bunker >= 2) out.push(tr(`${bunker}× bunker`, `${bunker}× Bunker`));
  const three = entries.filter((e) => (e.putts ?? 0) >= 3).length;
  if (three >= 2) out.push(tr(`${three}× three-putt`, `${three}× Dreiputt`));
  return out;
}

// ---- personal bests ----

export interface Best {
  key: string;
  label: string;
  value: string;
  round: Round;
}

export function personalBests(rounds: Round[]): Best[] {
  rounds = rounds.filter((r) => !isTeamRound(r)); // team scores (scramble, foursomes) are not the player's own
  const out: Best[] = [];
  const done = rounds.filter((r) => r.finishedAt && mine(r)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pick = <T,>(xs: { v: T; r: Round }[], better: (a: T, b: T) => boolean) => xs.reduce<{ v: T; r: Round } | null>((b, x) => (!b || better(x.v, b.v) ? x : b), null);
  const full = done.flatMap((r) => {
    const me = mine(r)!;
    const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
    return r.holes.length === 18 && t.holesPlayed === 18 ? [{ r, t, me }] : [];
  });
  const lowest = pick(full.map((x) => ({ v: x.t.gross, r: x.r })), (a, b) => a < b);
  if (lowest) out.push({ key: 'gross', label: tr('Best round (18 holes)', 'Beste Runde (18 Loch)'), value: tr(`${lowest.v} strokes`, `${lowest.v} Schläge`), round: lowest.r });
  const nines = done.flatMap((r) => {
    const me = mine(r)!;
    const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
    return r.holes.length === 9 && t.holesPlayed === 9 ? [{ v: t.gross, r }] : [];
  });
  const low9 = pick(nines, (a, b) => a < b);
  if (low9) out.push({ key: 'gross9', label: tr('Best round (9 holes)', 'Beste Runde (9 Loch)'), value: tr(`${low9.v} strokes`, `${low9.v} Schläge`), round: low9.r });
  const pts = pick(full.filter((x) => x.t.stableford != null).map((x) => ({ v: x.t.stableford!, r: x.r })), (a, b) => a > b);
  if (pts) out.push({ key: 'stableford', label: tr('Most Stableford points', 'Meiste Stableford-Punkte'), value: tr(`${pts.v} pts`, `${pts.v} Punkte`), round: pts.r });
  const diff = pick(done.flatMap((r) => {
    const p = playedHandicap(r);
    return p ? [{ v: p.differential, r }] : [];
  }), (a, b) => a < b);
  if (diff) out.push({ key: 'hcp', label: tr('Best handicap played', 'Bestes gespieltes Handicap'), value: diff.v.toFixed(1), round: diff.r });
  const putts = pick(full.filter((x) => x.r.entries[x.me.id].every((e) => e.putts != null || e.pickedUp)).map((x) => ({ v: x.r.entries[x.me.id].reduce((s, e) => s + (e.putts ?? 0), 0), r: x.r })), (a, b) => a < b);
  if (putts) out.push({ key: 'putts', label: tr('Fewest putts', 'Wenigste Putts'), value: tr(`${putts.v} putts`, `${putts.v} Putts`), round: putts.r });
  const birdies = pick(done.map((r) => {
    const me = mine(r)!;
    return { v: r.holes.filter((h, i) => { const s = r.entries[me.id][i].strokes; return s != null && !r.entries[me.id][i].pickedUp && s < h.par; }).length, r };
  }), (a, b) => a > b);
  if (birdies && birdies.v > 0) out.push({ key: 'birdies', label: tr('Most birdies in a round', 'Meiste Birdies in einer Runde'), value: String(birdies.v), round: birdies.r });
  // longest drive: driver from the tee, no penalty, measured to where the next shot was played
  const drives = done.flatMap((r) => {
    const me = mine(r)!;
    return r.entries[me.id].flatMap((e) => {
      const d = e.detail;
      if (!d || !d.shots.length || d.shots[0].club !== 'Dr' || d.shots[0].penalty) return [];
      const m = shotLengths(d)[0];
      return m != null ? [{ v: Math.round(m), r }] : [];
    });
  });
  const drive = pick(drives, (a, b) => a > b);
  if (drive) out.push({ key: 'drive', label: tr('Longest drive', 'Längster Drive'), value: `${drive.v} m`, round: drive.r });
  // first eagle or better (and hole in one)
  for (const r of done) {
    const me = mine(r)!;
    const i = r.holes.findIndex((h, k) => { const s = r.entries[me.id][k].strokes; return s != null && !r.entries[me.id][k].pickedUp && s <= h.par - 2; });
    if (i >= 0) {
      const s = r.entries[me.id][i].strokes!;
      out.push({ key: 'eagle', label: s === 1 ? tr('Hole in one', 'Ass') : tr('First eagle', 'Erstes Eagle'), value: tr(`hole ${r.holes[i].label}`, `Loch ${r.holes[i].label}`), round: r });
      break;
    }
  }
  return out;
}

export interface Career {
  rounds: number;
  holes: number; // holes with a score
  strokes: number;
  mix: { eaglePlus: number; birdie: number; par: number; bogey: number; doublePlus: number }; // number of holes
  toParPer18: number | null;
}

/** The player's record over all finished rounds (record tab): what was played and the results per hole. */
export function career(rounds: Round[]): Career {
  rounds = rounds.filter((r) => !isTeamRound(r)); // team scores (scramble, foursomes) are not the player's own
  const c: Career = { rounds: 0, holes: 0, strokes: 0, mix: { eaglePlus: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0 }, toParPer18: null };
  let toPar = 0;
  for (const r of rounds) {
    const me = mine(r);
    if (!r.finishedAt || !me) continue;
    const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
    if (!t.holesPlayed) continue;
    c.rounds++;
    const received = handicapStrokes(r.holes, me.playingHandicap);
    r.holes.forEach((h, i) => {
      const e = r.entries[me.id][i];
      const g = grossForHole(e, h.par, received[i]); // a picked-up hole counts as net double bogey
      if (g == null) return;
      c.holes++;
      c.strokes += g;
      toPar += g - h.par;
      if (e.pickedUp) return c.mix.doublePlus++;
      const d = g - h.par;
      if (d <= -2) c.mix.eaglePlus++;
      else if (d === -1) c.mix.birdie++;
      else if (d === 0) c.mix.par++;
      else if (d === 1) c.mix.bogey++;
      else c.mix.doublePlus++;
    });
  }
  if (c.holes) c.toParPer18 = Math.round((toPar / c.holes) * 18 * 10) / 10;
  return c;
}
