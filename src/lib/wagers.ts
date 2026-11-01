import type { HoleEntry, Round } from '../types';
import { isTeamRound } from './games';
import { greenInRegulation, handicapStrokes, stablefordPoints } from './scoring';
import { tr } from './i18n';
import { currencySymbol, money } from './gameforms';

// Bets over a trip (Sascha 01.11.2026: "in America we have bets running – every player his own targets, 20 € each:
// Chris 3 birdies in a row, 12 pars in a row, 5 birdies on 18, 16 greens, −5 …; it must be possible to set up
// individual bets in Games; everything selectable and adjustable; invite people to the bets, and the flight counts each
// other, as in a real tournament").
// A pool of bets in Games, over a period. Each bet is one player's target, built from blocks the app can judge itself
// – or a free bet in words, judged by hand. The rounds are played in Rounds as usual; each phone judges the bets of its
// owner from his rounds (greens, putts, fairways from what he entered) and reports the standing to the pool. "Counted"
// bets take only rounds with a marker whose card player and marker signed (lib/sharedround.ts).
// The bets are chosen per player from a library (Sascha 01.11.2026: "per person a library to pick single bets from –
// extend it with further sensible bets; once I have set up bets, I want to pick from those as templates too").

export type WagerKind =
  | 'birdieRun'
  | 'parRun'
  | 'birdies'
  | 'pars'
  | 'greens'
  | 'fairways'
  | 'oneputts'
  | 'updowns'
  | 'eagles'
  | 'holeInOne'
  | 'stableford'
  | 'putts'
  | 'threeputts'
  | 'doubles'
  | 'penalties'
  | 'score'
  | 'nassau'
  | 'free';
/** run: N holes in a row; count: at least N holes (in a round, or on the whole trip); most: at most N in a complete
 *  round; points: at least N Stableford points in a round; score: the score to par at most N; duel: against one player,
 *  front nine, back nine and the 18 each won by the better score ("5+5+10"). */
type Shape = 'run' | 'count' | 'most' | 'points' | 'score' | 'duel' | 'free';
const SHAPE: Record<WagerKind, Shape> = {
  birdieRun: 'run',
  parRun: 'run',
  birdies: 'count',
  pars: 'count',
  greens: 'count',
  fairways: 'count',
  oneputts: 'count',
  updowns: 'count',
  eagles: 'count',
  holeInOne: 'count',
  stableford: 'points',
  putts: 'most',
  threeputts: 'most',
  doubles: 'most',
  penalties: 'most',
  score: 'score',
  nassau: 'duel',
  free: 'free',
};
export const shapeOf = (k: WagerKind): Shape => SHAPE[k] ?? 'free';

/** success: made it – every other player pays him the stake (missed: nothing); both: missed – he pays every other player;
 *  opponent: against one player – made it he pays, missed he is paid. */
export type Payout = 'success' | 'both' | 'opponent';

export interface Wager {
  id: string;
  /** the pool player whose target it is */
  player: string;
  kind: WagerKind;
  /** the number: holes, putts, points – the score to par for 'score' (−5, +2) */
  target: number;
  /** € */
  stake: number;
  payout: Payout;
  /** payout 'opponent': against whom */
  opponent?: string;
  /** any round of the period, or only the rounds of one day */
  attempts: 'any' | 'day';
  /** attempts 'day': YYYY-MM-DD */
  day?: string;
  /** pars: par or better (a birdie keeps the run going) – else exactly par; birdies: an eagle counts too – else exactly
   *  birdie. Default true. */
  orBetter?: boolean;
  /** runs: a run goes on into the next round (hole 18 → hole 1 of the next) */
  acrossRounds?: boolean;
  /** score: net (minus the playing handicap) – else gross */
  net?: boolean;
  /** per 18 holes (default) or per nine (front or back nine of a round) */
  holes?: 18 | 9;
  /** counts: in one round (default) or added up over all rounds of the trip */
  scope?: 'round' | 'trip';
  /** only rounds with a marker, the card signed by player and marker (a real tournament) */
  counted?: boolean;
  /** free: the bet in words */
  text?: string;
  /** "5+5+10" (Sascha 01.11.2026): the stake of the front nine, the back nine and the 18 – against `opponent` */
  parts?: { front: number; back: number; total: number };
  /** who set it up (a name) */
  by?: string;
}

export interface Progress {
  /** the best so far in counted rounds (the most – or the fewest for "at most" bets and the score); null: no round yet */
  best: number | null;
  /** the best including rounds not counted yet (card not signed) – shown as "provisional" when better */
  pending?: number | null;
  done: boolean;
  /** where it was made: course and date */
  where?: string;
  /** rounds that counted */
  rounds: number;
  /** judged by hand (a free bet, or an argument) – wins over the app's judgement */
  manual?: { done: boolean; by: string };
  /** "5+5+10": what the player won (+) or lost (−) against his opponent so far, and per round who won front, back, total
   *  (1 he, −1 the opponent, 0 tied, null not complete) */
  amount?: number;
  duels?: { day: string; course: string; front: number | null; back: number | null; total: number | null }[];
  at: string;
}

