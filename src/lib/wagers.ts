import type { HoleEntry, Round } from '../types';
import { isTeamRound } from './games';
import { greenInRegulation } from './scoring';
import { tr } from './i18n';

// Bets over a trip (Sascha 01.11.2026: "in America we have bets running – every player his own targets, 20 € each:
// Chris 3 birdies in a row, 12 pars in a row, 5 birdies on 18, 16 greens, −5 …; it must be possible to set up
// individual bets in Games; everything selectable and adjustable; invite people to the bets, and the flight counts each
// other, as in a real tournament").
// A pool of bets in Games, over a period. Each bet is one player's target, built from blocks the app can judge itself
// (runs, counts per round, the score to par) – or a free bet in words, judged by hand. The rounds are played in Rounds as
// usual; each phone judges the bets of its owner from his rounds (the greens from the putts) and reports the standing to
// the pool. "Counted" bets take only rounds with a marker whose card player and marker signed (lib/sharedround.ts).

export type WagerKind = 'birdieRun' | 'parRun' | 'birdies' | 'greens' | 'score' | 'free';
/** success: made it – every other player pays him the stake (missed: nothing); both: missed – he pays every other player;
 *  opponent: against one player – made it he pays, missed he is paid. */
export type Payout = 'success' | 'both' | 'opponent';

export interface Wager {
  id: string;
  /** the pool player whose target it is */
  player: string;
  kind: WagerKind;
  /** the number: birdies, pars, greens – the score to par for 'score' (−5, +2) */
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
  /** pars: par or better (birdie keeps the run going) – else exactly par; birdies: an eagle counts too – else exactly
   *  birdie. Default true. */
  orBetter?: boolean;
  /** runs: a run goes on into the next round (hole 18 → hole 1 of the next) */
  acrossRounds?: boolean;
  /** score: net (minus the playing handicap) – else gross */
  net?: boolean;
  /** counts and score: per 18 holes (default) or per nine (front or back nine of a round) */
  holes?: 18 | 9;
  /** only rounds with a marker, the card signed by player and marker (a real tournament) */
  counted?: boolean;
  /** free: the bet in words */
  text?: string;
  /** who set it up (a name) */
  by?: string;
}

export interface Progress {
  /** the best so far in counted rounds (runs and counts: the most; score: the lowest to par); null: no round yet */
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
  at: string;
}

export interface PoolPlayer {
  id: string;
  name: string;
  /** a phone plays as him (the name of the account, when) */
  joined?: { name: string; at: string };
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
  players: PoolPlayer[];
  wagers: Wager[];
  progress: Record<string, Progress>;
}

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
  /** with a marker, the card signed by player and marker */
  counted: boolean;
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
        counted: counted(r, me.id),
        at: r.createdAt,
      };
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map(({ at: _at, ...r }) => r);
}

const strokesOf = (e: HoleEntry | undefined): number | null => (!e || e.pickedUp || e.strokes == null ? null : e.strokes);

/** Does a hole count for the bet: a birdie (or better), a par (or better) – null: not played (or picked up). */
function holeHits(w: Wager, e: HoleEntry | undefined, par: number): boolean | null {
  const s = strokesOf(e);
  if (s == null) return null;
  const better = w.orBetter !== false;
  if (w.kind === 'birdieRun' || w.kind === 'birdies') return better ? s <= par - 1 : s === par - 1;
  if (w.kind === 'parRun') return better ? s <= par : s === par;
  if (w.kind === 'greens') return greenInRegulation(e!, par) === true;
  return null;
}

/** The parts of a round a count or a score is judged on: the whole round, or each nine. */
function parts(r: PlayedRound, holes: 18 | 9): { pars: number[]; entries: (HoleEntry | undefined)[] }[] {
  if (holes === 18) return [{ pars: r.pars, entries: r.entries }];
  const out = [];
  for (let k = 0; k + 9 <= r.pars.length; k += 9) out.push({ pars: r.pars.slice(k, k + 9), entries: r.entries.slice(k, k + 9) });
  return out;
}

