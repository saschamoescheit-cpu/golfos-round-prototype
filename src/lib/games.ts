import type { Round } from '../types';
import { grossForHole, handicapStrokes, stablefordPoints } from './scoring';
import { tr } from './i18n';

// Game modes and scoring of a round (Sascha 14.10.2026, as in Hole19) and the live leaderboard of the flight on this
// phone: everyone for himself (stroke play gross/net or Stableford), match play one against one, four-ball better
// ball (two teams of two), scramble and foursomes. The score of every player is entered on this phone; a leaderboard
// across phones needs a server (feature 020).
//
// Scramble and foursomes have no single scores: each team plays one ball. The round then holds the teams as its
// "players" (one score per hole, one row on the scorecard), with the team handicap from the players' handicaps.

export type GameMode = 'single' | 'match' | 'fourball' | 'scramble' | 'foursome';
export type Scoring = 'stroke' | 'net' | 'stableford';
export interface RoundFormat {
  mode: GameMode;
  scoring: Scoring;
}
export const DEFAULT_FORMAT: RoundFormat = { mode: 'single', scoring: 'stroke' };

export const modeName = (m: GameMode): string =>
  ({
    single: tr('Stroke play – everyone for himself', 'Einzel – jeder für sich'),
    match: tr('Match play – one against one', 'Lochspiel – einer gegen einen'),
    fourball: tr('Four-ball – best ball of two', 'Vierball – Bestball zu zweit'),
    scramble: 'Scramble',
    foursome: tr('Foursomes – alternate shot', 'Vierer – abwechselnd ein Ball'),
  })[m];
export const scoringName = (s: Scoring): string => ({ stroke: tr('Stroke play gross', 'Zählspiel brutto'), net: tr('Stroke play net', 'Zählspiel netto'), stableford: 'Stableford' })[s];

/** Which modes fit the number of players: match play needs two, four-ball four, foursomes two or four, scramble 2–4. */
export const modesFor = (players: number): GameMode[] =>
  players === 2 ? ['single', 'match', 'scramble', 'foursome'] : players === 3 ? ['single', 'scramble'] : players === 4 ? ['single', 'fourball', 'scramble', 'foursome'] : ['single'];

/** Scramble and foursomes: one ball per team, no single scores. */
export const isTeamMode = (m: GameMode | undefined): boolean => m === 'scramble' || m === 'foursome';
/** A round played as a team (its scores are not the player's own – kept out of his stats and handicap). */
export const isTeamRound = (r: Pick<Round, 'format'>): boolean => isTeamMode(r.format?.mode);

/** The teams by player position: four players = 1 & 2 against 3 & 4, else one team. */
export function teamsOf(mode: GameMode, players: number): number[][] {
  const all = Array.from({ length: players }, (_, k) => k);
  return players === 4 && (mode === 'scramble' || mode === 'foursome' || mode === 'fourball') ? [[0, 1], [2, 3]] : [all];
}

/**
 * Team handicap (WHS recommendations): foursomes 50 % of the combined playing handicaps; scramble weighted from the
 * lowest – 2 players 35/15 %, 3 players 30/20/10 %, 4 players 25/20/15/10 %. Without every handicap: gross only.
 */
export function teamHandicap(mode: GameMode, hcps: (number | null)[]): number | null {
  if (hcps.some((h) => h == null)) return null;
  const hs = (hcps as number[]).slice().sort((a, b) => a - b);
  if (mode === 'foursome') return Math.round(hs.reduce((s, h) => s + h, 0) * 0.5);
  const w = hs.length === 2 ? [0.35, 0.15] : hs.length === 3 ? [0.3, 0.2, 0.1] : [0.25, 0.2, 0.15, 0.1];
  return Math.round(hs.reduce((s, h, k) => s + h * (w[k] ?? 0), 0));
}

export interface BoardRow {
  key: string;
  name: string;
  value: string; // "+3", "18 Pkt.", "2 auf"
  thru: number; // holes played
  rank: number;
}
export interface Board {
  title: string;
  rows: BoardRow[];
  status: string | null; // match: "Anna 2 up after 7"
}

const toParText = (v: number): string => (v === 0 ? 'Par' : v > 0 ? `+${v}` : String(v));

/** Per hole for one player: gross, net and Stableford points (null = no score yet). */
function holeValues(round: Round, playerId: string) {
  const p = round.players.find((x) => x.id === playerId)!;
  const received = handicapStrokes(round.holes, p.playingHandicap);
  return round.holes.map((h, i) => {
    const e = round.entries[playerId][i];
    const gross = grossForHole(e, h.par, received[i]);
    if (gross == null) return null;
    return { gross, net: gross - received[i], par: h.par, points: p.playingHandicap == null ? null : stablefordPoints(e, h.par, received[i]) };
  });
}

/** Lower is better for stroke play, higher for Stableford; null = no value. */
function holeScore(v: ReturnType<typeof holeValues>[number], scoring: Scoring): number | null {
  if (!v) return null;
  return scoring === 'stableford' ? v.points : scoring === 'net' ? v.net - v.par : v.gross - v.par;
}

function rank<T extends { sort: number | null }>(rows: T[], higherBetter: boolean): (T & { rank: number })[] {
  const sorted = rows.slice().sort((a, b) => (a.sort == null ? 1 : b.sort == null ? -1 : higherBetter ? b.sort - a.sort : a.sort - b.sort));
  return sorted.map((r) => ({ ...r, rank: r.sort == null ? sorted.length : sorted.findIndex((x) => x.sort === r.sort) + 1 }));
}