export interface PoolPlayer {
  id: string;
  name: string;
  /** a phone plays as him (the name of the account, when, its account – to find him again on a new phone) */
  joined?: { name: string; at: string; uid?: string };
}

export interface WagerPool {
  kind: 'wager-pool';
  id: string;
  name: string;
  /** the period: YYYY-MM-DD, both days included */
  from: string;
  to: string;
  createdAt: string;
  /** finished by hand: open bets are missed */
  finishedAt?: string | null;
  /** deleted (for everyone): gone from every phone */
  deletedAt?: string | null;
  players: PoolPlayer[];
  wagers: Wager[];
  progress: Record<string, Progress>;
  /** the pool's money: euro (default) or dollar (Sascha 01.11.2026) */
  currency?: 'EUR' | 'USD';
}

// The pools live on the server (Sascha 01.11.2026: "I have set up the bets now – they must never vanish with updates,
// changes and so on"): what is read there must stay readable by every later version – new fields only optional, no
// field renamed or dropped, a block (kind) never removed. wagers.test.ts reads a pool as written on 01.11.2026.
export const isPool = (x: unknown): x is WagerPool => !!x && (x as WagerPool).kind === 'wager-pool' && Array.isArray((x as WagerPool).wagers);

/** A day as YYYY-MM-DD in local time. */
export const dayOf = (d: Date | string): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ---------- what the app judges ----------

/** One round of a player as the bets see it: the holes' par and his entries, in the order played. */
export interface PlayedRound {
  id: string;
  day: string;
  course: string;
  pars: number[];
  entries: (HoleEntry | undefined)[];
  /** his playing handicap in the round */
  hcp: number | null;
  /** the strokes he receives per hole (Stableford) */
  received?: number[];
  /** with a marker, the card signed by player and marker */
  counted: boolean;
  /** the others of his flight in that round – for "5+5+10" against one of them */
  others?: { name: string; entries: (HoleEntry | undefined)[]; hcp: number | null; received: number[]; counted: boolean }[];
}

