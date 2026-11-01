import { describe, expect, it } from 'vitest';
import { balances, judge, stateOf, wagerLabel, type PlayedRound, type Wager, type WagerPool } from './wagers';
import { emptyEntry } from './scoring';

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