/** Match status between two sides from per-hole results (+1 = side A won the hole, -1 = side B, 0 = halved). */
function matchStatus(results: (number | null)[], nameA: string, nameB: string, holes: number): { text: string; a: number; b: number } {
  let diff = 0;
  let played = 0;
  for (const r of results) {
    if (r == null) continue;
    played++;
    diff += r;
    const left = holes - played;
    if (Math.abs(diff) > left) {
      const w = diff > 0 ? nameA : nameB;
      return { text: left === 0 ? tr(`${w} wins ${Math.abs(diff)} up`, `${w} gewinnt ${Math.abs(diff)} auf`) : tr(`${w} wins ${Math.abs(diff)}&${left}`, `${w} gewinnt ${Math.abs(diff)}&${left}`), a: diff, b: -diff };
    }
  }
  if (!played) return { text: tr('Not started', 'Noch nicht begonnen'), a: 0, b: 0 };
  if (diff === 0) return { text: tr(`All square after ${played}`, `All Square nach ${played}`), a: 0, b: 0 };
  return { text: tr(`${diff > 0 ? nameA : nameB} ${Math.abs(diff)} up after ${played}`, `${diff > 0 ? nameA : nameB} ${Math.abs(diff)} auf nach ${played}`), a: diff, b: -diff };
}

const holeWinner = (a: number | null, b: number | null, higherBetter: boolean): number | null => (a == null || b == null ? null : a === b ? 0 : (higherBetter ? a > b : a < b) ? 1 : -1);

export function leaderboard(round: Round, format: RoundFormat = round.format ?? DEFAULT_FORMAT): Board {
  const scoring = format.scoring;
  const hb = scoring === 'stableford';
  const unit = (v: number) => (hb ? tr(`${v} pts`, `${v} Pkt.`) : toParText(v));
  const vals = Object.fromEntries(round.players.map((p) => [p.id, holeValues(round, p.id)]));
  // team rounds: the round's players are the teams – ranked like single players, two teams also as a match
  if (isTeamMode(format.mode)) {
    const rows = rank(
      round.players.map((p) => {
        const xs = vals[p.id].map((v) => holeScore(v, scoring)).filter((v): v is number => v != null);
        return { key: p.id, name: p.name, sort: xs.length ? xs.reduce((s, v) => s + v, 0) : null, thru: xs.length };
      }),
      hb,
    );
    let status: string | null = null;
    if (round.players.length === 2) {
      const [a, b] = round.players;
      const sc = scoring === 'stroke' ? 'net' : scoring;
      status = matchStatus(round.holes.map((_, i) => holeWinner(holeScore(vals[a.id][i], sc), holeScore(vals[b.id][i], sc), hb)), a.name, b.name, round.holes.length).text;
    }
    return { title: `${modeName(format.mode)} · ${scoringName(scoring)}`, status, rows: rows.map((r) => ({ key: r.key, name: r.name, value: r.sort == null ? '–' : unit(r.sort), thru: r.thru, rank: r.rank })) };
  }
  const mode = modesFor(round.players.length).includes(format.mode) ? format.mode : 'single';

  if (mode === 'match') {
    const [a, b] = round.players;
    // match play is played net: each player's own strokes on the hole (the difference counts)
    const res = round.holes.map((_, i) => holeWinner(holeScore(vals[a.id][i], scoring === 'stroke' ? 'net' : scoring), holeScore(vals[b.id][i], scoring === 'stroke' ? 'net' : scoring), hb));
    const st = matchStatus(res, a.name, b.name, round.holes.length);
    const won = (s: number) => res.filter((r) => r === s).length;
    const thru = res.filter((r) => r != null).length;
    return {
      title: modeName('match'),
      status: st.text,
      rows: [
        { key: a.id, name: a.name, value: tr(`${won(1)} won`, `${won(1)} gewonnen`), thru, rank: st.a >= 0 ? 1 : 2 },
        { key: b.id, name: b.name, value: tr(`${won(-1)} won`, `${won(-1)} gewonnen`), thru, rank: st.b >= 0 ? 1 : 2 },
      ].sort((x, y) => x.rank - y.rank),
    };
  }

  if (mode === 'fourball') {
    const teams = [round.players.slice(0, 2), round.players.slice(2, 4)];
    const name = (t: typeof teams[number]) => t.map((p) => p.name).join(' & ');
    // the better ball of the team per hole
    const best = (t: typeof teams[number], i: number) => {
      const xs = t.map((p) => holeScore(vals[p.id][i], scoring)).filter((v): v is number => v != null);
      return xs.length ? (hb ? Math.max(...xs) : Math.min(...xs)) : null;
    };
    const per = teams.map((t) => round.holes.map((_, i) => best(t, i)));
    const res = round.holes.map((_, i) => holeWinner(per[0][i], per[1][i], hb));
    const st = matchStatus(res, name(teams[0]), name(teams[1]), round.holes.length);
    const rows = rank(
      teams.map((t, k) => {
        const xs = per[k].filter((v): v is number => v != null);
        return { key: `team${k}`, name: name(t), sort: xs.length ? xs.reduce((s, v) => s + v, 0) : null, thru: xs.length };
      }),
      hb,
    );
    return { title: modeName('fourball'), status: st.text, rows: rows.map((r) => ({ key: r.key, name: r.name, value: r.sort == null ? '–' : unit(r.sort), thru: r.thru, rank: r.rank })) };
  }

  const rows = rank(
    round.players.map((p) => {
      const xs = vals[p.id].map((v) => holeScore(v, scoring)).filter((v): v is number => v != null);
      return { key: p.id, name: p.name, sort: xs.length ? xs.reduce((s, v) => s + v, 0) : null, thru: xs.length };
    }),
    hb,
  );
  return { title: scoringName(scoring), status: null, rows: rows.map((r) => ({ key: r.key, name: r.name, value: r.sort == null ? '–' : unit(r.sort), thru: r.thru, rank: r.rank })) };
}