/** The player's rounds for the bets: his own rounds on this phone (not a preview, not a team's card), oldest first. */
export function playedRounds(rounds: Round[], counted: (r: Round, pid: string) => boolean): PlayedRound[] {
  return rounds
    .filter((r) => !r.preview && !isTeamRound(r) && r.players.some((p) => p.isMe))
    .map((r) => {
      const me = r.players.find((p) => p.isMe)!;
      return {
        id: r.id,
        day: dayOf(r.createdAt),
        course: r.courseName,
        pars: r.holes.map((h) => h.par),
        entries: r.holes.map((_, i) => r.entries[me.id]?.[i]),
        hcp: me.playingHandicap ?? null,
        received: handicapStrokes(r.holes, me.playingHandicap ?? null),
        counted: counted(r, me.id),
        others: r.players
          .filter((p) => !p.isMe)
          .map((p) => ({ name: p.name, entries: r.holes.map((_, i) => r.entries[p.id]?.[i]), hcp: p.playingHandicap ?? null, received: handicapStrokes(r.holes, p.playingHandicap ?? null), counted: counted(r, p.id) })),
        at: r.createdAt,
      };
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map(({ at: _at, ...r }) => r);
}

const strokesOf = (e: HoleEntry | undefined): number | null => (!e || e.pickedUp || e.strokes == null ? null : e.strokes);

/** Does a hole count for a run or a count – null: not played (or picked up). */
function holeHits(w: Wager, e: HoleEntry | undefined, par: number): boolean | null {
  const s = strokesOf(e);
  if (s == null) return null;
  const better = w.orBetter !== false;
  switch (w.kind) {
    case 'birdieRun':
    case 'birdies':
      return better ? s <= par - 1 : s === par - 1;
    case 'parRun':
    case 'pars':
      return better ? s <= par : s === par;
    case 'eagles':
      return s <= par - 2;
    case 'holeInOne':
      return s === 1;
    case 'greens':
      return greenInRegulation(e!, par) === true;
    case 'fairways':
      return e!.fairway === 'hit';
    case 'oneputts':
      return e!.putts === 1;
    case 'updowns':
      return e!.upAndDown === true;
    default:
      return null;
  }
}

/** What an "at most" bet adds up on a hole – null: not known (the round does not count). */
function holeValue(w: Wager, e: HoleEntry | undefined, par: number): number | null {
  if (!e) return null;
  switch (w.kind) {
    case 'putts':
      return e.pickedUp ? null : e.putts;
    case 'threeputts':
      return e.pickedUp || e.putts == null ? null : e.putts >= 3 ? 1 : 0;
    case 'doubles':
      return e.pickedUp ? 1 : e.strokes == null ? null : e.strokes >= par + 2 ? 1 : 0;
    case 'penalties':
      return e.strokes == null && !e.pickedUp ? null : (e.penalties ?? 0);
    default:
      return null;
  }
}

/** The parts of a round a bet is judged on: the whole round, or each nine. */
function parts(r: PlayedRound, holes: 18 | 9): { pars: number[]; entries: (HoleEntry | undefined)[]; received: number[] }[] {
  const received = r.received ?? r.pars.map(() => 0);
  if (holes === 18) return [{ pars: r.pars, entries: r.entries, received }];
  const out = [];
  for (let k = 0; k + 9 <= r.pars.length; k += 9) out.push({ pars: r.pars.slice(k, k + 9), entries: r.entries.slice(k, k + 9), received: received.slice(k, k + 9) });
  return out;
}

const whereOf = (r: PlayedRound) => `${r.course} · ${r.day.slice(8, 10)}.${r.day.slice(5, 7)}.`;
const lower = (w: Wager): boolean => shapeOf(w.kind) === 'most' || shapeOf(w.kind) === 'score';

/** The best of a bet over some rounds: the longest run, the most (or the fewest) in a round, the total of the trip. */
function bestOf(w: Wager, rs: PlayedRound[]): { best: number | null; where?: string } {
  if (!rs.length) return { best: null };
  const shape = shapeOf(w.kind);
  const holes = w.holes ?? 18;
  let best: number | null = null;
  let at: PlayedRound | undefined;
  const take = (v: number, r?: PlayedRound) => {
    if (best == null || (lower(w) ? v < best : v > best)) {
      best = v;
      at = r;
    }
  };
  if (shape === 'run') {
    let run = 0;
    take(0);
    for (const r of rs) {
      if (!w.acrossRounds) run = 0;
      r.pars.forEach((par, i) => {
        run = holeHits(w, r.entries[i], par) ? run + 1 : 0;
        if (run > (best ?? 0)) take(run, r);
      });
    }
  } else if (shape === 'count' && w.scope === 'trip') {
    const total = rs.reduce((n, r) => n + r.pars.filter((par, i) => holeHits(w, r.entries[i], par)).length, 0);
    return { best: total };
  } else if (shape === 'count') {
    for (const r of rs) for (const p of parts(r, holes)) take(p.pars.filter((par, i) => holeHits(w, p.entries[i], par)).length, r);
  } else if (shape === 'most') {
    for (const r of rs) {
      if (holes === 18 && r.pars.length < 18) continue;
      for (const p of parts(r, holes)) {
        const v = p.pars.map((par, i) => holeValue(w, p.entries[i], par));
        if (v.some((x) => x == null)) continue; // only a complete round (or nine)
        take((v as number[]).reduce((a, x) => a + x, 0), r);
      }
    }
  } else if (shape === 'points') {
    for (const r of rs) {
      if (holes === 18 && r.pars.length < 18) continue;
      for (const p of parts(r, holes)) {
        const v = p.pars.map((par, i) => (p.entries[i] ? stablefordPoints(p.entries[i]!, par, p.received[i] ?? 0) : null));
        if (v.some((x) => x == null)) continue;
        take((v as number[]).reduce((a, x) => a + x, 0), r);
      }
    }
  } else if (shape === 'score') {
    for (const r of rs) {
      if (holes === 18 && r.pars.length < 18) continue;
      for (const p of parts(r, holes)) {
        const s = p.entries.map(strokesOf);
        if (s.some((x) => x == null)) continue; // only a complete round (or nine) has a score
        let toPar = (s as number[]).reduce((a, x) => a + x, 0) - p.pars.reduce((a, x) => a + x, 0);
        if (w.net) {
          if (r.hcp == null) continue;
          toPar -= holes === 9 ? Math.round(r.hcp / 2) : r.hcp;
        }
        take(toPar, r);
      }
    }
  }
  const found = at as PlayedRound | undefined;
  return { best, where: found && whereOf(found) };
}

const reached = (w: Wager, best: number | null): boolean => best != null && (lower(w) ? best <= w.target : best >= w.target);

const sameName = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0]);
};
/** A nine's or the 18's score – gross, or net with the strokes received on its holes; null when a hole is missing. */
function partScore(entries: (HoleEntry | undefined)[], received: number[], from: number, to: number, net: boolean): number | null {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const s = strokesOf(entries[i]);
    if (s == null) return null;
    sum += s - (net ? (received[i] ?? 0) : 0);
  }
  return sum;
}
const beats = (a: number | null, b: number | null): number | null => (a == null || b == null ? null : a < b ? 1 : a > b ? -1 : 0);

/** "5+5+10" (Sascha 01.11.2026: "stroke play over 18 – the better score on the first nine wins the 5 dollars, the same on
 *  the second nine, and then who wins over 18; a tie wins nothing"): every round both played in one flight (or the one
 *  of its day), each part settled on its own. */
