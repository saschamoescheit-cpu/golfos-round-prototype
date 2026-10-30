import type { Round } from '../types';
import { grossForHole, handicapStrokes, stablefordPoints } from './scoring';
import { tr } from './i18n';

// Game modes and scoring of a round, chosen as in Hole19 (Sascha 14.10.2026): a list of modes – simple game, better
// ball, scramble, foursomes, each also as match play, and singles match play – then the scoring (Stableford or stroke
// play) and the handicap allowance. The live leaderboard of the flight runs on this phone; a leaderboard across phones
// needs a server (feature 020).
//
// Scramble and foursomes have no single scores: each team plays one ball. The round then holds the teams as its
// "players" (one score per hole, one row on the scorecard), with the team handicap from the players' handicaps.

export type GameMode = 'single' | 'match' | 'fourball' | 'scramble' | 'foursome';
/** 'stroke' = stroke play gross, 'net' = stroke play with handicap (allowance > 0), 'stableford'. */
export type Scoring = 'stroke' | 'net' | 'stableford';
export interface RoundFormat {
  mode: GameMode;
  scoring: Scoring;
  matchplay?: boolean; // teams play hole by hole against each other ('match' = singles match play)
  allowance?: number; // handicap allowance in % (100 = full)
  /** on several phones, single balls: everyone also marks a partner (Sascha 30.10.2026 – chosen, by default not) */
  marker?: boolean;
}
export const DEFAULT_FORMAT: RoundFormat = { mode: 'single', scoring: 'net', allowance: 100 };

/** The modes in the order of Hole19, with how many players they need. */
export const FORMATS: { id: string; mode: GameMode; matchplay: boolean; name: () => string; text: () => string; fits: (players: number) => boolean; need: () => string }[] = [
  {
    id: 'single', mode: 'single', matchplay: false, fits: () => true, need: () => '',
    name: () => tr('Simple game', 'Einfaches Spiel'),
    text: () => tr('Everyone plays for strokes or Stableford points – fewest strokes or most points win.', 'Jeder spielt um Schläge oder Stableford-Punkte – wenigste Schläge oder meiste Punkte gewinnen.'),
  },
  {
    id: 'fourball', mode: 'fourball', matchplay: false, fits: (n) => n === 4, need: () => tr('4 players', '4 Spieler'),
    name: () => 'Better Ball',
    text: () => tr('Teams of two, everyone plays his own ball – the better score of the team counts on each hole.', 'Zweierteams, jeder spielt seinen eigenen Ball – an jedem Loch zählt das bessere Ergebnis des Teams.'),
  },
  {
    id: 'scramble', mode: 'scramble', matchplay: false, fits: (n) => n >= 2, need: () => tr('2–4 players', '2–4 Spieler'),
    name: () => 'Scramble',
    text: () => tr('Everyone hits every shot, the team picks the best ball and all play on from there until holed.', 'Alle schlagen jeden Schlag, das Team wählt den besten Ball und alle spielen von dort weiter, bis eingelocht ist.'),
  },
  {
    id: 'foursome', mode: 'foursome', matchplay: false, fits: (n) => n === 2 || n === 4, need: () => tr('2 or 4 players', '2 oder 4 Spieler'),
    name: () => tr('Foursomes', 'Vierer'),
    text: () => tr('A team shares one ball, the partners hit in turn until holed – one team score per hole.', 'Ein Team teilt sich einen Ball, die Partner schlagen abwechselnd, bis eingelocht ist – ein Team-Score je Loch.'),
  },
  {
    id: 'fourball-match', mode: 'fourball', matchplay: true, fits: (n) => n === 4, need: () => tr('4 players', '4 Spieler'),
    name: () => tr('Better Ball (match play)', 'Better Ball (Lochspiel)'),
    text: () => tr('Two against two, everyone plays his ball – the better score of the team wins the hole.', 'Zwei gegen zwei, jeder spielt seinen Ball – das bessere Ergebnis des Teams gewinnt das Loch.'),
  },
  {
    id: 'scramble-match', mode: 'scramble', matchplay: true, fits: (n) => n === 4, need: () => tr('4 players', '4 Spieler'),
    name: () => tr('Scramble (match play)', 'Scramble (Lochspiel)'),
    text: () => tr('Play every shot together, pick the best ball of your team and win the holes against the other team.', 'Jeden Schlag gemeinsam, den besten Ball des Teams wählen und die Löcher gegen das andere Team gewinnen.'),
  },
  {
    id: 'foursome-match', mode: 'foursome', matchplay: true, fits: (n) => n === 4, need: () => tr('4 players', '4 Spieler'),
    name: () => tr('Foursomes (match play)', 'Vierer (Lochspiel)'),
    text: () => tr('One ball per team, hit in turn and fight hole by hole for the win.', 'Ein Ball je Team, abwechselnd schlagen und Loch für Loch um den Sieg spielen.'),
  },
  {
    id: 'match', mode: 'match', matchplay: true, fits: (n) => n === 2, need: () => tr('2 players', '2 Spieler'),
    name: () => tr('Singles (match play)', 'Einzel (Lochspiel)'),
    text: () => tr('One against one – win hole by hole against your opponent.', 'Einer gegen einen – Loch für Loch gegen deinen Gegner gewinnen.'),
  },
];

