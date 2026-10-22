import type { HoleEntry, Round, RoundHole } from '../types';

/**
 * Handicap strokes per hole: sort the round's holes by stroke index (ascending)
 * and hand out the playing handicap one stroke at a time, round-robin.
 * Example: 18 holes, handicap 20 → every hole 1, stroke index 1 and 2 get a second.
 */
export function handicapStrokes(holes: RoundHole[], playingHandicap: number | null): number[] {
  const result = holes.map(() => 0);
  if (playingHandicap == null || playingHandicap === 0 || holes.length === 0) return result;
  const order = holes
    .map((h, i) => ({ i, si: h.strokeIndex }))
    .sort((a, b) => a.si - b.si || a.i - b.i)
    .map((x) => x.i);
  // A plus handicap (negative) gives strokes back, starting on the easiest hole (highest stroke index).
  if (playingHandicap < 0) {
    for (let s = 0; s < -playingHandicap; s++) result[order[order.length - 1 - (s % order.length)]] -= 1;
    return result;
  }
  for (let s = 0; s < playingHandicap; s++) result[order[s % order.length]] += 1;
  return result;
}

/** Playing handicap as golfers write it: 12, or "+2" for a plus handicap. */
export const fmtHcp = (v: number): string => (v < 0 ? `+${-v}` : String(v));

/**
 * Quick tracking pre-fills par: when the player leaves a hole (or finishes the round on it) without touching the
 * score, par is written for every player. Holes with recorded shots are left alone – their score comes from the
 * shots and putts, and a guessed par would hide an unfinished hole.
 */
export function commitParAt(r: Round, index: number): Round {
  const hole = r.holes[index];
  if (!hole || !(hole.par > 0)) return r;
  const entries = { ...r.entries };
  for (const p of r.players) {
    const e = entries[p.id][index];
    if (e.strokes == null && !e.pickedUp && !(e.detail && e.detail.shots.length > 0)) {
      const list = entries[p.id].slice();
      list[index] = { ...e, strokes: hole.par };
      entries[p.id] = list;
    }
  }
  return { ...r, entries };
}

/** Gross value written for a picked-up hole: net double bogey. */
export function netDoubleBogey(par: number, strokesReceived: number): number {
  return par + 2 + strokesReceived;
}

export function grossForHole(entry: HoleEntry, par: number, strokesReceived: number): number | null {
  if (entry.pickedUp) return netDoubleBogey(par, strokesReceived);
  return entry.strokes;
}

/** Stableford points: net par = 2, one more per stroke better, minimum 0. */
export function stablefordPoints(entry: HoleEntry, par: number, strokesReceived: number): number | null {
  if (entry.pickedUp) return 0;
  if (entry.strokes == null) return null;
  return Math.max(0, par + strokesReceived - entry.strokes + 2);
}

/** Green in regulation: on the green in par − 2 strokes. Needs strokes and putts. */
export function greenInRegulation(entry: HoleEntry, par: number): boolean | null {
  if (entry.pickedUp || entry.strokes == null || entry.putts == null) return null;
  return entry.strokes - entry.putts <= par - 2;
}

export interface PlayerTotals {
  gross: number;
  stableford: number | null; // null when the player has no playing handicap
  toPar: number; // gross minus par of played holes
  holesPlayed: number;
}

export function playerTotals(
  holes: RoundHole[],
  entries: HoleEntry[],
  playingHandicap: number | null,
): PlayerTotals {
  const received = handicapStrokes(holes, playingHandicap);
  let gross = 0;
  let points = 0;
  let parPlayed = 0;
  let played = 0;
  holes.forEach((h, i) => {
    const g = grossForHole(entries[i], h.par, received[i]);
    if (g == null) return;
    played += 1;
    gross += g;
    parPlayed += h.par;
    points += stablefordPoints(entries[i], h.par, received[i]) ?? 0;
  });
  return {
    gross,
    stableford: playingHandicap == null ? null : points,
    toPar: gross - parPlayed,
    holesPlayed: played,
  };
}

export interface RoundStats {
  putts: number;
  fairwaysHit: number;
  fairwaysPossible: number; // par 4 and 5 with a fairway entry
  gir: number;
  girPossible: number;
  penalties: number;
  sandSaves: number;
  bunkerHoles: number;
}

export function roundStats(holes: RoundHole[], entries: HoleEntry[]): RoundStats {
  const s: RoundStats = {
    putts: 0, fairwaysHit: 0, fairwaysPossible: 0, gir: 0, girPossible: 0,
    penalties: 0, sandSaves: 0, bunkerHoles: 0,
  };
  holes.forEach((h, i) => {
    const e = entries[i];
    if (e.putts != null) s.putts += e.putts;
    if (h.par >= 4 && e.fairway != null) {
      s.fairwaysPossible += 1;
      if (e.fairway === 'hit') s.fairwaysHit += 1;
    }
    const gir = greenInRegulation(e, h.par);
    if (gir != null) {
      s.girPossible += 1;
      if (gir) s.gir += 1;
    }
    s.penalties += e.penalties;
    if (e.greensideBunker) {
      s.bunkerHoles += 1;
      if (e.upAndDown) s.sandSaves += 1;
    }
  });
  return s;
}

/** Detailed tracking: the shots are found in the GPS track and checked after the round (quick tracking: score only). */
export const checksShots = (r: Pick<Round, 'capture'>): boolean => r.capture !== 'score';

/** A round finished now. Without a choice it waits under "check & sign" (Sascha 22.10.2026: "at the end of the round
 *  'check & sign later' was missing – I had to change the state by hand"); a team round has no own shots: saved only. */
export function finishRound(r: Round, team: boolean): Round {
  return { ...r, finishedAt: new Date().toISOString(), capture: r.capture ?? (team ? 'score' : 'full') };
}

export function emptyEntry(): HoleEntry {
  return {
    strokes: null, pickedUp: false, putts: null, fairway: null,
    penalties: 0, greensideBunker: false, upAndDown: null,
  };
}

/**
 * The 18-hole playing handicap of a player in a round: a 9-hole round carries the 9-hole value (about half, right
 * for Stableford); the caddie's spread and the strokes-gained comparison group work with the 18-hole value.
 */
export function playing18(holeCount: number, playingHandicap: number | null): number | null {
  return playingHandicap == null ? null : holeCount <= 9 ? playingHandicap * 2 : playingHandicap;
}