/** The best of a bet over some rounds: the longest run, the most in one round, the lowest score to par. */
function bestOf(w: Wager, rs: PlayedRound[]): { best: number | null; where?: string } {
  if (!rs.length) return { best: null };
  const where = (r: PlayedRound) => `${r.course} · ${r.day.slice(8, 10)}.${r.day.slice(5, 7)}.`;
  if (w.kind === 'birdieRun' || w.kind === 'parRun') {
    let best = 0;
    let at: PlayedRound | undefined;
    let run = 0;
    for (const r of rs) {
      if (!w.acrossRounds) run = 0;
      r.pars.forEach((par, i) => {
        run = holeHits(w, r.entries[i], par) ? run + 1 : 0;
        if (run > best) {
          best = run;
          at = r;
        }
      });
    }
    return { best, where: at && where(at) };
  }
  if (w.kind === 'birdies' || w.kind === 'greens') {
    let best = 0;
    let at: PlayedRound | undefined;
    for (const r of rs)
      for (const p of parts(r, w.holes ?? 18)) {
        const n = p.pars.filter((par, i) => holeHits(w, p.entries[i], par)).length;
        if (n > best) {
          best = n;
          at = r;
        }
      }
    return { best, where: at && where(at) };
  }
  if (w.kind === 'score') {
    const holes = w.holes ?? 18;
    let best: number | null = null;
    let at: PlayedRound | undefined;
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
        if (best == null || toPar < best) {
          best = toPar;
          at = r;
        }
      }
    }
    return { best, where: at && where(at) };
  }
  return { best: null };
}

const reached = (w: Wager, best: number | null): boolean => best != null && (w.kind === 'score' ? best <= w.target : best >= w.target);

/** A bet judged from the player's rounds: the rounds of the period (of its day), counted ones only when it asks. */
export function judge(w: Wager, pool: Pick<WagerPool, 'from' | 'to'>, rounds: PlayedRound[], now = new Date().toISOString()): Progress {
  const inTime = rounds.filter((r) => r.day >= pool.from && r.day <= pool.to && (w.attempts !== 'day' || r.day === w.day));
  const counting = w.counted ? inTime.filter((r) => r.counted) : inTime;
  const b = bestOf(w, counting);
  const all = w.counted ? bestOf(w, inTime).best : b.best;
  const better = all != null && (b.best == null || (w.kind === 'score' ? all < b.best : all > b.best));
  return { best: b.best, ...(better ? { pending: all } : {}), done: reached(w, b.best), ...(reached(w, b.best) && b.where ? { where: b.where } : {}), rounds: counting.length, at: now };
}

/** Did the judgement change (not only its time)? */
export const sameProgress = (a: Progress | undefined, b: Progress): boolean => !!a && JSON.stringify({ ...a, at: '', manual: undefined }) === JSON.stringify({ ...b, at: '', manual: undefined });