function judgeDuel(w: Wager, pool: Pick<WagerPool, 'from' | 'to'> & { players?: PoolPlayer[] }, rounds: PlayedRound[], now: string): Progress {
  const opp = pool.players?.find((p) => p.id === w.opponent)?.name ?? '';
  const parts = w.parts ?? { front: 0, back: 0, total: 0 };
  const inTime = rounds.filter((r) => r.day >= pool.from && r.day <= pool.to && (w.attempts !== 'day' || r.day === w.day) && r.pars.length >= 18);
  const pairs = inTime
    .map((r) => ({ r, o: r.others?.find((x) => sameName(x.name, opp)) }))
    .filter((x): x is { r: PlayedRound; o: NonNullable<PlayedRound['others']>[number] } => !!x.o && (!w.counted || (x.r.counted && x.o.counted)));
  const take = w.attempts === 'day' ? pairs.slice(0, 1) : pairs;
  let amount = 0;
  const duels = take.map(({ r, o }) => {
    const mine = r.received ?? r.pars.map(() => 0);
    const d = {
      day: r.day,
      course: r.course,
      front: beats(partScore(r.entries, mine, 0, 9, !!w.net), partScore(o.entries, o.received, 0, 9, !!w.net)),
      back: beats(partScore(r.entries, mine, 9, 18, !!w.net), partScore(o.entries, o.received, 9, 18, !!w.net)),
      total: beats(partScore(r.entries, mine, 0, 18, !!w.net), partScore(o.entries, o.received, 0, 18, !!w.net)),
    };
    amount += (d.front ?? 0) * parts.front + (d.back ?? 0) * parts.back + (d.total ?? 0) * parts.total;
    return d;
  });
  return { best: null, done: false, rounds: take.length, amount, duels, at: now };
}

/** A bet judged from the player's rounds: the rounds of the period (of its day), counted ones only when it asks. */
export function judge(w: Wager, pool: Pick<WagerPool, 'from' | 'to'> & { players?: PoolPlayer[] }, rounds: PlayedRound[], now = new Date().toISOString()): Progress {
  if (shapeOf(w.kind) === 'duel') return judgeDuel(w, pool, rounds, now);
  const inTime = rounds.filter((r) => r.day >= pool.from && r.day <= pool.to && (w.attempts !== 'day' || r.day === w.day));
  const counting = w.counted ? inTime.filter((r) => r.counted) : inTime;
  const b = bestOf(w, counting);
  const all = w.counted ? bestOf(w, inTime).best : b.best;
  const better = all != null && (b.best == null || (lower(w) ? all < b.best : all > b.best));
  const done = reached(w, b.best);
  return { best: b.best, ...(better ? { pending: all } : {}), done, ...(done && b.where ? { where: b.where } : {}), rounds: counting.length, at: now };
}

/** Did the judgement change (not only its time)? */
export const sameProgress = (a: Progress | undefined, b: Progress): boolean => !!a && JSON.stringify({ ...a, at: '', manual: undefined }) === JSON.stringify({ ...b, at: '', manual: undefined });

export type WagerState = 'done' | 'missed' | 'open';
/** Made, missed or still open: by hand if judged so; missed once its day or the period is over, or the pool finished. */
export function stateOf(w: Wager, pool: WagerPool, today = dayOf(new Date())): WagerState {
  const p = pool.progress[w.id];
  if (shapeOf(w.kind) === 'duel') {
    // settled round by round; decided once its day or the period is over (or its one round played)
    const over = !!pool.finishedAt || today > pool.to || (w.attempts === 'day' && ((!!w.day && today > w.day) || (p?.duels?.some((d) => d.total != null) ?? false)));
    return over ? 'done' : 'open';
  }
  if (p?.manual) return p.manual.done ? 'done' : 'missed';
  if (w.kind !== 'free' && p?.done) return 'done';
  const over = !!pool.finishedAt || today > pool.to || (w.attempts === 'day' && !!w.day && today > w.day);
  return over ? 'missed' : 'open';
}

/** Each player's balance from the bets made or missed (€). */
export function balances(pool: WagerPool, today?: string): Record<string, number> {
  const money: Record<string, number> = Object.fromEntries(pool.players.map((p) => [p.id, 0]));
  const add = (id: string, v: number) => (money[id] = (money[id] ?? 0) + v);
  for (const w of pool.wagers) {
    if (shapeOf(w.kind) === 'duel') {
      // "5+5+10": what the rounds played so far settled, between the two
      const v = pool.progress[w.id]?.amount ?? 0;
      if (w.opponent && w.opponent !== w.player && v) {
        add(w.player, v);
        add(w.opponent, -v);
      }
      continue;
    }
    const st = stateOf(w, pool, today);
    if (st === 'open' || !(w.stake > 0)) continue;
    const others = w.payout === 'opponent' ? (w.opponent && w.opponent !== w.player ? [w.opponent] : []) : pool.players.map((p) => p.id).filter((id) => id !== w.player);
    if (st === 'missed' && w.payout === 'success') continue;
    const sign = st === 'done' ? 1 : -1;
    for (const o of others) {
      add(w.player, sign * w.stake);
      add(o, -sign * w.stake);
    }
  }
  return money;
}

// ---------- words ----------

const fmtPar = (n: number): string => (n === 0 ? tr('even', 'Par') : n > 0 ? `+${n}` : `−${-n}`);

/** The bet in a few words: "3 birdies in a row", "−5 gross", "at most 30 putts on 18". (The push function says them
 *  the same way – supabase/functions/golfos-push, betLabel; a test keeps both alike.) */
