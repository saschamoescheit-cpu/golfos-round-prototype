import { describe, expect, it } from 'vitest';
import { afterPayments, LIBRARY, balances, ledger, poolCounted, withCounted, needsDetails, poolNeedsDetails, provisional, isPool, earlierGroups, fromEarlier, fromLibrary, judge, markedEntry, progressText, stateOf, wagerLabel, wagerRules, type PlayedRound, type Wager, type WagerPool } from './wagers';
import type { HoleEntry } from '../types';
import { emptyEntry } from './scoring';
import { setLang } from './i18n';

// Sascha's "Zocker-Pool" (01.11.2026): Chris 3 birdies in a row, 12 pars in a row, 5 birdies on 18, 16 greens, −5 …
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const round = (scores: (number | null)[], o: Partial<PlayedRound> & { putts?: number[] } = {}): PlayedRound => ({
  id: o.id ?? 'r',
  day: o.day ?? '2026-11-05',
  course: o.course ?? 'Bethpage',
  pars: PARS.slice(0, scores.length),
  entries: scores.map((s, i) => ({ ...emptyEntry(), strokes: s, putts: o.putts?.[i] ?? null })),
  hcp: o.hcp ?? 10,
  counted: o.counted ?? true,
});
const par = (d = 0) => PARS.map((p) => p + d);
const pool: Pick<WagerPool, 'from' | 'to'> = { from: '2026-11-04', to: '2026-11-10' };
const bet = (patch: Partial<Wager>): Wager => ({ id: 'w', player: 'chris', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', ...patch });

// Sascha 01.11.2026: a bet "with marker" counts the marker's figures, as in a tournament
describe('a bet with marker counts the marker\'s figures', () => {
  it('the marker\'s putts decide the greens; a difference is shown; without marker the player\'s own count', () => {
    const own = round(par(), { putts: PARS.map(() => 2) }); // par everywhere, 2 putts: 18 greens by his own count
    const marker = own.entries.map((e, i) => ({ s: e!.strokes, d: { pu: i < 3 ? 1 : 2 } })); // the marker: 1 putt on 1–3 – green missed, chipped close
    const r: PlayedRound = { ...own, marked: own.entries.map((e, i) => markedEntry(e, marker[i])), differ: [0, 1, 2] };
    const counted = judge(bet({ kind: 'greens', target: 16, counted: true }), pool, [r]);
    expect(counted.best).toBe(15);
    expect(counted.done).toBe(false);
    expect(counted.differ).toBe(3);
    expect(progressText(bet({ kind: 'greens', target: 16, counted: true }), counted)).toContain('the marker counted 3 holes differently');
    const free = judge(bet({ kind: 'greens', target: 16 }), pool, [r]);
    expect(free.best).toBe(18);
    expect(free.differ).toBeUndefined();
  });
  it('a hole the marker did not enter stays the player\'s own; only the score from an older app keeps his details', () => {
    const e = { ...emptyEntry(), strokes: 4, putts: 2, fairway: 'hit' as const };
    expect(markedEntry(e, null)).toBe(e);
    expect(markedEntry(e, { s: 5 })).toMatchObject({ strokes: 5, putts: 2, fairway: 'hit' });
    expect(markedEntry(e, { s: 4, d: { pu: 1, fw: 'left' } })).toMatchObject({ strokes: 4, putts: 1, fairway: 'left', sandShots: 0, penalties: 0 });
  });
});

describe('the bets judged from the rounds', () => {
  it('birdies in a row: the longest run; an eagle counts unless "exactly birdie"', () => {
    const s = par();
    s[3] = 4; // birdie
    s[4] = 2; // eagle
    s[5] = 3; // birdie
    expect(judge(bet({}), pool, [round(s)]).best).toBe(3);
    expect(judge(bet({}), pool, [round(s)]).done).toBe(true);
    expect(judge(bet({ orBetter: false }), pool, [round(s)]).best).toBe(1);
  });
  it('pars in a row: par or better by default, exactly par breaks on a birdie; across rounds when chosen', () => {
    const a = par();
    a[10] = 3; // a birdie on 11
    expect(judge(bet({ kind: 'parRun', target: 12 }), pool, [round(a)]).best).toBe(18);
    expect(judge(bet({ kind: 'parRun', target: 12, orBetter: false }), pool, [round(a)]).best).toBe(10);
    const end = par();
    end[9] = 7; // first round: holes 11–18 in a row (8)
    const start = par();
    start[5] = 7; // second round: holes 1–5 (5), then 7–18 (12)
    const rs = [round(end, { id: 'a', day: '2026-11-05' }), round(start, { id: 'b', day: '2026-11-06' })];
    expect(judge(bet({ kind: 'parRun', target: 12 }), pool, rs).best).toBe(12);
    expect(judge(bet({ kind: 'parRun', target: 13, acrossRounds: true }), pool, rs).best).toBe(13); // 8 + 5
  });
  it('birdies and greens in a round; greens from the putts', () => {
    const s = par();
    [0, 4, 9].forEach((i) => (s[i] -= 1));
    expect(judge(bet({ kind: 'birdies', target: 3 }), pool, [round(s)]).done).toBe(true);
    const putts = PARS.map((_, i) => (i < 11 ? 2 : 1)); // par with 2 putts: green hit; with 1 putt: green missed, chipped close
    expect(judge(bet({ kind: 'greens', target: 11 }), pool, [round(par(), { putts })]).best).toBe(11);
    expect(judge(bet({ kind: 'greens', target: 11 }), pool, [round(par())]).best).toBe(0); // no putts: unknown
  });
  it('the score to par: only complete rounds, gross or net, per nine when chosen', () => {
    const s = par();
    s[0] = 6; // +2
    expect(judge(bet({ kind: 'score', target: 2 }), pool, [round(s)]).done).toBe(true);
    expect(judge(bet({ kind: 'score', target: 1 }), pool, [round(s)]).done).toBe(false);
    expect(judge(bet({ kind: 'score', target: -5, net: true }), pool, [round(s, { hcp: 8 })]).best).toBe(-6);
    expect(judge(bet({ kind: 'score', target: 0 }), pool, [round(s.slice(0, 9))]).best).toBeNull(); // 9 holes: no 18-hole score
    expect(judge(bet({ kind: 'score', target: 0, holes: 9 }), pool, [round(s)]).best).toBe(0); // the back nine at par
    const open: (number | null)[] = par();
    open[17] = null;
    expect(judge(bet({ kind: 'score', target: 5 }), pool, [round(open)]).best).toBeNull();
  });
  it('the period, one day only, and counted rounds (marker, card signed) – the rest shown as pending', () => {
    const s = par();
    [0, 1, 2].forEach((i) => (s[i] -= 1));
    expect(judge(bet({}), pool, [round(s, { day: '2026-11-03' })]).best).toBeNull(); // before the pool
    expect(judge(bet({ attempts: 'day', day: '2026-11-07' }), pool, [round(s, { day: '2026-11-06' })]).best).toBeNull();
    const p = judge(bet({ counted: true }), pool, [round(s, { counted: false })]);
    expect(p.done).toBe(false);
    expect(p.best).toBeNull();
    expect(p.pending).toBe(3);
    expect(judge(bet({ counted: true }), pool, [round(s)]).done).toBe(true);
  });
  it("words: the bet as on Sascha's list", () => {
    expect(wagerLabel(bet({}))).toMatch(/3 (birdies in a row|Birdies in Folge)/);
    expect(wagerLabel(bet({ kind: 'score', target: -5 }))).toMatch(/−5/);
  });
});

// the library (Sascha 01.11.2026: "extend it with further sensible bets")
describe('the further bets of the library', () => {
  const e = (strokes: number | null, o: Partial<HoleEntry> = {}): HoleEntry => ({ ...emptyEntry(), strokes, putts: 2, ...o });
  const played = (entries: HoleEntry[], o: Partial<PlayedRound> = {}): PlayedRound => ({ id: o.id ?? 'r', day: o.day ?? '2026-11-05', course: 'Bethpage', pars: PARS.slice(0, entries.length), entries, hcp: 10, counted: true, ...o });
  const base = () => PARS.map((p) => e(p));
  it('counts in a round: pars, fairways, one-putts, up & downs, eagles, a hole-in-one', () => {
    const h = base();
    h[0] = e(3, { fairway: 'hit', putts: 1 }); // birdie on a par 4: a par or better too
    h[1] = e(4, { fairway: 'hit', upAndDown: true, putts: 1 });
    h[2] = e(1, { putts: 0 }); // a hole-in-one on the par 3
    h[3] = e(3, { fairway: 'left', putts: 1 }); // an eagle on the par 5
    h[4] = e(6); // a double bogey
    const r = [played(h)];
    expect(judge(bet({ kind: 'pars', target: 17 }), pool, r).best).toBe(17);
    expect(judge(bet({ kind: 'pars', target: 17, orBetter: false }), pool, r).best).toBe(14);
    expect(judge(bet({ kind: 'fairways', target: 2 }), pool, r).best).toBe(2);
    expect(judge(bet({ kind: 'oneputts', target: 3 }), pool, r).best).toBe(3);
    expect(judge(bet({ kind: 'updowns', target: 1 }), pool, r).done).toBe(true);
    expect(judge(bet({ kind: 'eagles', target: 2 }), pool, r).best).toBe(2); // the ace on a par 3 is an eagle as well
    expect(judge(bet({ kind: 'holeInOne', target: 1, scope: 'trip' }), pool, r).done).toBe(true);
  });
  it('at most in a complete round: putts, three-putts, double bogeys, penalty strokes', () => {
    const h = base(); // 36 putts
    h[5] = e(5, { putts: 3, penalties: 1 });
    h[6] = e(6, { putts: 3 }); // double bogey on the par 3, a three-putt
    const r = [played(h)];
    expect(judge(bet({ kind: 'putts', target: 36 }), pool, r).best).toBe(38);
    expect(judge(bet({ kind: 'putts', target: 38 }), pool, r).done).toBe(true);
    expect(judge(bet({ kind: 'threeputts', target: 0 }), pool, r).best).toBe(2);
    expect(judge(bet({ kind: 'doubles', target: 1 }), pool, r).done).toBe(true);
    expect(judge(bet({ kind: 'penalties', target: 0 }), pool, r).done).toBe(false);
    const unknown = base();
    unknown[9] = e(4, { putts: null });
    expect(judge(bet({ kind: 'putts', target: 40 }), pool, [played(unknown)]).best).toBeNull(); // a putt missing: no total
    expect(judge(bet({ kind: 'putts', target: 18, holes: 9 }), pool, [played(unknown)]).best).toBe(18); // the front nine is complete
  });
  it('Stableford points with the strokes he receives; counts added up over the trip', () => {
    const r = played(base(), { received: PARS.map((_, i) => (i < 10 ? 1 : 0)) }); // par everywhere: 2 points, +1 on 10 holes
    expect(judge(bet({ kind: 'stableford', target: 46 }), pool, [r]).best).toBe(46);
    const b1 = base();
    b1[0] = e(3);
    const b2 = base();
    b2[0] = e(3);
    b2[1] = e(3);
    const trip = [played(b1, { id: 'a' }), played(b2, { id: 'b', day: '2026-11-06' })];
    expect(judge(bet({ kind: 'birdies', target: 3, scope: 'trip' }), pool, trip).done).toBe(true);
    expect(judge(bet({ kind: 'birdies', target: 3 }), pool, trip).best).toBe(2); // in one round only 2
    expect(progressText(bet({ kind: 'birdies', target: 10, scope: 'trip' }), judge(bet({ kind: 'birdies', target: 10, scope: 'trip' }), pool, trip))).toMatch(/3 \((target|Ziel) 10\)/);
  });
  it('every entry of the library makes a bet with its own name', () => {
    const names = LIBRARY.map((b) => wagerLabel(fromLibrary(b, { player: 'chris', stake: 20, payout: 'success', attempts: 'any' }, b.start, b.id, 'Nearest the pin')));
    expect(new Set(names).size).toBe(LIBRARY.length);
  });
});

// "once I have set up bets, I want to pick from those as templates" (Sascha 01.11.2026)
describe('bets set up before as templates', () => {
  const p = { players: [{ id: 'erik', name: 'Erik' }, { id: 'sascha', name: 'Sascha' }], from: '2026-11-04', to: '2026-11-10' };
  it('grouped by where they were, each bet once per group', () => {
    const g = earlierGroups([
      { from: 'USA 2026 · Chris', wager: bet({ id: 'a' }) },
      { from: 'USA 2026 · Chris', wager: bet({ id: 'b' }) }, // the same bet again
      { from: 'USA 2026 · Chris', wager: bet({ id: 'c', kind: 'greens', target: 16 }) },
      { from: 'Hetzenhof · Erik', wager: bet({ id: 'd', player: 'erik' }) },
    ]);
    expect(g.map((x) => [x.from, x.wagers.length])).toEqual([['USA 2026 · Chris', 2], ['Hetzenhof · Erik', 1]]);
  });
  it('a template for another player: a new bet with the same rules; what does not fit this pool made plain', () => {
    const t = fromEarlier(bet({ id: 'a', payout: 'opponent', opponent: 'cedric', attempts: 'day', day: '2026-10-01', stake: 50 }), 'erik', p, 'n1');
    expect(t).toMatchObject({ id: 'n1', player: 'erik', kind: 'birdieRun', target: 3, stake: 50, payout: 'success', attempts: 'any' });
    expect(fromEarlier(bet({ payout: 'opponent', opponent: 'sascha' }), 'erik', p, 'n2')).toMatchObject({ payout: 'opponent', opponent: 'sascha' });
  });
});

// Sascha 01.11.2026: "I have set up the bets now – they must never vanish with updates, changes and so on". A pool as
// the live app wrote it on 01.11.2026 (the "Zocker-Pool" template, the library, a free bet, before "deletedAt" and the
// account in "joined") – every later version must still read and judge it. Do not change this pool; add new ones.
describe('a pool written on 01.11.2026 stays readable', () => {
  const OLD = {
    kind: 'wager-pool',
    id: 'p1',
    name: 'USA 2026',
    from: '2026-11-04',
    to: '2026-11-12',
    createdAt: '2026-11-01T09:00:00.000Z',
    players: [
      { id: 's', name: 'Sascha', joined: { name: 'Sascha', at: '2026-11-01T09:00:00.000Z' } },
      { id: 'c', name: 'Chris' },
      { id: 'e', name: 'Erik', joined: { name: 'Erik', at: '2026-11-01T10:00:00.000Z' } },
      { id: 'd', name: 'Cedric' },
    ],
    wagers: [
      { id: 'w1', player: 'c', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', counted: true },
      { id: 'w2', player: 'c', kind: 'parRun', target: 12, stake: 20, payout: 'success', attempts: 'any', counted: true },
      { id: 'w3', player: 'c', kind: 'birdies', target: 5, stake: 20, payout: 'success', attempts: 'any', counted: true },
      { id: 'w4', player: 'c', kind: 'greens', target: 16, stake: 20, payout: 'success', attempts: 'any', counted: true },
      { id: 'w5', player: 'c', kind: 'score', target: -5, stake: 20, payout: 'success', attempts: 'any', counted: true },
      { id: 'w6', player: 'e', kind: 'free', target: 0, stake: 20, payout: 'both', attempts: 'any', text: 'Längster Drive' },
      { id: 'w7', player: 's', kind: 'putts', target: 32, stake: 10, payout: 'opponent', opponent: 'e', attempts: 'day', day: '2026-11-06', counted: false },
    ],
    progress: { w1: { best: 3, done: true, where: 'Bethpage Black · 05.11.', rounds: 1, at: '2026-11-05T20:00:00.000Z' }, w6: { best: null, done: false, rounds: 0, at: '', manual: { done: true, by: 'Sascha' } } },
  };
  it('read, worded, judged and settled as on that day', () => {
    setLang('de');
    expect(isPool(OLD)).toBe(true);
    const pool = OLD as unknown as WagerPool;
    expect(pool.wagers.map(wagerLabel)).toEqual(['3 Birdies in Folge', '12 Pars in Folge', '5 Birdies auf 18', '16 Grüns auf 18', '−5 brutto', 'Längster Drive', 'Höchstens 32 Putts auf 18']);
    expect(pool.wagers.map((w) => stateOf(w, pool, '2026-11-08'))).toEqual(['done', 'open', 'open', 'open', 'open', 'done', 'missed']);
    expect(balances(pool, '2026-11-08')).toEqual({ s: -20 - 20 - 10, c: 60 - 20, e: -20 + 60 + 10, d: -20 - 20 });
    expect(judge(pool.wagers[2], pool, [round(par(-1).map((s, i) => (i < 5 ? s : PARS[i])))]).done).toBe(true);
  });
});

// "5+5+10" (Sascha 01.11.2026: "stroke play over 18 – the better score on the first nine wins the 5 dollars, the same on
// the second nine, and then who wins over 18; a tie wins nothing"; gross or net, every round or one; in dollars)
describe('5+5+10 – front, back, 18', () => {
  const players = [
    { id: 's', name: 'Sascha' },
    { id: 'c', name: 'Chris' },
    { id: 'e', name: 'Erik' },
  ];
  const duelPool = { from: '2026-11-04', to: '2026-11-12', players };
  const duel = (patch: Partial<Wager> = {}): Wager => ({ id: 'd1', player: 's', opponent: 'c', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'any', parts: { front: 5, back: 5, total: 10 }, ...patch });
  const entries = (scores: number[]) => scores.map((s) => ({ ...emptyEntry(), strokes: s }));
  // Sascha's round with Chris in his flight
  const together = (mine: number[], his: number[], o: { day?: string; hcp?: number[]; counted?: [boolean, boolean]; name?: string } = {}): PlayedRound => ({
    ...round(mine, { day: o.day, counted: o.counted?.[0] ?? true }),
    received: o.hcp ? o.hcp.slice() : PARS.map(() => 0),
    others: [{ name: o.name ?? 'Chris', entries: entries(his), hcp: null, received: PARS.map(() => 0), counted: o.counted?.[1] ?? true }],
  });
  it('front won, back lost, 18 tied: +5 −5 ±0', () => {
    const me = par();
    const him = par();
    me[0] -= 1; // Sascha one better on the front
    him[10] -= 1; // Chris one better on the back
    const p = judge(duel(), duelPool, [together(me, him)]);
    expect(p.duels).toEqual([{ day: '2026-11-05', course: 'Bethpage', front: 1, back: -1, total: 0 }]);
    expect(p.amount).toBe(0);
    him[11] -= 1; // Chris two better on the back: he wins the back and the 18
    expect(judge(duel(), duelPool, [together(me, him)]).amount).toBe(5 - 5 - 10);
  });
  it('every round together adds up; only the round of one day; a round without him does not count', () => {
    const me = par(-1); // Sascha better everywhere: +20 per round
    const r1 = together(me, par(), { day: '2026-11-05' });
    const r2 = together(me, par(), { day: '2026-11-06' });
    const alone = { ...round(me, { day: '2026-11-07' }), others: [] };
    expect(judge(duel(), duelPool, [r1, r2, alone]).amount).toBe(40);
    expect(judge(duel({ attempts: 'day', day: '2026-11-06' }), duelPool, [r1, r2]).amount).toBe(20);
    expect(judge(duel(), duelPool, [together(me, par(), { name: 'chris m.' })]).amount).toBe(20); // first name found
  });
  it('net: the strokes received on the holes; with marker only cards signed by both; a nine not complete is no result', () => {
    const me = par(1); // Sascha bogey everywhere, gets a stroke on every hole: net par
    const him = par(); // Chris par everywhere, no strokes
    expect(judge(duel(), duelPool, [together(me, him)]).amount).toBe(-20);
    expect(judge(duel({ net: true }), duelPool, [together(me, him, { hcp: PARS.map(() => 1) })]).amount).toBe(0);
    expect(judge(duel({ counted: true }), duelPool, [together(par(-1), him, { counted: [true, false] })]).duels).toEqual([]);
    const open = par(-1) as (number | null)[];
    open[12] = null;
    const p = judge(duel(), duelPool, [together(open as number[], him)]);
    expect([p.duels![0].front, p.duels![0].back, p.duels![0].total, p.amount]).toEqual([1, null, null, 5]);
  });
  it('settled between the two – in dollars; open until its day or the trip is over', () => {
    const pool: WagerPool = { kind: 'wager-pool', id: 'p', name: 'USA', ...duelPool, createdAt: '', currency: 'USD', wagers: [duel()], progress: { d1: { best: null, done: false, rounds: 1, amount: -10, duels: [], at: '' } } };
    expect(balances(pool, '2026-11-08')).toEqual({ s: -10, c: 10, e: 0 });
    expect(stateOf(pool.wagers[0], pool, '2026-11-08')).toBe('open');
    expect(stateOf(pool.wagers[0], pool, '2026-11-13')).toBe('done');
    setLang('de');
    expect(wagerLabel(duel())).toBe('5+5+10 brutto');
    expect(wagerRules(duel(), pool)).toBe('gegen Chris · vorne 5 $ · hinten 5 $ · gesamt 10 $ · jede gemeinsame Runde');
    expect(wagerRules(w({}) as Wager, pool)).toMatch(/^20 \$ · nur bei Erfolg/);
  });
});
const w = (patch: Partial<Wager>): Wager => ({ id: 'w', player: 's', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', ...patch });

describe('who pays whom', () => {
  const full = (wagers: Wager[], progress: WagerPool['progress'], o: Partial<WagerPool> = {}): WagerPool => ({
    kind: 'wager-pool',
    id: 'p',
    name: 'USA',
    from: '2026-11-04',
    to: '2026-11-10',
    createdAt: '',
    players: ['chris', 'erik', 'sascha', 'cedric'].map((id) => ({ id, name: id })),
    wagers,
    progress,
    ...o,
  });
  const made = { best: 3, done: true, rounds: 1, at: '' };
  it('made, paid when made: every other player pays him the stake; missed costs nothing', () => {
    const p = full([bet({ id: 'a' }), bet({ id: 'b', player: 'erik' })], { a: made }, { finishedAt: '2026-11-10' });
    expect(balances(p)).toEqual({ chris: 60, erik: -20, sascha: -20, cedric: -20 });
  });
  it('both ways: missed, he pays every other player; against one player only him', () => {
    const p = full([bet({ id: 'a', payout: 'both' }), bet({ id: 'b', player: 'erik', payout: 'opponent', opponent: 'sascha' })], { b: made }, { finishedAt: 'x' });
    expect(balances(p)).toEqual({ chris: -60, erik: 40, sascha: 0, cedric: 20 });
  });
  it('open until the period is over; by hand wins over the app', () => {
    const p = full([bet({ id: 'a' })], {});
    expect(stateOf(p.wagers[0], p, '2026-11-08')).toBe('open');
    expect(stateOf(p.wagers[0], p, '2026-11-11')).toBe('missed');
    const q = full([bet({ id: 'a', kind: 'free', text: 'Longest drive' })], { a: { best: null, done: false, rounds: 0, at: '', manual: { done: true, by: 'erik' } } });
    expect(stateOf(q.wagers[0], q, '2026-11-08')).toBe('done');
  });
});

// Sascha 02.11.2026: "even with marker a result must come out at the end, also when the marker has not signed"
describe('a result before the card is signed', () => {
  it('made in a round not signed yet: provisional – shown, and counted in the settlement only when asked', () => {
    const s = par();
    s[3] = 4;
    s[4] = 3;
    s[5] = 3; // three birdies in a row
    const w = bet({ kind: 'birdieRun', target: 3, counted: true });
    const p = judge(w, pool, [round(s, { counted: false })]);
    expect(p.done).toBe(false);
    expect(p.pending).toBe(3);
    expect(provisional(w, p)).toBe(true);
    const pl: WagerPool = { kind: 'wager-pool', id: 'p', name: 'P', from: pool.from, to: pool.to, createdAt: '', players: [{ id: 'chris', name: 'Chris' }, { id: 'erik', name: 'Erik' }], wagers: [w], progress: { [w.id]: p } };
    expect(balances(pl, '2026-11-05')).toEqual({ chris: 0, erik: 0 });
    expect(balances(pl, '2026-11-05', true)).toEqual({ chris: 20, erik: -20 });
  });
  it('not made, or signed: nothing provisional', () => {
    const w = bet({ kind: 'birdieRun', target: 3, counted: true });
    expect(provisional(w, judge(w, pool, [round(par(), { counted: false })]))).toBe(false);
    const s = par();
    s[3] = 4;
    s[4] = 3;
    s[5] = 3;
    expect(provisional(w, judge(w, pool, [round(s)]))).toBe(false);
  });
});

// Sascha 02.11.2026: "for bets only on the score the strokes incl. penalty strokes; GIR, 3-putts, up and down the details"
describe('which bets need the details of a hole', () => {
  it('greens, fairways, putts, one-putts, three-putts, up & downs – not birdies, pars, runs, the score, penalty strokes', () => {
    expect(['greens', 'fairways', 'putts', 'oneputts', 'threeputts', 'updowns'].every((k) => needsDetails({ kind: k as Wager['kind'] }))).toBe(true);
    expect(['birdies', 'pars', 'birdieRun', 'parRun', 'score', 'scoreSum', 'stableford', 'penalties', 'doubles', 'free'].some((k) => needsDetails({ kind: k as Wager['kind'] }))).toBe(false);
  });
  it('a pool needs them for a round when such a bet counts that round', () => {
    const p = { from: '2026-11-05', to: '2026-11-06', wagers: [bet({ kind: 'birdies' }), bet({ id: 'g', kind: 'greens', attempts: 'day', day: '2026-11-06' })] };
    expect(poolNeedsDetails(p, { day: '2026-11-05', course: 'Bethpage' })).toBe(false);
    expect(poolNeedsDetails(p, { day: '2026-11-06', course: 'Bethpage' })).toBe(true);
  });
});

// Sascha 02.11.2026: "own bets configured so that they are judged from the score entry – and in the library again"
describe('an own bet, built', () => {
  const own = (patch: Partial<Wager>): Wager => bet({ kind: 'custom', metric: 'birdie', compare: 'min', where: 'all', target: 2, ...patch });
  it('at least 2 birdies on the par 3s – in words and judged', () => {
    setLang('de');
    const s = par();
    s[2] = 2; // birdie on the par 3 hole 3
    s[6] = 2; // and on hole 7
    s[0] = 3; // a birdie on a par 4: not on a par 3
    const w = own({ where: 'par3' });
    expect(wagerLabel(w)).toBe('Mindestens 2 Birdies auf den Par 3s');
    expect(judge(w, pool, [round(s)])).toMatchObject({ best: 2, done: true });
    expect(judge(own({ where: 'par3', target: 3 }), pool, [round(s)]).done).toBe(false);
  });
  it('no three-putt on hole 7: needs the details, judged from the putts', () => {
    setLang('de');
    const w = own({ metric: 'threePutt', compare: 'max', where: 'holes', holesOf: [7], target: 0 });
    expect(wagerLabel(w)).toBe('Kein Drei-Putt auf Loch 7');
    expect(needsDetails(w)).toBe(true);
    expect(judge(w, pool, [round(par(), { putts: PARS.map((_, i) => (i === 6 ? 3 : 2)) })]).done).toBe(false);
    expect(judge(w, pool, [round(par(), { putts: PARS.map(() => 2) })]).done).toBe(true);
    expect(judge(w, pool, [round(par())]).best).toBeNull(); // no putts entered: cannot be told
  });
  it('pars in a row on the back nine; at most +2 to par on the front nine', () => {
    setLang('de');
    const s = par();
    s[9] = 5; // bogey on 10 – then 8 pars
    expect(judge(own({ metric: 'par', run: true, where: 'back', target: 8 }), pool, [round(s)])).toMatchObject({ best: 8, done: true });
    const f = par();
    f[0] = 5;
    f[1] = 5;
    f[2] = 4; // +3 on the front
    const w = own({ metric: 'strokes', compare: 'max', where: 'front', target: 2 });
    expect(wagerLabel(w)).toBe('Höchstens +2 zu Par auf der vorderen 9');
    expect(judge(w, pool, [round(f)])).toMatchObject({ best: 3, done: false });
    expect(needsDetails(w)).toBe(false);
  });
});

// "with marker" for the whole pool (Sascha 02.11.2026: "one bet with, another without a marker makes no sense")
describe('with marker for the whole pool', () => {
  const base = { stake: 10, payout: 'success', attempts: 'any', player: 'p1' } as const;
  const pool = (counted?: boolean, flags: (boolean | undefined)[] = [true, false]): WagerPool => ({
    kind: 'wager-pool', id: 'x', name: 'X', from: '2026-11-02', to: '2026-11-02', createdAt: '', players: [{ id: 'p1', name: 'A' }], progress: {},
    wagers: flags.map((c, k) => ({ ...base, id: `w${k}`, kind: 'birdies', target: 2, ...(c == null ? {} : { counted: c }) })),
    ...(counted == null ? {} : { counted }),
  });
  it('carries the pool’s setting to every bet', () => {
    expect(withCounted(pool(true)).wagers.map((w) => w.counted)).toEqual([true, true]);
    expect(withCounted(pool(false)).wagers.map((w) => w.counted)).toEqual([false, false]);
  });
  it('leaves a pool from before (no setting) as it was', () => {
    const p = pool();
    expect(withCounted(p)).toBe(p);
    expect(poolCounted(p)).toBe(false);
    expect(poolCounted(pool(undefined, [true, true]))).toBe(true);
    expect(poolCounted(pool(undefined, []))).toBe(true);
  });
});

// each bet on its own (Sascha 02.11.2026: "two single bets – 20 € from Chris for the one I made")
describe('the settlement bet by bet', () => {
  it('nets a bet made by each to 0 – and says so line by line', () => {
    const base = { stake: 20, payout: 'success', attempts: 'any' } as const;
    const pool: WagerPool = {
      kind: 'wager-pool', id: 'x', name: 'Test', from: '2026-11-02', to: '2026-11-02', createdAt: '', players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }],
      wagers: [
        { ...base, id: 'a', player: 's', kind: 'birdieRun', target: 2 },
        { ...base, id: 'b', player: 's', kind: 'parRun', target: 9 },
        { ...base, id: 'g', player: 'c', kind: 'greens', target: 13 },
      ],
      progress: { a: { best: 2, done: true, rounds: 1, at: '' }, b: { best: 4, done: false, rounds: 1, at: '' }, g: { best: 13, done: true, rounds: 1, at: '' } },
    };
    const l = ledger(pool, '2026-11-02');
    expect(l.s.map((x) => [x.w.id, x.amount])).toEqual([['a', 20], ['g', -20]]);
    expect(l.c.map((x) => [x.w.id, x.amount])).toEqual([['a', -20], ['g', 20]]);
    expect(balances(pool, '2026-11-02')).toEqual({ s: 0, c: 0 });
  });
});

describe('payments (03.11.2026)', () => {
  it('a payment is off the debts – what is open follows', () => {
    const bal = { a: -40, b: 30, c: 10 };
    expect(afterPayments(bal, [{ id: 'p', from: 'a', to: 'b', amount: 30, paidAt: 'x' }])).toEqual({ a: -10, b: 0, c: 10 });
    expect(afterPayments(bal, undefined)).toEqual(bal);
  });
});
