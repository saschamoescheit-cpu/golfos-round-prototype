import type { Round } from '../types';
import { distanceM } from './geo';
import { isTeamRound } from './games';
import { firstPuttM } from './shots';

// The putter as a club (Sascha 24.10.2026: "how many putts from how many metres go in, with which probability, or
// from which distance the 3-putts come"): per distance band how often a putt goes in, and per length of the first putt
// how often the hole takes one, two or three and more putts.

export interface PuttBand {
  label: string; // "1–2 m"
  from: number;
  to: number; // Infinity for the last band
  /** putts started in this band and how many went in */
  tried: number;
  holed: number;
  /** holes whose first putt started in this band: one, two, three or more putts */
  holes: number;
  one: number;
  two: number;
  three: number;
}

export interface PuttStats {
  bands: PuttBand[];
  /** putts with a known start (placed on the green or the first one from the shots) */
  putts: number;
  holes: number;
  /** the longest band in which at least half the putts go in (≥ 3 putts there) */
  halfIn: PuttBand | null;
  /** where the 3-putts start (the lower edge of that band), and how often they come from there on */
  threeFrom: { m: number; of: number; n: number } | null;
}

const EDGES = [0, 1, 2, 3, 5, 8, 12, Infinity];

export function puttStats(rounds: Round[]): PuttStats {
  const bands: PuttBand[] = EDGES.slice(0, -1).map((from, k) => {
    const to = EDGES[k + 1];
    return { label: to === Infinity ? `> ${from} m` : `${from}–${to} m`, from, to, tried: 0, holed: 0, holes: 0, one: 0, two: 0, three: 0 };
  });
  const bandOf = (m: number) => bands.find((b) => m >= b.from && m < b.to)!;
  const firsts: { m: number; putts: number }[] = [];
  let putts = 0;
  for (const r of rounds) {
    if (isTeamRound(r)) continue; // a team score is not the player's own putting
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    for (const e of r.entries[me.id] ?? []) {
      const n = e.putts ?? 0;
      if (!n || e.pickedUp) continue;
      // every putt from where it started: the balls placed on the green, else only the first one from the shots
      const pin = e.puttsAt?.pin ?? e.detail?.pin ?? null;
      const balls = e.puttsAt?.balls ?? [];
      const starts: number[] = pin && balls.length ? balls.slice(0, n).map((b) => distanceM(b, pin)) : [];
      const first = starts[0] ?? (e.detail ? firstPuttM(e.detail) : null);
      if (first == null) continue;
      if (!starts.length) starts.push(first);
      starts.forEach((m, k) => {
        const b = bandOf(m);
        b.tried++;
        if (k === n - 1) b.holed++; // the last putt of the hole went in
        putts++;
      });
      const fb = bandOf(first);
      fb.holes++;
      if (n === 1) fb.one++;
      else if (n === 2) fb.two++;
      else fb.three++;
      firsts.push({ m: first, putts: n });
    }
  }
  const halfIn = [...bands].reverse().find((b) => b.tried >= 3 && b.holed / b.tried >= 0.5) ?? null;
  // where the 3-putts start: the shortest band with a 3-putt from which on at least two of them make a tenth of the
  // holes – one odd short 3-putt alone does not set it (your rounds 23.10.2026: from 5 m, 2 of 15)
  const startBand =
    bands.find((b) => {
      if (!b.three || b.holes < 2) return false; // a band with a single odd hole does not count
      const on = firsts.filter((f) => f.m >= b.from);
      const n3 = on.filter((f) => f.putts >= 3).length;
      return n3 >= 2 && n3 / on.length >= 0.1;
    }) ?? null;
  const m = startBand ? startBand.from : null;
  const from = m == null ? [] : firsts.filter((f) => f.m >= m);
  return {
    bands,
    putts,
    holes: firsts.length,
    halfIn,
    threeFrom: m == null ? null : { m, of: from.length, n: from.filter((f) => f.putts >= 3).length },
  };
}