export const formatOf = (f: RoundFormat) => FORMATS.find((x) => x.mode === f.mode && x.matchplay === (f.mode === 'match' || !!f.matchplay)) ?? FORMATS[0];
export const modeName = (m: GameMode, matchplay = false): string => formatOf({ mode: m, scoring: 'stroke', matchplay }).name();
export const scoringName = (s: Scoring, allowance = 100): string =>
  s === 'stableford' ? 'Stableford' : s === 'net' && allowance > 0 ? tr(`Stroke play net (${allowance} %)`, `Zählspiel netto (${allowance} %)`) : tr('Stroke play gross', 'Zählspiel brutto');

/** Which modes fit the number of players. */
export const modesFor = (players: number): GameMode[] => [...new Set(FORMATS.filter((f) => f.fits(players)).map((f) => f.mode))];

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
  value: string; // "+3", "18 Pkt.", "2 gewonnen"
  thru: number; // holes played
  rank: number;
}
export interface Board {
  title: string;
  rows: BoardRow[];
  status: string | null; // match play: "Anna 2 up after 7"
}

const toParText = (v: number): string => (v === 0 ? 'Par' : v > 0 ? `+${v}` : String(v));

/** Per hole for one player: gross, net and Stableford points (null = no score yet), handicap × allowance. */
function holeValues(round: Round, playerId: string, allowance: number) {
  const p = round.players.find((x) => x.id === playerId)!;
  const hcp = p.playingHandicap == null ? null : Math.round((p.playingHandicap * allowance) / 100);
  const received = handicapStrokes(round.holes, hcp);
  return round.holes.map((h, i) => {
    const e = round.entries[playerId][i];
    const gross = grossForHole(e, h.par, received[i]);
    if (gross == null) return null;
    return { gross, net: gross - received[i], par: h.par, points: hcp == null ? null : stablefordPoints(e, h.par, received[i]) };
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

/** Two sides hole by hole: the status line and one row per side with the holes won. */
function matchBoard(title: string, sides: { key: string; name: string; per: (number | null)[] }[], hb: boolean, holes: number): Board {
  const [a, b] = sides;
  const res = a.per.map((x, i) => holeWinner(x, b.per[i], hb));
  const st = matchStatus(res, a.name, b.name, holes);
  const won = (s: number) => res.filter((r) => r === s).length;
  const thru = res.filter((r) => r != null).length;
  return {
    title,
    status: st.text,
    rows: [
      { key: a.key, name: a.name, value: tr(`${won(1)} won`, `${won(1)} gewonnen`), thru, rank: st.a >= 0 ? 1 : 2 },
      { key: b.key, name: b.name, value: tr(`${won(-1)} won`, `${won(-1)} gewonnen`), thru, rank: st.b >= 0 ? 1 : 2 },
    ].sort((x, y) => x.rank - y.rank),
  };
}

export function leaderboard(round: Round, format: RoundFormat = round.format ?? DEFAULT_FORMAT): Board {
  const allowance = format.allowance ?? 100;
  const scoring = format.scoring;
  // match play is played with handicap: "gross" means each side's own net score on the hole
  const matchScoring: Scoring = scoring === 'stableford' ? 'stableford' : allowance > 0 ? 'net' : 'stroke';
  const hb = scoring === 'stableford';
  const unit = (v: number) => (hb ? tr(`${v} pts`, `${v} Pkt.`) : toParText(v));
  const vals = Object.fromEntries(round.players.map((p) => [p.id, holeValues(round, p.id, allowance)]));
  const fmt = formatOf(format);
  const title = `${fmt.name()} · ${scoringName(scoring, allowance)}`;
  const totals = (sides: { key: string; name: string; per: (number | null)[] }[]): Board => ({
    title,
    status: null,
    rows: rank(
      sides.map((s) => {
        const xs = s.per.filter((v): v is number => v != null);
        return { key: s.key, name: s.name, sort: xs.length ? xs.reduce((t, v) => t + v, 0) : null, thru: xs.length };
      }),
      hb,
    ).map((r) => ({ key: r.key, name: r.name, value: r.sort == null ? '–' : unit(r.sort), thru: r.thru, rank: r.rank })),
  });
  const single = (sc: Scoring) => round.players.map((p) => ({ key: p.id, name: p.name, per: vals[p.id].map((v) => holeScore(v, sc)) }));

  // team rounds: the round's players are the teams
  if (isTeamMode(format.mode)) return format.matchplay && round.players.length === 2 ? matchBoard(title, single(matchScoring), hb, round.holes.length) : totals(single(scoring));

  if (format.mode === 'match' && round.players.length === 2) return matchBoard(title, single(matchScoring), hb, round.holes.length);

  if (format.mode === 'fourball' && round.players.length === 4) {
    const sc = format.matchplay ? matchScoring : scoring;
    const teams = [round.players.slice(0, 2), round.players.slice(2, 4)];
    // the better ball of the team per hole
    const sides = teams.map((t, k) => ({
      key: `team${k}`,
      name: t.map((p) => p.name).join(' & '),
      per: round.holes.map((_, i) => {
        const xs = t.map((p) => holeScore(vals[p.id][i], sc)).filter((v): v is number => v != null);
        return xs.length ? (hb ? Math.max(...xs) : Math.min(...xs)) : null;
      }),
    }));
    return format.matchplay ? matchBoard(title, sides, hb, round.holes.length) : totals(sides);
  }

  return totals(single(scoring));
}
