import type { Club, Round } from '../types';
import { greenInRegulation, grossForHole, handicapStrokes, stablefordPoints } from './scoring';
import { BAG, firstPuttM, shotLengths } from './shots';

// Analysis across rounds (feature 005): the player's ("me") key figures, tendencies, club distances
// and the focus areas compared with the next better handicap band – the input for training plans (GOL-27).

export interface Rate {
  n: number; // successes
  of: number; // chances
}
export const pct = (r: Rate): number | null => (r.of ? Math.round((r.n / r.of) * 100) : null);

export interface ClubStat {
  club: Club;
  shots: number;
  avg: number;
  median: number;
  min: number;
  max: number;
}

export interface Analysis {
  rounds: number;
  holes: number;
  per18: (v: number) => number; // scales a total to 18 holes
  toParPer18: number | null;
  stablefordPer18: number | null;
  scoreMix: { eaglePlus: number; birdie: number; par: number; bogey: number; doublePlus: number }; // share of holes in %
  byPar: Record<3 | 4 | 5, number | null>; // average strokes over par
  fairways: Rate;
  missLeft: Rate;
  missRight: Rate;
  gir: Rate;
  puttsPer18: number | null;
  puttsPerGir: number | null;
  onePutts: Rate;
  threePutts: Rate;
  scrambling: Rate; // par or better after missing the green
  sandSaves: Rate;
  penaltiesPer18: number | null;
  clubs: ClubStat[];
  puttsByFirstPutt: { label: string; avgPutts: number | null; holes: number }[];
  handicap: number | null; // latest playing handicap
}

const PUTT_BUCKETS: { label: string; max: number }[] = [
  { label: '< 1.5 m', max: 1.5 },
  { label: '1.5–3 m', max: 3 },
  { label: '3–6 m', max: 6 },
  { label: '6–10 m', max: 10 },
  { label: '> 10 m', max: Infinity },
];