export type WagerState = 'done' | 'missed' | 'open';
/** Made, missed or still open: by hand if judged so; missed once its day or the period is over, or the pool finished. */
export function stateOf(w: Wager, pool: WagerPool, today = dayOf(new Date())): WagerState {
  const p = pool.progress[w.id];
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

/** The bet in a few words: "3 birdies in a row", "−5 gross". */
export function wagerLabel(w: Wager): string {
  const n = w.target;
  const nine = (w.holes ?? 18) === 9;
  switch (w.kind) {
    case 'birdieRun':
      return tr(`${n} birdies in a row`, `${n} Birdies in Folge`);
    case 'parRun':
      return tr(`${n} pars in a row`, `${n} Pars in Folge`);
    case 'birdies':
      return nine ? tr(`${n} birdies on 9`, `${n} Birdies auf 9`) : tr(`${n} birdies on 18`, `${n} Birdies auf 18`);
    case 'greens':
      return nine ? tr(`${n} greens on 9`, `${n} Grüns auf 9`) : tr(`${n} greens on 18`, `${n} Grüns auf 18`);
    case 'score':
      return `${fmtPar(n)} ${w.net ? tr('net', 'netto') : tr('gross', 'brutto')}${nine ? tr(' on 9', ' auf 9') : ''}`;
    case 'free':
      return w.text?.trim() || tr('Free bet', 'Freie Wette');
  }
}

/** How it is counted and paid, in a line. */
export function wagerRules(w: Wager, pool: WagerPool): string {
  const name = (id?: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  const pay =
    w.payout === 'opponent'
      ? tr(`against ${name(w.opponent)}`, `gegen ${name(w.opponent)}`)
      : w.payout === 'both'
        ? tr('both ways', 'beidseitig')
        : tr('paid when made', 'nur bei Erfolg');
  const bits = [`${w.stake} €`, pay];
  if (w.attempts === 'day' && w.day) bits.push(tr(`only on ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`, `nur am ${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`));
  if ((w.kind === 'parRun' || w.kind === 'birdieRun' || w.kind === 'birdies') && w.orBetter === false) bits.push(w.kind === 'parRun' ? tr('exactly par', 'genau Par') : tr('exactly birdie', 'genau Birdie'));
  if ((w.kind === 'parRun' || w.kind === 'birdieRun') && w.acrossRounds) bits.push(tr('over rounds', 'über Runden'));
  if (w.counted && w.kind !== 'free') bits.push(tr('with marker', 'mit Zähler'));
  return bits.join(' · ');
}

/** The standing of a bet in words: "best 2 of 3", "best round +3 (target −5)". */
export function progressText(w: Wager, p: Progress | undefined): string {
  if (w.kind === 'free') return '';
  const pend = p?.pending != null ? tr(` · ${show(w, p.pending)} not signed yet`, ` · ${show(w, p.pending)} noch nicht unterschrieben`) : '';
  if (!p || p.best == null) return (p?.pending != null ? tr('no counted round yet', 'noch keine gezählte Runde') : tr('no round yet', 'noch keine Runde')) + pend;
  if (w.kind === 'score') return tr(`best ${fmtPar(p.best)} (target ${fmtPar(w.target)})`, `beste Runde ${fmtPar(p.best)} (Ziel ${fmtPar(w.target)})`) + pend;
  return tr(`best ${p.best} (target ${w.target})`, `bestes ${p.best} (Ziel ${w.target})`) + pend;
}
const show = (w: Wager, v: number): string => (w.kind === 'score' ? fmtPar(v) : String(v));

/** The blocks to choose from, with the number's meaning and a start value. */
export const KINDS: { kind: WagerKind; name: () => string; number: () => string; start: number }[] = [
  { kind: 'birdieRun', name: () => tr('Birdies in a row', 'Birdies in Folge'), number: () => tr('Birdies in a row', 'Birdies in Folge'), start: 2 },
  { kind: 'parRun', name: () => tr('Pars in a row', 'Pars in Folge'), number: () => tr('Pars in a row', 'Pars in Folge'), start: 8 },
  { kind: 'birdies', name: () => tr('Birdies in a round', 'Birdies in einer Runde'), number: () => tr('Birdies', 'Birdies'), start: 3 },
  { kind: 'greens', name: () => tr('Greens in a round', 'Grüns in einer Runde'), number: () => tr('Greens in regulation', 'Grüns getroffen (GIR)'), start: 11 },
  { kind: 'score', name: () => tr('Score to par', 'Ergebnis zu Par'), number: () => tr('To par (−5, +2 …)', 'Zu Par (−5, +2 …)'), start: 0 },
  { kind: 'free', name: () => tr('Free bet', 'Freie Wette'), number: () => '', start: 0 },
];

/** The "Zocker-Pool" template (Sascha's list of 01.11.2026): five bets per player, the numbers per player. */
export const TEMPLATE: WagerKind[] = ['birdieRun', 'parRun', 'birdies', 'greens', 'score'];
