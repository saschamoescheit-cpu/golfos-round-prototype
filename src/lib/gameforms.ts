import { dec, tr } from './i18n';

// The "Games" module (Sascha 15.10.2026): side games among friends as a product of its own, not tied to the round
// analysis – skins, Nassau, wolf, Chicago, Bingo Bango Bongo, Las Vegas, sixes, snake, dots, Stableford and match
// play duels. Each form has its rules ("Ausgestaltung"), its settings and, where needed, what is entered per hole
// besides the strokes. Results in points; with a stake per point the settlement in euros.

export type FormId = 'skins' | 'nassau' | 'wolf' | 'chicago' | 'bbb' | 'vegas' | 'sixes' | 'snake' | 'dots' | 'stableford' | 'match' | 'hammer' | 'rabbit' | 'acey';

export interface GameHole {
  label: string;
  par: number;
  si: number; // stroke index
}
export interface GamePlayer {
  id: string;
  name: string;
  hcp: number | null; // playing handicap (Spielvorgabe)
}
/** What is entered per hole besides the strokes. */
export interface HoleExtra {
  wolfPartner?: string | null; // wolf: the partner the wolf chose; null = lone wolf
  wolfBlind?: boolean; // wolf: lone wolf announced before anyone hit (blind)
  bingo?: string | null; // first on the green
  bango?: string | null; // closest to the pin once all are on the green
  bongo?: string | null; // first to hole out
  threePutt?: string[]; // snake: who three-putted (in order)
  dots?: Record<string, string[]>; // dots: per player the dots won on this hole
  hammer?: number; // hammer: doublings accepted on this hole
  pairing?: number; // chicago: the partner of player 1 on this hole (1, 2 or 3)
  conceded?: 'A' | 'B'; // hammer: the side that declined a hammer and gave the hole up
}
export interface Game {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  /** When the result was confirmed – like signing a round's scorecard (Sascha 16.10.2026); only these count in the balance. */
  signedAt?: string | null;
  courseName: string;
  holes: GameHole[];
  players: GamePlayer[];
  form: FormId;
  settings: Record<string, number | boolean | string>;
  scores: Record<string, (number | null)[]>; // gross strokes per player and hole
  extra: HoleExtra[];
  current: number;
  /** Presses (Sascha 15.10.2026): the last one doubles the stake – from 0.10 € to 0.20 € and so on, up to the cap. */
  presses?: { hole: number; by: string }[];
  /** Shared with other phones (sharedgame.ts): the join code, and on a joined phone which player this phone's owner is. */
  shared?: { code: string; me?: string };
  /** When a score (s:player:hole) or a hole's extras (x:hole) were entered – merging two phones keeps the later. */
  stamps?: Record<string, string>;
  /** Played on the GPS map (Sascha 16.10.2026): the round behind the game – map, caddie, score entry. */
  round?: import('../types').Round;
}

export interface SettingDef {
  key: string;
  label: () => string;
  type: 'stake' | 'bool' | 'choice' | 'cap' | 'presses';
  options?: { value: string; label: () => string }[];
  default: number | boolean | string;
  hint?: () => string;
  when?: (settings: Record<string, number | boolean | string>) => boolean; // shown only then
}
export interface StandingRow {
  id: string;
  name: string;
  points: number; // for the ranking (higher = better)
  value: string; // as shown
  detail?: string;
}
export interface Standing {
  rows: StandingRow[];
  status?: string; // a line on top, e.g. "Front 9: Anna 2 up"
  money?: Record<string, number>; // + wins / − pays, in euros
}
export interface FormDef {
  id: FormId;
  name: () => string;
  short: () => string; // one line for the list
  rules: () => string[]; // how it is played
  players: [number, number];
  counts?: number[]; // only these player numbers (e.g. one against one or two against two)
  settings: SettingDef[];
  input?: 'wolf' | 'bbb' | 'snake' | 'dots' | 'hammer' | 'chicago';
  /** WHS recommendation for the share of the playing handicap, by the number of players (night run 15./16.10.2026). */
  hcpFor?: (n: number) => string;
  standing: (g: Game) => Standing;
}

// ---------- helpers ----------

/** Strokes received per hole for a playing handicap (stroke index order, more than 18 – a second round). */
export function received(holes: GameHole[], hcp: number | null): number[] {
  if (hcp == null || hcp === 0) return holes.map(() => 0);
  const n = holes.length;
  // without any stroke index the strokes are spread evenly over the round (Sascha's Chicago concept)
  const noSi = holes.every((h) => !h.si);
  const order = holes
    .map((h, i) => ({ i, si: noSi ? ((i + 1) * 0.6180339887) % 1 : h.si || i + 1 }))
    .sort((a, b) => a.si - b.si);
  const out = holes.map(() => 0);
  const full = n === 9 ? Math.round(hcp / 2) : hcp; // a 9-hole game gets half the 18-hole handicap
  const sign = full < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(full); k++) out[order[k % n].i] += sign;
  return out;
}

/** Share of the playing handicap that counts, 0 = gross (older games: the switch "net"). */
export const allowanceOf = (g: Game): number => (g.settings.allowance != null ? Number(g.settings.allowance) : g.settings.net === false ? 0 : 100);
const hcpOf = (g: Game, p: GamePlayer): number | null => (p.hcp == null ? null : Math.round((p.hcp * allowanceOf(g)) / 100));
/** Strokes a player receives per hole in this game. */
export const strokesOn = (g: Game, p: GamePlayer): number[] => received(g.holes, hcpOf(g, p));
const net = (g: Game, pid: string, i: number): number | null => {
  const s = g.scores[pid]?.[i];
  if (s == null) return null;
  const p = g.players.find((x) => x.id === pid)!;
  return s - strokesOn(g, p)[i];
};
/** The stake in force: doubled with every press (Sascha 15.10.2026: 0,10 → 0,20 → 0,40 …). */
export function stakeNow(g: Game, key = 'stake'): number {
  const base = Number(g.settings[key] ?? 0);
  if (!g.settings.double || key !== 'stake') return base;
  return base * 2 ** (g.presses?.length ?? 0);
}
/** The stake on hole i: the presses made up to this hole count. */
export const stakeAt = (g: Game, i: number): number =>
  g.settings.double ? Number(g.settings.stake ?? 0) * 2 ** (g.presses?.filter((x) => x.hole <= i).length ?? 0) : Number(g.settings.stake ?? 0);
/** The highest stake reachable: the cap in euros snaps to the doubling chain of the start stake
 *  (start 0,15 €, maximum 3,60 € → 2,40 €), and the number of presses can be limited too. */