export function analyse(rounds: Round[]): Analysis {
  let holes = 0;
  let toPar = 0;
  let pts = 0;
  let ptsHoles = 0;
  const mix = { eaglePlus: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0 };
  const parSum: Record<3 | 4 | 5, { over: number; n: number }> = { 3: { over: 0, n: 0 }, 4: { over: 0, n: 0 }, 5: { over: 0, n: 0 } };
  const fw: Rate = { n: 0, of: 0 };
  const left: Rate = { n: 0, of: 0 };
  const right: Rate = { n: 0, of: 0 };
  const gir: Rate = { n: 0, of: 0 };
  let putts = 0;
  let puttHoles = 0;
  let puttsOnGir = 0;
  const one: Rate = { n: 0, of: 0 };
  const three: Rate = { n: 0, of: 0 };
  const scr: Rate = { n: 0, of: 0 };
  const sand: Rate = { n: 0, of: 0 };
  let penalties = 0;
  const clubLengths = new Map<Club, number[]>();
  const buckets = PUTT_BUCKETS.map(() => ({ putts: 0, holes: 0 }));
  let handicap: number | null = null;

  for (const r of rounds) {
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    handicap = me.playingHandicap ?? handicap;
    const received = handicapStrokes(r.holes, me.playingHandicap);
    r.holes.forEach((h, i) => {
      const e = r.entries[me.id][i];
      const gross = grossForHole(e, h.par, received[i]);
      if (gross == null || !h.par) return;
      holes++;
      const over = gross - h.par;
      toPar += over;
      if (me.playingHandicap != null) {
        pts += stablefordPoints(e, h.par, received[i]) ?? 0;
        ptsHoles++;
      }
      if (e.pickedUp || over >= 2) mix.doublePlus++;
      else if (over === 1) mix.bogey++;
      else if (over === 0) mix.par++;
      else if (over === -1) mix.birdie++;
      else mix.eaglePlus++;
      if (h.par === 3 || h.par === 4 || h.par === 5) {
        parSum[h.par].over += over;
        parSum[h.par].n++;
      }
      if (h.par >= 4 && e.fairway != null) {
        fw.of++;
        left.of++;
        right.of++;
        if (e.fairway === 'hit') fw.n++;
        if (e.fairway === 'left') left.n++;
        if (e.fairway === 'right') right.n++;
      }
      const g = greenInRegulation(e, h.par);
      if (g != null) {
        gir.of++;
        if (g) {
          gir.n++;
          puttsOnGir += e.putts ?? 0;
        } else if (!e.pickedUp) {
          scr.of++;
          if (over <= 0) scr.n++;
        }
      }
      if (e.putts != null && !e.pickedUp) {
        putts += e.putts;
        puttHoles++;
        if (e.putts > 0) {
          one.of++;
          three.of++;
          if (e.putts === 1) one.n++;
          if (e.putts >= 3) three.n++;
        }
      }
      if (e.greensideBunker) {
        sand.of++;
        if (e.upAndDown) sand.n++;
      }
      penalties += e.penalties;
      // Detailed tracking: club distances and putts by first-putt length.
      const d = e.detail;
      if (d) {
        const lengths = shotLengths(d);
        d.shots.forEach((s, k) => {
          const len = lengths[k];
          if (!s.club || len == null || s.penalty || s.lie === 'recovery') return;
          if (s.kind && s.kind !== 'full') return; // chips, pitches, punches are not the club's full distance
          clubLengths.set(s.club, [...(clubLengths.get(s.club) ?? []), len]);
        });
        const first = firstPuttM(d);
        if (first != null && e.putts != null && e.putts > 0) {
          const b = PUTT_BUCKETS.findIndex((x) => first < x.max);
          buckets[b].putts += e.putts;
          buckets[b].holes++;
        }
      }
    });
  }

  const per18 = (v: number) => (holes ? Math.round((v / holes) * 18 * 10) / 10 : 0);
  const share = (n: number) => (holes ? Math.round((n / holes) * 100) : 0);
  const clubs: ClubStat[] = BAG.filter((b) => clubLengths.has(b.club)).map((b) => {
    const xs = clubLengths.get(b.club)!.slice().sort((a, c) => a - c);
    const mid = xs.length >> 1;
    return {
      club: b.club,
      shots: xs.length,
      avg: Math.round(xs.reduce((s, x) => s + x, 0) / xs.length),
      median: Math.round(xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2),
      min: Math.round(xs[0]),
      max: Math.round(xs[xs.length - 1]),
    };
  });
  return {
    rounds: rounds.length,
    holes,
    per18,
    toParPer18: holes ? per18(toPar) : null,
    stablefordPer18: ptsHoles ? Math.round((pts / ptsHoles) * 18 * 10) / 10 : null,
    scoreMix: { eaglePlus: share(mix.eaglePlus), birdie: share(mix.birdie), par: share(mix.par), bogey: share(mix.bogey), doublePlus: share(mix.doublePlus) },
    byPar: {
      3: parSum[3].n ? Math.round((parSum[3].over / parSum[3].n) * 100) / 100 : null,
      4: parSum[4].n ? Math.round((parSum[4].over / parSum[4].n) * 100) / 100 : null,
      5: parSum[5].n ? Math.round((parSum[5].over / parSum[5].n) * 100) / 100 : null,
    },
    fairways: fw,
    missLeft: left,
    missRight: right,
    gir,
    puttsPer18: puttHoles ? Math.round((putts / puttHoles) * 18 * 10) / 10 : null,
    puttsPerGir: gir.n ? Math.round((puttsOnGir / gir.n) * 100) / 100 : null,
    onePutts: one,
    threePutts: three,
    scrambling: scr,
    sandSaves: sand,
    penaltiesPer18: holes ? per18(penalties) : null,
    clubs,
    puttsByFirstPutt: PUTT_BUCKETS.map((b, k) => ({ label: b.label, holes: buckets[k].holes, avgPutts: buckets[k].holes ? Math.round((buckets[k].putts / buckets[k].holes) * 100) / 100 : null })),
    handicap,
  };
}

/** Carry per club from tracked full shots: median length minus typical roll (≈ 7 %), from 3 shots on. */
export function trackedCarry(rounds: Round[], minShots = 3): Map<Club, { carry: number; shots: number }> {
  return new Map(
    analyse(rounds.filter((r) => r.finishedAt))
      .clubs.filter((c) => c.shots >= minShots)
      .map((c) => [c.club, { carry: Math.round(c.median * 0.93), shots: c.shots }]),
  );
}

/** Clubs whose saved carry differs from the tracked one by ≥ 5 m (or has none) – to review in "My bag". */
export function carryToReview(rounds: Round[], bag: { club: Club; carry: number }[] | null): Club[] {
  const t = trackedCarry(rounds);
  return [...t.entries()].filter(([club, v]) => {
    const own = bag?.find((b) => b.club === club)?.carry;
    return own == null || Math.abs(own - v.carry) >= 5;
  }).map(([club]) => club);
}