export function wagerLabel(w: Wager): string {
  const n = w.target;
  const on = w.scope === 'trip' && shapeOf(w.kind) === 'count' ? tr('on the trip', 'auf der Reise') : (w.holes ?? 18) === 9 ? tr('on 9', 'auf 9') : tr('on 18', 'auf 18');
  switch (w.kind) {
    case 'birdieRun':
      return tr(`${n} birdies in a row`, `${n} Birdies in Folge`);
    case 'parRun':
      return tr(`${n} pars in a row`, `${n} Pars in Folge`);
    case 'birdies':
      return tr(`${n} birdies ${on}`, `${n} Birdies ${on}`);
    case 'pars':
      return tr(`${n} pars ${on}`, `${n} Pars ${on}`);
    case 'greens':
      return tr(`${n} greens ${on}`, `${n} Grüns ${on}`);
    case 'fairways':
      return tr(`${n} fairways ${on}`, `${n} Fairways ${on}`);
    case 'oneputts':
      return tr(`${n} one-putts ${on}`, `${n} Ein-Putts ${on}`);
    case 'updowns':
      return tr(`${n} up & downs ${on}`, `${n} Up & Downs ${on}`);
    case 'eagles':
      return n === 1 ? tr(`An eagle ${on}`, `Ein Eagle ${on}`) : tr(`${n} eagles ${on}`, `${n} Eagles ${on}`);
    case 'holeInOne':
      return n === 1 ? tr(`A hole-in-one ${on}`, `Ein Hole-in-One ${on}`) : tr(`${n} holes-in-one ${on}`, `${n} Hole-in-Ones ${on}`);
    case 'stableford':
      return tr(`${n} Stableford points ${on}`, `${n} Stableford-Punkte ${on}`);
    case 'putts':
      return tr(`At most ${n} putts ${on}`, `Höchstens ${n} Putts ${on}`);
    case 'threeputts':
      return n === 0 ? tr(`No three-putt ${on}`, `Kein Drei-Putt ${on}`) : tr(`At most ${n} three-putts ${on}`, `Höchstens ${n} Drei-Putts ${on}`);
    case 'doubles':
      return n === 0 ? tr(`No double bogey ${on}`, `Kein Doppelbogey ${on}`) : tr(`At most ${n} double bogeys ${on}`, `Höchstens ${n} Doppelbogeys ${on}`);
    case 'penalties':
      return n === 0 ? tr(`No penalty stroke ${on}`, `Kein Strafschlag ${on}`) : tr(`At most ${n} penalty strokes ${on}`, `Höchstens ${n} Strafschläge ${on}`);
    case 'score':
      return `${fmtPar(n)} ${w.net ? tr('net', 'netto') : tr('gross', 'brutto')}${(w.holes ?? 18) === 9 ? tr(' on 9', ' auf 9') : ''}`;
    case 'nassau': {
      const p = w.parts ?? { front: 0, back: 0, total: 0 };
      return `${p.front}+${p.back}+${p.total} ${w.net ? tr('net', 'netto') : tr('gross', 'brutto')}`;
    }
    case 'free':
      return w.text?.trim() || tr('Free bet', 'Freie Wette');
  }
}