export function stakeCap(g: Pick<Game, 'settings'>): number {
  const base = Number(g.settings.stake ?? 0);
  if (!base) return 0;
  const euros = Number(g.settings.maxStake ?? 0);
  const presses = Number(g.settings.maxPresses ?? 0);
  let k = 0;
  const limit = euros > 0 ? euros : Infinity;
  while (base * 2 ** (k + 1) <= limit + 1e-9 && (!presses || k + 1 <= presses) && k < 20) k++;
  return limit === Infinity && !presses ? Infinity : base * 2 ** k;
}
/** The doubling chain of a start stake up to `upTo` (Sascha 15.10.2026: 0,10 → 0,20 → 0,40 … 6,40 €). */
export function capChain(stake: number, upTo = 6.4): number[] {
  const out: number[] = [];
  for (let v = stake * 2; stake > 0 && v <= upTo + 1e-9 && out.length < 20; v *= 2) out.push(Math.round(v * 100) / 100);
  return out;
}
/** A cap typed by hand must be a step of the chain: from 0,10 € 12,80 € or 25,60 € – not 10 € or 12,20 €. */
export function onChain(stake: number, v: number): boolean {
  if (!(stake > 0) || !(v > stake)) return false;
  const k = Math.round(Math.log2(v / stake));
  return k >= 1 && k <= 20 && Math.round(stake * 2 ** k * 100) === Math.round(v * 100);
}
/** A cap that is no step of the chain (start stake changed) → the step below it, at least one doubling. */
export function snapCap(stake: number, cap: number): number {
  if (!(stake > 0) || !(cap > 0)) return cap;
  let v = stake * 2;
  while (v * 2 <= cap + 1e-9) v *= 2;
  return Math.round(v * 100) / 100;
}
/** One more press stays within the cap. */
export const canPress = (g: Game): boolean => !!g.settings.double && Number(g.settings.stake ?? 0) > 0 && stakeNow(g) * 2 <= stakeCap(g) + 1e-9;
const stake = stakeNow;
const played = (g: Game, i: number) => g.players.every((p) => g.scores[p.id]?.[i] != null);
const holesDone = (g: Game) => g.holes.filter((_, i) => played(g, i)).length;
/** An amount in euros – comma in German, point in English; cents only when there are any. */
export const money = (v: number): string => `${dec(Math.abs(v) % 1 ? Math.abs(v).toFixed(2) : String(Math.abs(v)))} €`;
const euro = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(v)}`;
const rank = (rows: StandingRow[]) => rows.sort((a, b) => b.points - a.points);
const name = (g: Game, id: string) => g.players.find((p) => p.id === id)?.name ?? '?';

/** Money from points: everyone settles with everyone – the difference of points times the stake. */
function settle(g: Game, points: Record<string, number>, perPoint: number): Record<string, number> {
  const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
  if (!perPoint) return money;
  for (const a of g.players) for (const b of g.players) if (a.id < b.id) {
    const d = (points[a.id] - points[b.id]) * perPoint;
    money[a.id] += d;
    money[b.id] -= d;
  }
  return money;
}

/** Hole by hole between two sides (lower net wins): +1 side A, −1 side B, 0 halved, null not played. */
function holeWinner(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a < b ? 1 : a > b ? -1 : 0;
}
const best = (g: Game, ids: string[], i: number): number | null => {
  const xs = ids.map((id) => net(g, id, i)).filter((v): v is number => v != null);
  return xs.length === ids.length ? Math.min(...xs) : null;
};
function matchText(results: (number | null)[], a: string, b: string): { diff: number; text: string } {
  let diff = 0;
  let n = 0;
  for (const r of results) if (r != null) { diff += r; n++; }
  if (!n) return { diff: 0, text: tr('not started', 'noch nicht begonnen') };
  if (!diff) return { diff, text: tr(`all square after ${n}`, `All Square nach ${n}`) };
  return { diff, text: tr(`${diff > 0 ? a : b} ${Math.abs(diff)} up after ${n}`, `${diff > 0 ? a : b} ${Math.abs(diff)} auf nach ${n}`) };
}

/** The two sides of a team game (Sascha: teams free to choose): player 1 with his partner (setting "partner", the
 *  player's position, default player 2) against the others. Two players: one against one. */
export function teamsOf(g: Pick<Game, 'players' | 'settings'>): [string[], string[]] {
  const ids = g.players.map((p) => p.id);
  if (ids.length < 4) return [[ids[0]], ids.slice(1, 2)];
  const k = Math.min(ids.length - 1, Math.max(1, Number(g.settings.partner ?? 1)));
  return [[ids[0], ids[k]], ids.filter((_, j) => j !== 0 && j !== k)];
}

/** Chicago: the pairing of hole i – player 1 with partner 1, 2 or 3 in rotation, or as set on the hole. */
export function chicagoTeams(g: Pick<Game, 'players' | 'extra'>, i: number): [string[], string[]] {
  const ids = g.players.map((p) => p.id);
  const k = Math.min(3, Math.max(1, Number(g.extra[i]?.pairing ?? (i % 3) + 1)));
  return [[ids[0], ids[k]], ids.filter((_, j) => j !== 0 && j !== k)];
}
/** Who plays with whom on hole i – for the game bar over the map (Sascha 16.10.2026: the teams "go under"). Null
 *  for forms without sides (skins, stableford …) and for a wolf who has not chosen yet. */
export function holeTeams(g: Pick<Game, 'form' | 'players' | 'settings' | 'extra' | 'holes'>, i: number): [string[], string[]] | null {
  const ids = g.players.map((p) => p.id);
  switch (g.form) {
    case 'chicago':
      return ids.length === 4 ? chicagoTeams(g, i) : null;
    case 'sixes': {
      if (ids.length !== 4) return null;
      const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
      const [a, b] = pairs[Math.min(2, Math.floor(i / Math.ceil(g.holes.length / 3)))];
      return [a.map((j) => ids[j]), b.map((j) => ids[j])];
    }
    case 'wolf': {
      const x = g.extra[i] ?? {};
      if (ids.length !== 4 || x.wolfPartner === undefined) return null;
      const team = x.wolfPartner ? [ids[i % 4], x.wolfPartner] : [ids[i % 4]];
      return [team, ids.filter((id) => !team.includes(id))];
    }
    case 'nassau':
    case 'vegas':
    case 'match':
    case 'hammer':
      return teamsOf(g);
    default:
      return null;
  }
}

/** Chicago: the team's two (net) scores as one number, the lower one first – 6 and 5 = 56. Sascha's group's house
 *  rules (17.10.2026), both switchable: highest score 9 (a 10 counts as 9), a team without a par always puts the
 *  higher score first (bogey and 10 = 95), and every birdie (or better) takes 5 off the team's number
 *  when the other team has no par: par and birdie = 34 − 5 = 29. */
function teamNumber(g: Game, ids: string[], i: number, others: string[] = []): number {
  // on when chosen (new Chicago games have both on); games from before keep their old reckoning
  const max9 = g.settings.max9 === true || g.settings.max9 === 'true';
  const bonus = g.settings.birdie5 === true || g.settings.birdie5 === 'true';
  const v = ids.map((id) => net(g, id, i)!).map((x) => (max9 ? Math.min(9, x) : x)).sort((a, b) => a - b);
  const par = g.holes[i]?.par ?? 4;
  const parOrBetter = (team: string[]) => team.some((id) => net(g, id, i)! <= par);
  // with the house rules a team without a par always puts the higher score first: bogey and double = 65, not 56
  // (Sascha 17.10.2026: "whenever no par is played, the highest number is always in front"); otherwise a score of
  // 10 or more goes first: 10 and 4 = 104, not 410
  const turned = max9 && !parOrBetter(ids);
  const num = turned || v[1] >= 10 ? Number(`${v[1]}${v[0]}`) : Number(`${v[0]}${v[1]}`);
  if (!bonus || !others.length) return num;
  const birdies = ids.filter((id) => net(g, id, i)! <= par - 1).length;
  return birdies && !parOrBetter(others) ? num - 5 * birdies : num;
}

/** Chicago on hole i (Sascha 15.10.2026: "Sascha & Max 44, Simon & Sam 56 – the difference 12"): the two teams with
 *  their number, and the points of the hole (+ for team A). Null until all four scores are in. */
export function chicagoHole(g: Game, i: number): { a: { ids: string[]; num: number }; b: { ids: string[]; num: number }; diff: number } | null {
  if (!played(g, i)) return null;
  const [A, B] = chicagoTeams(g, i);
  const a = teamNumber(g, A, i, B);
  const b = teamNumber(g, B, i, A);
  return { a: { ids: A, num: a }, b: { ids: B, num: b }, diff: b - a };
}

// With or without handicap (Sascha 15.10.2026): the WHS share of the playing handicap, or gross.
const HCP: SettingDef = {
  key: 'allowance',
  label: () => tr('Handicap (WHS)', 'Vorgabe (WHS)'),
  type: 'choice',
  options: [
    { value: '100', label: () => '100 %' },
    { value: '90', label: () => '90 %' },
    { value: '85', label: () => '85 %' },
    { value: '75', label: () => '75 %' },
    { value: '50', label: () => '50 %' },
    { value: '0', label: () => tr('None (gross)', 'Ohne (brutto)') },
  ],
  default: '100',
};
// Money that does not get out of hand: press (the last one doubles the stake), a cap for the stake, a loss limit.
const DOUBLE: SettingDef[] = [
  { key: 'double', label: () => tr('Press: the last may double the stake', 'Press: der Letzte darf den Einsatz verdoppeln'), type: 'bool', default: false },
  {
    key: 'maxStake',
    label: () => tr('Highest stake', 'Höchsteinsatz'),
    // the steps of the doubling chain of the start stake up to 6,40 €, "no cap", or a higher step typed in (Games.tsx)
    type: 'cap',
    default: '1.6',
    when: (s) => !!s.double,
  },
  {
    key: 'maxPresses',
    label: () => tr('Presses allowed', 'Erlaubte Pressen'),
    // the same limit as the highest stake, counted in doublings (Sascha 15.10.2026: 0,10 € up to 1,60 € = 4× pressing) –
    // Games.tsx shows 1×, 2×, … and stores the highest stake; with money the stored value stays 0
    type: 'presses',
    default: '0',
    when: (s) => !!s.double,
  },
];

// ---------- the forms ----------

export const FORMS: FormDef[] = [
  {
    id: 'skins',
    hcpFor: () => '100',
    name: () => 'Skins',
    short: () => tr('Every hole is worth a skin – only an outright win takes it.', 'Jedes Loch ist ein Skin wert – nur ein alleiniger Sieg holt ihn.'),
    rules: () => [
      tr('Each hole is worth one skin.', 'Jedes Loch ist einen Skin wert.'),
      tr('The lowest score on the hole wins the skin – alone. A tie: nobody wins it.', 'Das beste Ergebnis am Loch gewinnt den Skin – allein. Bei Gleichstand gewinnt keiner.'),
      tr('With carry-over the skin goes on to the next hole, which is then worth more.', 'Mit Übertrag wandert der Skin aufs nächste Loch, das dann mehr wert ist.'),
      tr('Every skin is paid by each of the others with the stake.', 'Jeden Skin zahlen alle anderen mit dem Einsatz.'),
    ],
    players: [2, 4],
    settings: [
      { key: 'carry', label: () => tr('Carry-over on a tie', 'Übertrag bei Gleichstand'), type: 'bool', default: true },
      { key: 'stake', label: () => tr('Stake per skin', 'Einsatz je Skin'), type: 'stake', default: 1 },
    ],
    standing: (g) => {
      const skins: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      let pot = 0;
      const won: string[] = [];
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        pot += 1;
        const nets = g.players.map((p) => ({ id: p.id, v: net(g, p.id, i)! }));
        const low = Math.min(...nets.map((x) => x.v));
        const winners = nets.filter((x) => x.v === low);
        if (winners.length === 1) {
          skins[winners[0].id] += pot;
          won.push(`${g.holes[i].label}: ${name(g, winners[0].id)}${pot > 1 ? ` (${pot})` : ''}`);
          pot = 0;
        } else if (!g.settings.carry) pot = 0;
      });
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      const n = g.players.length;
      for (const p of g.players) {
        money[p.id] += skins[p.id] * (n - 1) * stake(g);
        for (const q of g.players) if (q.id !== p.id) money[q.id] -= skins[p.id] * stake(g);
      }
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: skins[p.id], value: tr(`${skins[p.id]} skins`, `${skins[p.id]} Skins`) }))),
        status: pot ? tr(`${pot} skin(s) carried over`, `${pot} Skin(s) im Übertrag`) : won.slice(-1)[0],
        money,
      };
    },
  },
  {
    id: 'nassau',
    hcpFor: (n) => (n === 4 ? '90' : '100'),
    name: () => 'Nassau',
    short: () => tr('Three matches in one: front 9, back 9 and the whole round.', 'Drei Lochspiele in einem: vordere 9, hintere 9 und die ganze Runde.'),
    rules: () => [
      tr('Match play hole by hole, three bets: front nine, back nine, total.', 'Lochspiel Loch für Loch, drei Wetten: vordere 9, hintere 9, gesamt.'),
      tr('Two players one against one – or four players, 1 & 2 against 3 & 4 with the better ball.', 'Zwei Spieler einer gegen einen – oder vier Spieler, 1 & 2 gegen 3 & 4 mit dem besseren Ball.'),
      tr('Each bet won pays the stake.', 'Jede gewonnene Wette bringt den Einsatz.'),
      tr('Press: two down in a nine, a new bet starts from the next hole to the end of that nine.', 'Press: Wer in einer Neun 2 hinten liegt, startet ab dem nächsten Loch eine neue Wette bis zum Ende dieser Neun.'),
    ],
    players: [2, 4],
    counts: [2, 4],
    settings: [
      { key: 'stake', label: () => tr('Stake per bet', 'Einsatz je Wette'), type: 'stake', default: 5 },
      { key: 'press', label: () => tr('Automatic press at 2 down', 'Automatischer Press bei 2 hinten'), type: 'bool', default: false },
    ],
    standing: (g) => {
      const [A, B] = teamsOf(g);
      const nA = A.map((id) => name(g, id)).join(' & ');
      const nB = B.map((id) => name(g, id)).join(' & ');
      const res = g.holes.map((_, i) => holeWinner(best(g, A, i), best(g, B, i)));
      const half = g.holes.length >= 18 ? 9 : Math.ceil(g.holes.length / 2);
      const parts = [
        { label: tr('Front', 'Vorne'), from: 0, to: half },
        { label: tr('Back', 'Hinten'), from: half, to: g.holes.length },
        { label: tr('Total', 'Gesamt'), from: 0, to: g.holes.length },
      ];
      let bets = 0; // + side A won bets
      const lines: string[] = [];
      for (const part of parts) {
        const m = matchText(res.slice(part.from, part.to), nA, nB);
        lines.push(`${part.label}: ${m.text}`);
        const done = res.slice(part.from, part.to).every((r) => r != null);
        if (done && m.diff) bets += Math.sign(m.diff);
        if (g.settings.press && part.label !== tr('Total', 'Gesamt')) {
          // presses: from the hole after a side went 2 down, to the end of the nine
          let d = 0;
          for (let i = part.from; i < part.to; i++) {
            if (res[i] == null) break;
            d += res[i]!;
            if (Math.abs(d) === 2 && i + 1 < part.to) {
              const pm = matchText(res.slice(i + 1, part.to), nA, nB);
              lines.push(`Press ${part.label} ${g.holes[i + 1].label}: ${pm.text}`);
              if (res.slice(i + 1, part.to).every((r) => r != null) && pm.diff) bets += Math.sign(pm.diff);
              d = 0;
            }
          }
        }
      }
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const id of A) money[id] += bets * stake(g);
      for (const id of B) money[id] -= bets * stake(g);
      return {
        rows: [
          { id: 'A', name: nA, points: bets, value: tr(`${Math.max(0, bets)} bets`, `${Math.max(0, bets)} Wetten`) },
          { id: 'B', name: nB, points: -bets, value: tr(`${Math.max(0, -bets)} bets`, `${Math.max(0, -bets)} Wetten`) },
        ].sort((a, b) => b.points - a.points),
        status: lines.join(' · '),
        money,
      };
    },
  },
  {
    id: 'wolf',
    hcpFor: () => '90',
    name: () => 'Wolf',
    short: () => tr('Four players, the wolf picks a partner after each tee shot – or plays alone.', 'Vier Spieler, der Wolf wählt nach den Abschlägen einen Partner – oder spielt allein.'),
    rules: () => [
      tr('The wolf rotates: player 1 on hole 1, player 2 on hole 2 …', 'Der Wolf wechselt: Spieler 1 an Loch 1, Spieler 2 an Loch 2 …'),
      tr('After each tee shot the wolf may take that player as partner – or play alone (lone wolf).', 'Nach jedem Abschlag darf der Wolf diesen Spieler als Partner nehmen – oder allein spielen (Lone Wolf).'),
      tr('Two against two: the better ball wins, each winner 1 point. Lone wolf wins: 2 points from each; loses: each other gets 1.', 'Zwei gegen zwei: der bessere Ball gewinnt, jeder Sieger 1 Punkt. Lone Wolf gewinnt: 2 Punkte von jedem; verliert: jeder andere 1 Punkt.'),
      tr('Blind wolf (alone before anyone hit): everything counts double.', 'Blind Wolf (allein, bevor einer geschlagen hat): alles zählt doppelt.'),
    ],
    players: [4, 4],
    input: 'wolf',
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 1 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        const wolf = g.players[i % 4].id;
        const x = g.extra[i] ?? {};
        if (x.wolfPartner === undefined) return; // the wolf did not choose yet
        const k = x.wolfBlind ? 2 : 1;
        const team = x.wolfPartner ? [wolf, x.wolfPartner] : [wolf];
        const others = g.players.map((p) => p.id).filter((id) => !team.includes(id));
        const r = holeWinner(best(g, team, i), best(g, others, i));
        if (!r) return;
        if (team.length === 2) for (const id of r > 0 ? team : others) pts[id] += k;
        else if (r > 0) pts[wolf] += 2 * others.length * k;
        else for (const id of others) pts[id] += k;
      });
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))),
        status: !g.finishedAt && g.current < g.holes.length ? tr(`Wolf on ${g.holes[g.current].label}: ${g.players[g.current % 4].name}`, `Wolf an ${g.holes[g.current].label}: ${g.players[g.current % 4].name}`) : undefined,
        money: settle(g, pts, stake(g)),
      };
    },
  },
  {
    // Chicago as Sascha's group plays it (concept 15.10.2026): left against right per hole, the team scores as a
    // two-digit number, the difference in points; a press doubles the stake and halves all points.
    id: 'chicago',
    hcpFor: () => '100',
    name: () => 'Chicago',
    short: () => tr('Two against two per hole, left against right – the two scores of a team make one number.', 'Pro Loch zwei gegen zwei, links gegen rechts – die zwei Ergebnisse eines Teams ergeben eine Zahl.'),
    rules: () => [
      tr(
        'Four players, two teams on every hole. The three pairings (A+B vs C+D, A+C vs B+D, A+D vs B+C) rotate hole by hole – on 18 holes each six times, on 9 holes three times – so everyone plays with everyone. The pairing of a hole can be changed.',
        'Vier Spieler, an jedem Loch zwei Teams. Die drei Paarungen (A+B gegen C+D, A+C gegen B+D, A+D gegen B+C) wechseln von Loch zu Loch – auf 18 Löchern je sechsmal, auf 9 Löchern je dreimal –, damit jeder mit jedem spielt. Die Paarung eines Lochs lässt sich ändern.',
      ),
      tr('The two scores of a team make a two-digit number, the lower one first: 6 and 5 = 56, 3 and 3 = 33.', 'Die zwei Schläge eines Teams ergeben eine zweistellige Zahl, der kleinere vorn: 6 und 5 = 56, 3 und 3 = 33.'),
      tr(
        'Highest score 9 (if chosen): a 10 counts as 9. And a team without a par always puts the higher score first: bogey and double = 65, bogey and 10 = 95.',
        'Höchstes Ergebnis 9 (wenn gewählt): eine 10 zählt als 9. Und ein Team ohne Par stellt immer die höhere Zahl vorn: Bogey und Doppel-Bogey = 65, Bogey und 10 = 95.',
      ),
      tr('Without that: a score of 10 or more goes first: 10 and 4 = 104 (not 410).', 'Ohne diese Regel kommt eine 10 oder mehr nach vorn: 10 und 4 = 104 (nicht 410).'),
      tr(
        'Birdie −5 (if chosen): every birdie of a team takes 5 off its number, as long as nobody in the other team makes par – par and birdie = 34 − 5 = 29, two birdies = 33 − 10 = 23.',
        'Birdie −5 (wenn gewählt): jedes Birdie eines Teams zieht 5 von seiner Zahl ab, solange im anderen Team keiner Par spielt – Par und Birdie = 34 − 5 = 29, zwei Birdies = 33 − 10 = 23.',
      ),
      tr(
        'The difference is the hole: 56 − 33 = 23. Each player of the lower team gets +23, each of the other −23 – all accounts add up to zero.',
        'Die Differenz ist das Loch: 56 − 33 = 23. Jeder Spieler des Teams mit der kleineren Zahl bekommt +23, jeder des anderen −23 – alle Konten ergeben zusammen null.',
      ),
      tr('Money: points × stake, e.g. 23 × 0.10 € = 2.30 €.', 'Geld: Punkte × Einsatz, z. B. 23 × 0,10 € = 2,30 €.'),
      tr(
        'Press: only the player furthest behind, only at the start of a hole. The stake doubles and all points are halved – the money so far stays the same, the coming holes count double.',
        'Pressen: nur der Spieler mit den meisten Minuspunkten, nur zu Lochbeginn. Der Einsatz verdoppelt sich, alle Punkte werden halbiert – der bisherige Geldstand bleibt, die kommenden Löcher zählen doppelt.',
      ),
      tr(
        'Highest stake: a step of the doubling chain (0.10 → 0.20 → 0.40 … 6.40 €, higher ones like 12.80 € typed in) or as a number of presses.',
        'Höchsteinsatz: eine Stufe der Verdopplungs-Kette (0,10 → 0,20 → 0,40 … 6,40 €, höhere wie 12,80 € per Eingabe) oder als Zahl erlaubter Pressen.',
      ),
      tr(
        'Gross or net: net gives the strokes of the playing handicap hole by hole after the stroke index (without one: evenly over the round).',
        'Brutto oder netto: netto werden die Vorgabeschläge Loch für Loch nach Stroke-Index verrechnet (ohne Index gleichmäßig über die Runde).',
      ),
    ],
    players: [4, 4],
    input: 'chicago',
    settings: [
      // the house rules of Sascha's group (17.10.2026) – on by default
      { key: 'max9', label: () => tr('Highest score 9', 'Höchstes Ergebnis 9'), type: 'bool', default: true },
      { key: 'birdie5', label: () => tr('Birdie −5 (other team no par)', 'Birdie −5 (anderes Team ohne Par)'), type: 'bool', default: true },
      { key: 'stake', label: () => tr('Start stake per point', 'Starteinsatz je Punkt'), type: 'stake', default: 0.1 },
    ],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        const [A, B] = chicagoTeams(g, i);
        const d = teamNumber(g, B, i, A) - teamNumber(g, A, i, B); // + the first team is lower
        for (const id of A) pts[id] += d;
        for (const id of B) pts[id] -= d;
      });
      const cur = Math.min(g.current, g.holes.length - 1);
      const [A, B] = chicagoTeams(g, cur);
      const names = (ids: string[]) => ids.map((id) => name(g, id)).join(' & ');
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: `${pts[p.id] > 0 ? '+' : ''}${dec(pts[p.id])}` }))),
        status: !g.finishedAt ? tr(`Hole ${g.holes[cur].label}: ${names(A)} vs ${names(B)}`, `Loch ${g.holes[cur].label}: ${names(A)} gegen ${names(B)}`) : undefined,
        money: Object.fromEntries(g.players.map((p) => [p.id, pts[p.id] * stake(g)])),
      };
    },
  },
  {
    id: 'bbb',
    name: () => 'Bingo Bango Bongo',
    short: () => tr('Three points per hole – the good players have no head start.', 'Drei Punkte je Loch – gute Spieler haben keinen Vorsprung.'),
    rules: () => [
      tr('Bingo: first ball on the green.', 'Bingo: erster Ball auf dem Grün.'),
      tr('Bango: closest to the pin once all balls are on the green.', 'Bango: am nächsten zur Fahne, wenn alle Bälle auf dem Grün sind.'),
      tr('Bongo: first to hole out.', 'Bongo: zuerst eingelocht.'),
      tr('The one farthest from the hole plays first – the order matters.', 'Wer am weitesten weg liegt, spielt zuerst – die Reihenfolge ist wichtig.'),
    ],
    players: [2, 4],
    input: 'bbb',
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const x of g.extra) for (const k of ['bingo', 'bango', 'bongo'] as const) if (x?.[k]) pts[x[k]!] = (pts[x[k]!] ?? 0) + 1;
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'vegas',
    hcpFor: () => '90',
    name: () => 'Las Vegas',
    short: () => tr('Two against two, the two scores of a team make one number.', 'Zwei gegen zwei, die beiden Ergebnisse eines Teams ergeben eine Zahl.'),
    rules: () => [
      tr('Teams 1 & 2 against 3 & 4. The scores of a team form a number, the lower first: 4 and 5 = 45.', 'Teams 1 & 2 gegen 3 & 4. Die Ergebnisse eines Teams bilden eine Zahl, die kleinere zuerst: 4 und 5 = 45.'),
      tr('A score of 10 or more puts it first: 4 and 10 = 104.', 'Ein Ergebnis ab 10 kommt nach vorne: 4 und 10 = 104.'),
      tr('Birdie flip: a birdie turns the other team’s number round (45 becomes 54).', 'Birdie-Flip: ein Birdie dreht die Zahl des anderen Teams um (45 wird 54).'),
      tr('The difference is won in points.', 'Die Differenz wird in Punkten gewonnen.'),
    ],
    players: [4, 4],
    settings: [
      { key: 'flip', label: () => tr('Birdie flip', 'Birdie-Flip'), type: 'bool', default: true },
      { key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.1 },
    ],
    standing: (g) => {
      const T = teamsOf(g);
      let diff = 0;
      g.holes.forEach((h, i) => {
        if (!played(g, i)) return;
        const sc = T.map((t) => t.map((id) => net(g, id, i)!));
        const num = (s: number[]) => {
          const [a, b] = s.slice().sort((x, y) => x - y);
          return b >= 10 ? Number(`${b}${a}`) : Number(`${a}${b}`);
        };
        const flipped = (s: number[]) => {
          const [a, b] = s.slice().sort((x, y) => x - y);
          return Number(`${b}${a}`);
        };
        let n = sc.map(num);
        if (g.settings.flip !== false) {
          const birdie = sc.map((s) => s.some((v) => v < h.par));
          if (birdie[0] && !birdie[1]) n = [n[0], flipped(sc[1])];
          if (birdie[1] && !birdie[0]) n = [flipped(sc[0]), n[1]];
        }
        diff += n[1] - n[0]; // + team A ahead (lower number wins)
      });
      const name2 = (t: string[]) => t.map((id) => name(g, id)).join(' & ');
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const id of T[0]) money[id] += diff * stake(g);
      for (const id of T[1]) money[id] -= diff * stake(g);
      return {
        rows: [
          { id: 'A', name: name2(T[0]), points: diff, value: tr(`${diff >= 0 ? '+' : ''}${diff} pts`, `${diff >= 0 ? '+' : ''}${diff} Pkt.`) },
          { id: 'B', name: name2(T[1]), points: -diff, value: tr(`${-diff >= 0 ? '+' : ''}${-diff} pts`, `${-diff >= 0 ? '+' : ''}${-diff} Pkt.`) },
        ].sort((a, b) => b.points - a.points),
        money,
      };
    },
  },
  {
    id: 'sixes',
    hcpFor: () => '90',
    name: () => tr('Sixes (round robin)', 'Sixes (Round Robin)'),
    short: () => tr('Four players, new partners every six holes.', 'Vier Spieler, alle sechs Löcher neue Partner.'),
    rules: () => [
      tr('Holes 1–6: 1 & 2 against 3 & 4; holes 7–12: 1 & 3 against 2 & 4; holes 13–18: 1 & 4 against 2 & 3.', 'Loch 1–6: 1 & 2 gegen 3 & 4; Loch 7–12: 1 & 3 gegen 2 & 4; Loch 13–18: 1 & 4 gegen 2 & 3.'),
      tr('Each six is a better-ball match; the winners get one point each.', 'Jede Sechser-Runde ist ein Bestball-Lochspiel; die Sieger bekommen je einen Punkt.'),
      tr('9 holes: three matches of three holes.', '9 Löcher: drei Spiele à drei Löcher.'),
    ],
    players: [4, 4],
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 2 }],
    standing: (g) => {
      const ids = g.players.map((p) => p.id);
      const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
      const seg = Math.ceil(g.holes.length / 3);
      const pts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const lines: string[] = [];
      pairs.forEach(([a, b], k) => {
        const A = a.map((j) => ids[j]);
        const B = b.map((j) => ids[j]);
        const res = g.holes.slice(k * seg, (k + 1) * seg).map((_, j) => holeWinner(best(g, A, k * seg + j), best(g, B, k * seg + j)));
        const m = matchText(res, A.map((id) => name(g, id)).join(' & '), B.map((id) => name(g, id)).join(' & '));
        lines.push(`${k * seg + 1}–${Math.min(g.holes.length, (k + 1) * seg)}: ${m.text}`);
        if (res.every((r) => r != null) && m.diff) for (const id of m.diff > 0 ? A : B) pts[id] += 1;
      });
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} pts`, `${pts[p.id]} Pkt.`) }))), status: lines.join(' · '), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'snake',
    name: () => 'Snake',
    short: () => tr('Whoever three-putts takes the snake – the last one pays.', 'Wer dreiputtet, bekommt die Schlange – der Letzte zahlt.'),
    rules: () => [
      tr('A three-putt (or more) takes the snake.', 'Ein Dreiputt (oder mehr) holt die Schlange.'),
      tr('Every three-putt makes the snake longer: the pot grows by the stake.', 'Jeder Dreiputt macht die Schlange länger: der Topf wächst um den Einsatz.'),
      tr('Whoever holds the snake after the last hole pays the pot to each of the others.', 'Wer nach dem letzten Loch die Schlange hat, zahlt den Topf an jeden der anderen.'),
    ],
    players: [2, 4],
    input: 'snake',
    settings: [{ key: 'stake', label: () => tr('Stake per three-putt', 'Einsatz je Dreiputt'), type: 'stake', default: 1 }],
    standing: (g) => {
      let holder: string | null = null;
      let length = 0;
      const count: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const x of g.extra) for (const id of x?.threePutt ?? []) {
        holder = id;
        length++;
        count[id]++;
      }
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      if (holder) for (const p of g.players) if (p.id !== holder) {
        money[p.id] += length * stake(g);
        money[holder] -= length * stake(g);
      }
      return {
        rows: g.players
          .map((p) => ({ id: p.id, name: p.name, points: p.id === holder ? -100 : -count[p.id], value: p.id === holder ? tr('🐍 holds the snake', '🐍 hat die Schlange') : tr(`${count[p.id]}× three-putt`, `${count[p.id]}× Dreiputt`) }))
          .sort((a, b) => b.points - a.points),
        status: holder ? tr(`Snake: ${name(g, holder)} · length ${length}`, `Schlange: ${name(g, holder)} · Länge ${length}`) : tr('No snake yet', 'Noch keine Schlange'),
        money,
      };
    },
  },
  {
    id: 'dots',
    name: () => tr('Dots (junk)', 'Dots (Punktejagd)'),
    short: () => tr('Points for the good moments: birdie, sandy, greenie, chip-in …', 'Punkte für die guten Momente: Birdie, Sandy, Greenie, Chip-in …'),
    rules: () => [
      tr('Birdie 1, eagle 2 – counted by itself from the score.', 'Birdie 1, Eagle 2 – zählt die App selbst aus dem Score.'),
      tr('Sandy: par or better after a bunker shot. Greenie: on a par 3 on the green with the tee shot, closest to the pin, and par.', 'Sandy: Par oder besser nach einem Bunkerschlag. Greenie: am Par 3 mit dem Abschlag aufs Grün, am nächsten zur Fahne und Par.'),
      tr('Chip-in and one-putt from more than 10 m: one dot each.', 'Chip-in und Ein-Putt aus mehr als 10 m: je ein Punkt.'),
    ],
    players: [2, 4],
    input: 'dots',
    settings: [{ key: 'stake', label: () => tr('Stake per dot', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      g.holes.forEach((h, i) => {
        for (const p of g.players) {
          const v = g.scores[p.id]?.[i];
          if (v != null) pts[p.id] += v === h.par - 1 ? 1 : v <= h.par - 2 ? 2 : 0;
          pts[p.id] += g.extra[i]?.dots?.[p.id]?.length ?? 0;
        }
      });
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: tr(`${pts[p.id]} dots`, `${pts[p.id]} Punkte`) }))), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'stableford',
    hcpFor: () => '95',
    name: () => tr('Stableford duel', 'Stableford-Duell'),
    short: () => tr('Classic Stableford points, everyone against everyone.', 'Klassische Stableford-Punkte, jeder gegen jeden.'),
    rules: () => [
      tr('Net par 2 points, net birdie 3, net bogey 1, worse 0.', 'Netto-Par 2 Punkte, Netto-Birdie 3, Netto-Bogey 1, schlechter 0.'),
      tr('Most points win; with a stake everyone settles the differences.', 'Die meisten Punkte gewinnen; mit Einsatz rechnet jeder die Differenzen ab.'),
    ],
    players: [2, 4],
    settings: [{ key: 'stake', label: () => tr('Stake per point', 'Einsatz je Punkt'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = {};
      const rows = g.players.map((p) => {
        const rec = strokesOn(g, p);
        let s = 0;
        g.holes.forEach((h, i) => {
          const v = g.scores[p.id]?.[i];
          if (v != null) s += Math.max(0, h.par + rec[i] - v + 2);
        });
        pts[p.id] = s;
        return { id: p.id, name: p.name, points: s, value: tr(`${s} pts`, `${s} Pkt.`) };
      });
      return { rows: rank(rows), money: settle(g, pts, stake(g)) };
    },
  },
  {
    id: 'match',
    hcpFor: (n) => (n === 4 ? '90' : '100'),
    name: () => tr('Match play', 'Lochspiel'),
    short: () => tr('One against one (or best ball two against two), hole by hole.', 'Einer gegen einen (oder Bestball zwei gegen zwei), Loch für Loch.'),
    rules: () => [
      tr('Every hole is won, lost or halved – the lower (net) score wins it.', 'Jedes Loch wird gewonnen, verloren oder geteilt – das bessere (Netto-)Ergebnis gewinnt.'),
      tr('Over when one side leads by more holes than are left (e.g. 3&2).', 'Vorbei, wenn eine Seite mit mehr Löchern führt als noch zu spielen sind (z. B. 3&2).'),
      tr('Four players: 1 & 2 against 3 & 4, the better ball counts.', 'Vier Spieler: 1 & 2 gegen 3 & 4, der bessere Ball zählt.'),
    ],
    players: [2, 4],
    counts: [2, 4],
    settings: [{ key: 'stake', label: () => tr('Stake for the match', 'Einsatz für das Spiel'), type: 'stake', default: 5 }],
    standing: (g) => {
      const [A, B] = teamsOf(g);
      const nA = A.map((id) => name(g, id)).join(' & ');
      const nB = B.map((id) => name(g, id)).join(' & ');
      const res = g.holes.map((_, i) => holeWinner(best(g, A, i), best(g, B, i)));
      const m = matchText(res, nA, nB);
      const left = res.filter((r) => r == null).length;
      const over = Math.abs(m.diff) > left;
      const status = over && m.diff ? tr(`${m.diff > 0 ? nA : nB} wins ${Math.abs(m.diff)}${left ? `&${left}` : ' up'}`, `${m.diff > 0 ? nA : nB} gewinnt ${Math.abs(m.diff)}${left ? `&${left}` : ' auf'}`) : m.text;
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      if (over && m.diff) {
        for (const id of A) money[id] += Math.sign(m.diff) * stake(g);
        for (const id of B) money[id] -= Math.sign(m.diff) * stake(g);
      }
      const won = (s: number) => res.filter((r) => r === s).length;
      return {
        rows: [
          { id: 'A', name: nA, points: m.diff, value: tr(`${won(1)} won`, `${won(1)} gewonnen`) },
          { id: 'B', name: nB, points: -m.diff, value: tr(`${won(-1)} won`, `${won(-1)} gewonnen`) },
        ].sort((a, b) => b.points - a.points),
        status,
        money,
      };
    },
  },
  {
    id: 'hammer',
    hcpFor: (n) => (n === 4 ? '90' : '100'),
    name: () => 'Hammer',
    short: () => tr('Match play where the stake of a hole can be doubled – accept or give up.', 'Lochspiel, bei dem der Einsatz eines Lochs verdoppelt werden kann – annehmen oder aufgeben.'),
    rules: () => [
      tr('One against one, or 1 & partner against the other two (better ball).', 'Einer gegen einen oder 1 & Partner gegen die anderen zwei (besserer Ball).'),
      tr('Every hole starts at the stake. Any time during the hole a side may "hammer": the hole is now worth double.', 'Jedes Loch beginnt mit dem Einsatz. Jederzeit am Loch darf eine Seite „hämmern“: das Loch zählt dann doppelt.'),
      tr('The other side accepts – or gives the hole up and pays its value before the hammer.', 'Die andere Seite nimmt an – oder gibt das Loch auf und zahlt den Wert vor dem Hammer.'),
      tr('The lower (net) score wins the hole and its value; a tie: nobody.', 'Das bessere (Netto-)Ergebnis gewinnt das Loch und seinen Wert; Gleichstand: keiner.'),
    ],
    players: [2, 4],
    counts: [2, 4],
    input: 'hammer',
    settings: [{ key: 'stake', label: () => tr('Stake per hole', 'Einsatz je Loch'), type: 'stake', default: 1 }],
    standing: (g) => {
      const [A, B] = teamsOf(g);
      const nA = A.map((id) => name(g, id)).join(' & ');
      const nB = B.map((id) => name(g, id)).join(' & ');
      let units = 0; // + side A ahead, in stakes
      let hammers = 0;
      g.holes.forEach((_, i) => {
        const x = g.extra[i] ?? {};
        const v = 2 ** (x.hammer ?? 0);
        hammers += x.hammer ?? 0;
        if (x.conceded) {
          units += x.conceded === 'B' ? v : -v;
          return;
        }
        const r = holeWinner(best(g, A, i), best(g, B, i));
        if (r) units += r * v;
      });
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      for (const id of A) money[id] += units * stake(g);
      for (const id of B) money[id] -= units * stake(g);
      const val = (u: number) => tr(`${u >= 0 ? '+' : ''}${u} stakes`, `${u >= 0 ? '+' : ''}${u} Einsätze`);
      return {
        rows: [
          { id: 'A', name: nA, points: units, value: val(units) },
          { id: 'B', name: nB, points: -units, value: val(-units) },
        ].sort((a, b) => b.points - a.points),
        status: tr(`${hammers} hammer(s) accepted`, `${hammers} Hammer angenommen`),
        money,
      };
    },
  },
  {
    id: 'rabbit',
    hcpFor: () => '100',
    name: () => 'Rabbit',
    short: () => tr('Catch the rabbit with an outright hole win – and hold it to the end of the nine.', 'Fang den Hasen mit einem alleinigen Lochsieg – und halte ihn bis zum Ende der Neun.'),
    rules: () => [
      tr('The rabbit starts free. Whoever wins a hole alone (net) catches it.', 'Der Hase ist zu Beginn frei. Wer ein Loch allein gewinnt (netto), fängt ihn.'),
      tr('Another player winning a hole alone sets it free again – the next outright winner catches it.', 'Gewinnt ein anderer Spieler ein Loch allein, ist der Hase wieder frei – der nächste alleinige Sieger fängt ihn.'),
      tr('Whoever holds the rabbit after the 9th and after the 18th hole wins – each of the others pays the stake.', 'Wer den Hasen nach dem 9. und nach dem 18. Loch hat, gewinnt – jeder andere zahlt den Einsatz.'),
    ],
    players: [2, 4],
    settings: [{ key: 'stake', label: () => tr('Stake per rabbit', 'Einsatz je Hase'), type: 'stake', default: 2 }],
    standing: (g) => {
      const half = g.holes.length >= 18 ? 9 : g.holes.length;
      const ends = [half - 1, g.holes.length - 1];
      const won: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      let holder: string | null = null;
      g.holes.forEach((_, i) => {
        if (played(g, i)) {
          const nets = g.players.map((p) => ({ id: p.id, v: net(g, p.id, i)! }));
          const low = Math.min(...nets.map((x) => x.v));
          const w = nets.filter((x) => x.v === low);
          if (w.length === 1) holder = holder == null ? w[0].id : holder === w[0].id ? holder : null;
        }
        if (ends.includes(i) && played(g, i)) {
          if (holder) won[holder]++;
          holder = null;
        }
      });
      const money: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      const n = g.players.length;
      for (const p of g.players) {
        money[p.id] += won[p.id] * (n - 1) * stake(g);
        for (const q of g.players) if (q.id !== p.id) money[q.id] -= won[p.id] * stake(g);
      }
      return {
        rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: won[p.id], value: tr(`${won[p.id]} rabbit(s)`, `${won[p.id]} Hase(n)`) }))),
        status: holder ? tr(`🐇 ${name(g, holder)} holds the rabbit`, `🐇 ${name(g, holder)} hat den Hasen`) : tr('🐇 The rabbit is free', '🐇 Der Hase ist frei'),
        money,
      };
    },
  },
  {
    id: 'acey',
    hcpFor: () => '100',
    name: () => 'Acey Deucey',
    short: () => tr('Best score on the hole collects from everyone, the worst pays everyone.', 'Bestes Ergebnis am Loch kassiert von allen, das schlechteste zahlt an alle.'),
    rules: () => [
      tr('Ace: the best (net) score alone on a hole wins the stake from each other player.', 'Ace: das alleinige beste (Netto-)Ergebnis am Loch bekommt von jedem anderen den Einsatz.'),
      tr('Deuce: the worst score alone pays the stake to each other player.', 'Deuce: das alleinige schlechteste Ergebnis zahlt jedem anderen den Einsatz.'),
      tr('Ties for best or worst: nothing for that part of the hole.', 'Gleichstand beim besten oder schlechtesten Ergebnis: für diesen Teil des Lochs nichts.'),
    ],
    players: [3, 4],
    settings: [{ key: 'stake', label: () => tr('Stake', 'Einsatz'), type: 'stake', default: 0.5 }],
    standing: (g) => {
      const pts: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
      const n = g.players.length;
      g.holes.forEach((_, i) => {
        if (!played(g, i)) return;
        const nets = g.players.map((p) => ({ id: p.id, v: net(g, p.id, i)! }));
        const lo = Math.min(...nets.map((x) => x.v));
        const hi = Math.max(...nets.map((x) => x.v));
        const ace = nets.filter((x) => x.v === lo);
        const deuce = nets.filter((x) => x.v === hi);
        if (ace.length === 1 && lo !== hi) for (const x of nets) pts[x.id] += x.id === ace[0].id ? n - 1 : -1;
        if (deuce.length === 1 && lo !== hi) for (const x of nets) pts[x.id] += x.id === deuce[0].id ? -(n - 1) : 1;
      });
      const money = Object.fromEntries(g.players.map((p) => [p.id, pts[p.id] * stake(g)]));
      return { rows: rank(g.players.map((p) => ({ id: p.id, name: p.name, points: pts[p.id], value: `${pts[p.id] >= 0 ? '+' : ''}${pts[p.id]}` }))), money };
    },
  },
];