/** The player's own club distances replace the standard bag once a club has enough shots. */
export function playerBag(rounds: Round[], minShots = 3): { club: Club; m: number }[] {
  const own = new Map(analyse(rounds).clubs.filter((c) => c.shots >= minShots).map((c) => [c.club, c.median]));
  return BAG.map((b) => ({ club: b.club, m: own.get(b.club) ?? b.m }));
}

// ---- Focus areas: compare with the next better handicap band ----

/** Typical values per handicap band (approximate amateur averages – to be confirmed by Chris). */
export const BANDS: { label: string; maxHcp: number; fir: number; gir: number; putts: number; scrambling: number; threePutts: number; penalties: number }[] = [
  { label: 'hcp 0–5', maxHcp: 5, fir: 55, gir: 50, putts: 30.5, scrambling: 45, threePutts: 5, penalties: 0.5 },
  { label: 'hcp 6–12', maxHcp: 12, fir: 48, gir: 35, putts: 32, scrambling: 30, threePutts: 9, penalties: 1 },
  { label: 'hcp 13–20', maxHcp: 20, fir: 42, gir: 22, putts: 33.5, scrambling: 20, threePutts: 13, penalties: 1.8 },
  { label: 'hcp 21–28', maxHcp: 28, fir: 36, gir: 12, putts: 35, scrambling: 12, threePutts: 17, penalties: 2.8 },
  { label: 'hcp 29+', maxHcp: 99, fir: 30, gir: 6, putts: 36.5, scrambling: 7, threePutts: 22, penalties: 4 },
];

export interface Focus {
  area: 'Driving' | 'Approach' | 'Short game' | 'Putting' | 'Course management';
  metric: string;
  yours: string;
  target: string;
  gap: number; // 0..1+, share of the distance between two bands
}

/** Up to three focus areas: where the player is furthest from the next better band. */
export function focusAreas(a: Analysis): { band: string; target: string; focus: Focus[] } | null {
  if (a.handicap == null || a.holes < 9) return null;
  const k = BANDS.findIndex((b) => a.handicap! <= b.maxHcp);
  const own = BANDS[k];
  const goal = BANDS[Math.max(0, k - 1)]; // best band: keep its own values as the goal
  // Gaps are measured in "band steps", so percentages and putts are comparable.
  const neighbour = k > 0 ? BANDS[k - 1] : BANDS[1];
  const step = (key: 'fir' | 'gir' | 'scrambling' | 'putts' | 'threePutts' | 'penalties') => Math.abs(own[key] - neighbour[key]) || 1;
  const list: Focus[] = [];
  const higherBetter = (area: Focus['area'], metric: string, v: number | null, key: 'fir' | 'gir' | 'scrambling') => {
    if (v == null) return;
    if (v < goal[key]) list.push({ area, metric, yours: `${v}%`, target: `${goal[key]}%`, gap: (goal[key] - v) / step(key) });
  };
  const lowerBetter = (area: Focus['area'], metric: string, v: number | null, key: 'putts' | 'threePutts' | 'penalties', unit: string) => {
    if (v == null) return;
    if (v > goal[key]) list.push({ area, metric, yours: `${v}${unit}`, target: `${goal[key]}${unit}`, gap: (v - goal[key]) / step(key) });
  };
  higherBetter('Driving', 'Fairways hit', pct(a.fairways), 'fir');
  higherBetter('Approach', 'Greens in regulation', pct(a.gir), 'gir');
  higherBetter('Short game', 'Scrambling (par after missing the green)', pct(a.scrambling), 'scrambling');
  lowerBetter('Putting', 'Putts per round', a.puttsPer18, 'putts', '');
  lowerBetter('Putting', '3-putts', pct(a.threePutts), 'threePutts', '%');
  lowerBetter('Course management', 'Penalty strokes per round', a.penaltiesPer18, 'penalties', '');
  list.sort((x, y) => y.gap - x.gap);
  // One entry per area, at most three.
  const seen = new Set<string>();
  const focus = list.filter((f) => (seen.has(f.area) ? false : (seen.add(f.area), true))).slice(0, 3);
  return { band: own.label, target: goal.label, focus };
}