/** How it is counted and paid, in a line. */
export function wagerRules(w: Wager, pool: Pick<WagerPool, 'players' | 'currency'>): string {
  const name = (id?: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  const sym = currencySymbol(pool.currency);
  if (shapeOf(w.kind) === 'duel') {
    const p = w.parts ?? { front: 0, back: 0, total: 0 };
    const bits = [
      tr(`against ${name(w.opponent)}`, `gegen ${name(w.opponent)}`),
      tr(`front ${money(p.front, sym)} · back ${money(p.back, sym)} · 18 ${money(p.total, sym)}`, `vorne ${money(p.front, sym)} · hinten ${money(p.back, sym)} · gesamt ${money(p.total, sym)}`),
      w.attempts === 'day' && w.day ? tr(`only on ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`, `nur am ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`) : tr('every round together', 'jede gemeinsame Runde'),
    ];
    if (w.counted) bits.push(tr('with marker', 'mit Zähler'));
    return bits.join(' · ');
  }
  const pay =
    w.payout === 'opponent'
      ? tr(`against ${name(w.opponent)}`, `gegen ${name(w.opponent)}`)
      : w.payout === 'both'
        ? tr('both ways', 'beidseitig')
        : tr('paid when made', 'nur bei Erfolg');
  const bits = [money(w.stake, sym), pay];
  if (w.attempts === 'day' && w.day) bits.push(tr(`only on ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`, `nur am ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`));
  if ((w.kind === 'parRun' || w.kind === 'pars') && w.orBetter === false) bits.push(tr('exactly par', 'genau Par'));
  if ((w.kind === 'birdieRun' || w.kind === 'birdies') && w.orBetter === false) bits.push(tr('exactly birdie', 'genau Birdie'));
  if ((w.kind === 'parRun' || w.kind === 'birdieRun') && w.acrossRounds) bits.push(tr('over rounds', 'über Runden'));
  if (w.counted && w.kind !== 'free') bits.push(tr('with marker', 'mit Zähler'));
  return bits.join(' · ');
}

/** The standing of a bet in words: "best 2 (target 3)", "best round +3 (target −5)", "so far 7 (target 10)". */
export function progressText(w: Wager, p: Progress | undefined, currency?: 'EUR' | 'USD'): string {
  if (w.kind === 'free') return '';
  if (shapeOf(w.kind) === 'duel') {
    if (!p?.duels?.length) return tr('no round together yet', 'noch keine gemeinsame Runde');
    const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(v, currencySymbol(currency))}`;
    const mark = (v: number | null) => (v == null ? '–' : v > 0 ? '✓' : v < 0 ? '✗' : '=');
    const last = p.duels[p.duels.length - 1];
    return tr(
      `${p.duels.length} ${p.duels.length === 1 ? 'round' : 'rounds'} · ${sign(p.amount ?? 0)} · last: front ${mark(last.front)} back ${mark(last.back)} 18 ${mark(last.total)}`,
      `${p.duels.length} ${p.duels.length === 1 ? 'Runde' : 'Runden'} · ${sign(p.amount ?? 0)} · zuletzt: vorne ${mark(last.front)} hinten ${mark(last.back)} gesamt ${mark(last.total)}`,
    );
  }
  const shape = shapeOf(w.kind);
  const show = (v: number): string => (shape === 'score' ? fmtPar(v) : String(v));
  const pend = p?.pending != null ? tr(` · ${show(p.pending)} not signed yet`, ` · ${show(p.pending)} noch nicht unterschrieben`) : '';
  if (!p || p.best == null) return (p?.pending != null ? tr('no counted round yet', 'noch keine gezählte Runde') : tr('no complete round yet', 'noch keine passende Runde')) + pend;
  if (shape === 'count' && w.scope === 'trip') return tr(`so far ${p.best} (target ${w.target})`, `bisher ${p.best} (Ziel ${w.target})`) + pend;
  if (shape === 'run') return tr(`best ${p.best} (target ${w.target})`, `bestes ${p.best} (Ziel ${w.target})`) + pend;
  if (shape === 'most') return tr(`best round ${p.best} (target at most ${w.target})`, `beste Runde ${p.best} (Ziel höchstens ${w.target})`) + pend;
  return tr(`best round ${show(p.best)} (target ${show(w.target)})`, `beste Runde ${show(p.best)} (Ziel ${show(w.target)})`) + pend;
}

/** The blocks, for changing a bet: their name, what the number means, its lowest value. */
export const KINDS: { kind: WagerKind; name: () => string; number: () => string; min: number }[] = [
  { kind: 'birdieRun', name: () => tr('Birdies in a row', 'Birdies in Folge'), number: () => tr('Birdies in a row', 'Birdies in Folge'), min: 1 },
  { kind: 'parRun', name: () => tr('Pars in a row', 'Pars in Folge'), number: () => tr('Pars in a row', 'Pars in Folge'), min: 1 },
  { kind: 'birdies', name: () => tr('Birdies', 'Birdies'), number: () => tr('Birdies', 'Birdies'), min: 1 },
  { kind: 'pars', name: () => tr('Pars', 'Pars'), number: () => tr('Pars', 'Pars'), min: 1 },
  { kind: 'greens', name: () => tr('Greens hit', 'Grüns getroffen'), number: () => tr('Greens in regulation', 'Grüns getroffen (GIR)'), min: 1 },
  { kind: 'fairways', name: () => tr('Fairways hit', 'Fairways getroffen'), number: () => tr('Fairways hit', 'Fairways getroffen'), min: 1 },
  { kind: 'oneputts', name: () => tr('One-putts', 'Ein-Putts'), number: () => tr('One-putts', 'Ein-Putts'), min: 1 },
  { kind: 'updowns', name: () => tr('Up & downs', 'Up & Downs'), number: () => tr('Up & downs', 'Up & Downs'), min: 1 },
  { kind: 'eagles', name: () => tr('Eagles', 'Eagles'), number: () => tr('Eagles', 'Eagles'), min: 1 },
  { kind: 'holeInOne', name: () => tr('Hole-in-one', 'Hole-in-One'), number: () => tr('Holes-in-one', 'Hole-in-Ones'), min: 1 },
  { kind: 'stableford', name: () => tr('Stableford points', 'Stableford-Punkte'), number: () => tr('Points', 'Punkte'), min: 1 },
  { kind: 'putts', name: () => tr('At most putts', 'Höchstens Putts'), number: () => tr('Putts at most', 'Höchstens Putts'), min: 0 },
  { kind: 'threeputts', name: () => tr('At most three-putts', 'Höchstens Drei-Putts'), number: () => tr('Three-putts at most', 'Höchstens Drei-Putts'), min: 0 },
  { kind: 'doubles', name: () => tr('At most double bogeys', 'Höchstens Doppelbogeys'), number: () => tr('Double bogeys at most', 'Höchstens Doppelbogeys'), min: 0 },
  { kind: 'penalties', name: () => tr('At most penalty strokes', 'Höchstens Strafschläge'), number: () => tr('Penalty strokes at most', 'Höchstens Strafschläge'), min: 0 },
  { kind: 'score', name: () => tr('Score to par', 'Ergebnis zu Par'), number: () => tr('To par (−5, +2 …)', 'Zu Par (−5, +2 …)'), min: -30 },
  { kind: 'nassau', name: () => tr('Front · back · 18 (5+5+10)', 'Vorne · hinten · gesamt (5+5+10)'), number: () => '', min: 0 },
  { kind: 'free', name: () => tr('Free bet', 'Freie Wette'), number: () => '', min: 0 },
];

// ---------- the library (Sascha 01.11.2026: "per person a library to pick single bets from") ----------

export interface LibraryBet {
  id: string;
  group: 'runs' | 'round' | 'roundMost' | 'score' | 'duel' | 'trip' | 'own';
  kind: WagerKind;
  /** the options this entry sets (net, the whole trip …) */
  patch?: Partial<Wager>;
  /** the number suggested */
  start: number;
  name: () => string;
  hint: () => string;
}
export const LIBRARY_GROUPS: { group: LibraryBet['group']; name: () => string }[] = [
  { group: 'runs', name: () => tr('In a row', 'In Folge') },
  { group: 'round', name: () => tr('In one round – at least', 'In einer Runde – mindestens') },
  { group: 'roundMost', name: () => tr('In one round – at most', 'In einer Runde – höchstens') },
  { group: 'score', name: () => tr('Score of a round', 'Ergebnis einer Runde') },
  { group: 'duel', name: () => tr('Against each other', 'Gegeneinander') },
  { group: 'trip', name: () => tr('On the whole trip', 'Auf der ganzen Reise') },
  { group: 'own', name: () => tr('Your own', 'Eigene') },
];
export const LIBRARY: LibraryBet[] = [
  { id: 'birdieRun', group: 'runs', kind: 'birdieRun', start: 2, name: () => tr('Birdies in a row', 'Birdies in Folge'), hint: () => tr('Birdie or better on holes one after the other', 'Birdie oder besser auf Löchern hintereinander') },
  { id: 'parRun', group: 'runs', kind: 'parRun', start: 8, name: () => tr('Pars in a row', 'Pars in Folge'), hint: () => tr('Par or better – no bogey in between', 'Par oder besser – kein Bogey dazwischen') },
  { id: 'birdies', group: 'round', kind: 'birdies', start: 3, name: () => tr('Birdies', 'Birdies'), hint: () => tr('Birdie or better, in one round', 'Birdie oder besser, in einer Runde') },
  { id: 'pars', group: 'round', kind: 'pars', start: 10, name: () => tr('Pars', 'Pars'), hint: () => tr('Par or better, in one round', 'Par oder besser, in einer Runde') },
  { id: 'greens', group: 'round', kind: 'greens', start: 9, name: () => tr('Greens hit', 'Grüns getroffen'), hint: () => tr('On the green in regulation – from strokes and putts', 'In Regulation aufs Grün – aus Schlägen und Putts') },
  { id: 'fairways', group: 'round', kind: 'fairways', start: 7, name: () => tr('Fairways hit', 'Fairways getroffen'), hint: () => tr('The drive on the fairway (par 4 and 5)', 'Der Abschlag auf dem Fairway (Par 4 und 5)') },
  { id: 'oneputts', group: 'round', kind: 'oneputts', start: 5, name: () => tr('One-putts', 'Ein-Putts'), hint: () => tr('Holed with one putt', 'Mit einem Putt eingelocht') },
  { id: 'updowns', group: 'round', kind: 'updowns', start: 3, name: () => tr('Up & downs', 'Up & Downs'), hint: () => tr('Green missed, still par or better', 'Grün verfehlt, trotzdem Par oder besser') },
  { id: 'eagles', group: 'round', kind: 'eagles', start: 1, name: () => tr('Eagle', 'Eagle'), hint: () => tr('Two under par on a hole', 'Zwei unter Par an einem Loch') },
  { id: 'stableford', group: 'round', kind: 'stableford', start: 36, name: () => tr('Stableford points', 'Stableford-Punkte'), hint: () => tr('With his playing handicap', 'Mit seiner Spielvorgabe') },
  { id: 'putts', group: 'roundMost', kind: 'putts', start: 32, name: () => tr('Putts', 'Putts'), hint: () => tr('At most this many putts in a round', 'Höchstens so viele Putts in einer Runde') },
  { id: 'threeputts', group: 'roundMost', kind: 'threeputts', start: 0, name: () => tr('Three-putts', 'Drei-Putts'), hint: () => tr('0 = not a single three-putt', '0 = kein einziger Drei-Putt') },
  { id: 'doubles', group: 'roundMost', kind: 'doubles', start: 1, name: () => tr('Double bogeys', 'Doppelbogeys'), hint: () => tr('Double bogey or worse (or picked up)', 'Doppelbogey oder schlechter (auch aufgehoben)') },
  { id: 'penalties', group: 'roundMost', kind: 'penalties', start: 0, name: () => tr('Penalty strokes', 'Strafschläge'), hint: () => tr('Water, out of bounds, unplayable', 'Wasser, Aus, unspielbar') },
  { id: 'scoreGross', group: 'score', kind: 'score', start: 10, name: () => tr('Gross to par', 'Brutto zu Par'), hint: () => tr('e.g. +2: at most 2 over par', 'z. B. +2: höchstens 2 über Par') },
  { id: 'scoreNet', group: 'score', kind: 'score', patch: { net: true }, start: 0, name: () => tr('Net to par', 'Netto zu Par'), hint: () => tr('Minus his playing handicap – 0: play to his handicap', 'Minus Spielvorgabe – 0: die Vorgabe spielen') },
  { id: 'nassau', group: 'duel', kind: 'nassau', patch: { payout: 'opponent', parts: { front: 5, back: 5, total: 10 } }, start: 0, name: () => tr('5+5+10 – front, back, 18', '5+5+10 – vorne, hinten, gesamt'), hint: () => tr('Against each chosen player: the better score on the front nine, the back nine and the 18 wins its stake – a tie wins nothing', 'Gegen jeden gewählten Spieler: der bessere Score vorne, hinten und über 18 gewinnt den Einsatz – Gleichstand gewinnt nichts') },
  { id: 'birdiesTrip', group: 'trip', kind: 'birdies', patch: { scope: 'trip' }, start: 10, name: () => tr('Birdies on the trip', 'Birdies auf der Reise'), hint: () => tr('All rounds added up', 'Alle Runden zusammen') },
  { id: 'parsTrip', group: 'trip', kind: 'pars', patch: { scope: 'trip' }, start: 40, name: () => tr('Pars on the trip', 'Pars auf der Reise'), hint: () => tr('Par or better, all rounds added up', 'Par oder besser, alle Runden zusammen') },
  { id: 'eaglesTrip', group: 'trip', kind: 'eagles', patch: { scope: 'trip' }, start: 1, name: () => tr('Eagle on the trip', 'Eagle auf der Reise'), hint: () => tr('In any round', 'In irgendeiner Runde') },
  { id: 'holeInOne', group: 'trip', kind: 'holeInOne', patch: { scope: 'trip' }, start: 1, name: () => tr('Hole-in-one', 'Hole-in-One'), hint: () => tr('In any round', 'In irgendeiner Runde') },
  { id: 'free', group: 'own', kind: 'free', start: 0, name: () => tr('Free bet', 'Freie Wette'), hint: () => tr('In words – decided by hand (longest drive, nearest the pin …)', 'In Worten – von Hand entschieden (längster Drive, nächster zur Fahne …)') },
];

/** A bet from the library for a player: the number chosen, the stake and the rest as set. */
export function fromLibrary(b: LibraryBet, base: Omit<Wager, 'id' | 'kind' | 'target'>, target: number, id: string, text?: string): Wager {
  return { ...base, ...b.patch, id, kind: b.kind, target, ...(b.kind === 'free' ? { text: (text ?? '').trim() } : {}) };
}

// ---------- bets set up before, as templates (Sascha: "once I have set up bets, pick from those as templates") ----------

/** A bet set up before: where it was (pool · player) and the bet itself. */
export interface EarlierBet {
  from: string;
  wager: Wager;
}
/** What makes two bets the same template: everything but who and which. */
export const betKey = (w: Wager): string => {
  const { id: _i, player: _p, by: _b, opponent: _o, ...rest } = w;
  return JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([a], [b]) => (a < b ? -1 : 1))));
};

/** The earlier bets grouped by where they were ("USA 2026 · Chris"), each bet once per group, newest groups first. */
export function earlierGroups(bets: EarlierBet[]): { from: string; wagers: Wager[] }[] {
  const out: { from: string; wagers: Wager[]; keys: Set<string> }[] = [];
  for (const b of bets) {
    let g = out.find((x) => x.from === b.from);
    if (!g) out.push((g = { from: b.from, wagers: [], keys: new Set() }));
    const k = betKey(b.wager);
    if (g.keys.has(k)) continue;
    g.keys.add(k);
    g.wagers.push(b.wager);
  }
  return out.map(({ from, wagers }) => ({ from, wagers }));
}

/** An earlier bet for another player of this pool: a new bet, the same rules – what does not fit here made plain
 *  (an opponent not in this pool: paid when made; a day outside the period: every round). */
export function fromEarlier(w: Wager, player: string, pool: Pick<WagerPool, 'players' | 'from' | 'to'>, id: string): Wager {
  const opp = w.payout === 'opponent' && (!w.opponent || w.opponent === player || !pool.players.some((p) => p.id === w.opponent));
  const day = w.attempts === 'day' && (!w.day || w.day < pool.from || w.day > pool.to);
  return { ...w, id, player, ...(opp ? { payout: 'success' as const, opponent: undefined } : {}), ...(day ? { attempts: 'any' as const, day: undefined } : {}) };
}