// handicap and press for the forms where they make sense (no loss limit – Sascha 15.10.2026)
const WITH_HCP: FormId[] = ['skins', 'nassau', 'wolf', 'chicago', 'vegas', 'sixes', 'stableford', 'match', 'hammer', 'rabbit', 'acey'];
const WITH_DOUBLE: FormId[] = ['skins', 'wolf', 'chicago', 'bbb', 'vegas', 'sixes', 'dots', 'stableford', 'rabbit', 'acey'];
for (const f of FORMS) {
  if (WITH_HCP.includes(f.id)) f.settings.unshift(HCP);
  // Chicago is played with the press as a rule (Sascha's concept)
  if (WITH_DOUBLE.includes(f.id)) f.settings.push(...(f.id === 'chicago' ? [{ ...DOUBLE[0], default: true }, ...DOUBLE.slice(1)] : DOUBLE));
}

export const formDef = (id: FormId): FormDef => FORMS.find((f) => f.id === id)!;

/** Nobody loses more than the limit; the winners get proportionally less. */
export function capLoss(money: Record<string, number>, cap: number): Record<string, number> {
  if (!cap) return money;
  const lost = Object.values(money).reduce((a, v) => a + (v < 0 ? -v : 0), 0);
  const paid = Object.values(money).reduce((a, v) => a + (v < 0 ? Math.min(-v, cap) : 0), 0);
  if (lost <= paid) return money;
  const k = lost ? paid / lost : 0;
  return Object.fromEntries(Object.entries(money).map(([id, v]) => [id, v < 0 ? -Math.min(-v, cap) : Math.round(v * k * 100) / 100]));
}
/** The standing as shown: the form's own, with the loss limit applied. */
export function standingOf(g: Game): Standing {
  const f = formDef(g.form);
  let st = f.standing(g);
  if (g.settings.double && g.presses?.length && st.money) {
    // A press doubles the stake of the coming holes – the money so far stays (Sascha's concept): every hole is
    // settled at the stake in force on it (the form's result hole by hole, at stake 1, times that stake).
    const plain: Game = { ...g, settings: { ...g.settings, double: false, stake: 1 }, presses: [] };
    const zero = () => Object.fromEntries(g.players.map((p) => [p.id, 0])) as Record<string, number>;
    const total = zero();
    let prev = zero();
    g.holes.forEach((_, k) => {
      const upto: Game = { ...plain, scores: Object.fromEntries(Object.entries(g.scores).map(([id, s]) => [id, s.map((v, j) => (j <= k ? v : null))])), extra: g.extra.map((x, j) => (j <= k ? x : {})) };
      const m = f.standing(upto).money ?? zero();
      for (const p of g.players) total[p.id] += ((m[p.id] ?? 0) - (prev[p.id] ?? 0)) * stakeAt(g, k);
      prev = m;
    });
    const now = stakeNow(g);
    // Chicago keeps its points in step with the money: all points halved with every press
    const rows = g.form === 'chicago' && now > 0
      ? rank(st.rows.map((r) => {
          const pts = Math.round((total[r.id] / now) * 100) / 100;
          return { ...r, points: pts, value: `${pts > 0 ? '+' : ''}${dec(pts)}` };
        }))
      : st.rows;
    st = { ...st, rows, money: total };
  }
  return st;
}
export const formatEuro = euro;
export const holesPlayed = holesDone;

/** Who pays whom: the fewest payments that settle the balances (largest debt to largest win first). */
export function transfers(money: Record<string, number>): { from: string; to: string; amount: number }[] {
  const cents = Object.entries(money).map(([id, v]) => ({ id, v: Math.round(v * 100) }));
  const pay = cents.filter((x) => x.v < 0).sort((a, b) => a.v - b.v);
  const get = cents.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < pay.length && j < get.length) {
    const amt = Math.min(-pay[i].v, get[j].v);
    if (amt > 0) out.push({ from: pay[i].id, to: get[j].id, amount: amt / 100 });
    pay[i].v += amt;
    get[j].v -= amt;
    if (!pay[i].v) i++;
    if (!get[j].v) j++;
  }
  return out;
}

/** Players per side for the team forms (shown in the setup and the standing). */
export function sidesOf(form: FormId, n: number, partner = 1): [number[], number[]] | null {
  if (n === 4 && ['vegas', 'nassau', 'match', 'hammer'].includes(form)) {
    const k = Math.min(3, Math.max(1, partner));
    return [[0, k], [1, 2, 3].filter((j) => j !== k)];
  }
  return null;
}

export const fitsPlayers = (f: FormDef, n: number): boolean => (f.counts ? f.counts.includes(n) : n >= f.players[0] && n <= f.players[1]);
export const playersText = (f: FormDef): string =>
  f.counts ? f.counts.join(tr(' or ', ' oder ')) + tr(' players', ' Spieler') : f.players[0] === f.players[1] ? `${f.players[0]}${tr(' players', ' Spieler')}` : `${f.players[0]}–${f.players[1]}${tr(' players', ' Spieler')}`;
