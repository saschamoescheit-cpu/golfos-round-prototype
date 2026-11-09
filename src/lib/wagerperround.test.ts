import { describe, expect, it } from 'vitest';
import { balances, cardsFor, judge, judgeDuelCards, mergeCards, progressOf, progressText, stateOf, tally, withDuels, type DuelCard, type PlayedRound, type Wager, type WagerPool } from './wagers';
import { emptyEntry } from './scoring';
import { setLang } from './i18n';

// Sascha 09.11.2026, USA: "every bet holds for each round on its own and is then closed – settled after every round
// played; only when made, he gets the money from everyone; missed, he pays nothing (only when made)" – and "5+5+10 is
// one against one, a bet of its own, also across flights; the scores from the own round".
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const round = (scores: (number | null)[], o: Partial<PlayedRound> = {}): PlayedRound => ({
  id: o.id ?? 'r',
  day: o.day ?? '2026-11-05',
  course: o.course ?? 'Bethpage',
  pars: PARS.slice(0, scores.length),
  entries: scores.map((s) => ({ ...emptyEntry(), strokes: s })),
  hcp: o.hcp ?? 10,
  counted: o.counted ?? true,
  ...(o.open ? { open: true } : {}),
  ...(o.received ? { received: o.received } : {}),
});
const par = (d = 0) => PARS.map((p) => p + d);
const birdies = (n: number) => par().map((p, i) => (i < n ? p - 1 : p));
const pool = (wagers: Wager[], progress: WagerPool['progress'] = {}, cards?: WagerPool['cards']): WagerPool => ({
  kind: 'wager-pool',
  id: 'p',
  name: 'USA',
  from: '2026-11-04',
  to: '2026-11-18',
  createdAt: '',
  players: [{ id: 'chris', name: 'Chris' }, { id: 'erik', name: 'Erik' }, { id: 'sascha', name: 'Sascha' }],
  wagers,
  progress,
  ...(cards ? { cards } : {}),
});
const bet = (patch: Partial<Wager>): Wager => ({ id: 'w', player: 'chris', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any', ...patch });

describe('each round on its own', () => {
  setLang('de');
  const w = bet({});
  const days = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'];
  // made on the 5th and the 8th, missed on the others
  const rounds = days.map((day, i) => round(i === 0 || i === 3 ? birdies(3) : par(), { day, id: day }));
  const p = judge(w, { from: '2026-11-04', to: '2026-11-18' }, rounds);

  it('"2 von 5": made in two rounds, five played', () => {
    expect(tally(w, p)).toEqual({ made: 2, missed: 3, played: 5 });
    expect(progressText(w, p)).toBe('in 2 von 5 Runden geschafft · Bestwert 3');
    expect(stateOf(w, pool([w], { w: p }), '2026-11-09')).toBe('done');
  });
  it('only when made: twice the stake from each – missed rounds cost nothing', () => {
    expect(balances(pool([w], { w: p }), '2026-11-09', true)).toEqual({ chris: 80, erik: -40, sascha: -40 });
  });
  it('both ways: made twice, missed three times – he pays once on balance to each', () => {
    const both = { ...w, payout: 'both' as const };
    expect(balances(pool([both], { w: p }), '2026-11-09', true)).toEqual({ chris: -40, erik: 20, sascha: 20 });
  });
  it('a round still played: made counts at once, not made is not missed yet', () => {
    const live = judge(w, { from: '2026-11-04', to: '2026-11-18' }, [round(par(), { open: true, day: '2026-11-09' })]);
    expect(tally(w, live)).toEqual({ made: 0, missed: 0, played: 0 });
    const made = judge(w, { from: '2026-11-04', to: '2026-11-18' }, [round(birdies(3), { open: true, day: '2026-11-09' })]);
    expect(tally(w, made)?.made).toBe(1);
  });
  it('"at most" bets need the round over – a few putts so far are no success', () => {
    const putts = bet({ kind: 'putts', target: 30 });
    const r = { ...round(par(), { open: true }), entries: PARS.map((p, i) => ({ ...emptyEntry(), strokes: i < 9 ? p : null, putts: i < 9 ? 2 : null })) };
    expect(tally(putts, judge(putts, { from: '2026-11-04', to: '2026-11-18' }, [r]))?.made ?? 0).toBe(0);
  });
  it('a total over N rounds and a count over the trip stay as they were', () => {
    expect(tally(bet({ kind: 'scoreSum', target: 30, rounds: 6 }), p)).toBeNull();
    expect(tally(bet({ kind: 'birdies', scope: 'trip', target: 10 }), p)).toBeNull();
  });
  it('signed rounds only, when the settlement asks for them', () => {
    const unsigned = judge(bet({ counted: true }), { from: '2026-11-04', to: '2026-11-18' }, [round(birdies(3), { counted: false })]);
    expect(balances(pool([bet({ counted: true })], { w: unsigned }), '2026-11-09')).toEqual({ chris: 0, erik: 0, sascha: 0 });
    expect(balances(pool([bet({ counted: true })], { w: unsigned }), '2026-11-09', true)).toEqual({ chris: 40, erik: -20, sascha: -20 });
  });
});

describe('5+5+10 one against one, from the cards (across flights)', () => {
  const duel: Wager = { id: 'd', player: 'chris', opponent: 'sascha', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day: '2026-11-10', parts: { front: 5, back: 5, total: 10 }, challenge: { state: 'accepted', at: '' } };
  const card = (strokes: (number | null)[], o: Partial<DuelCard> = {}): DuelCard => ({ day: '2026-11-10', course: 'Kissimmee Bay', strokes, received: strokes.map(() => 0), ...o });

  it('Chris better on the front and over 18, Sascha on the back: +5 −5 +10 = +10 for Chris', () => {
    const chris = par().map((p, i) => (i < 3 ? p - 1 : i === 12 ? p + 1 : p)); // −3 front, +1 back: 70
    const sascha = par().map((p, i) => (i === 10 ? p - 1 : p)); // even front, −1 back: 71
    const p = judgeDuelCards(duel, pool([duel], {}, { chris: [card(chris)], sascha: [card(sascha)] }));
    expect(p.duels).toEqual([{ day: '2026-11-10', course: 'Kissimmee Bay', front: 1, back: -1, total: 1 }]);
    expect(p.amount).toBe(10);
    expect(balances(withDuels(pool([duel], {}, { chris: [card(chris)], sascha: [card(sascha)] })), '2026-11-10', true)).toEqual({ chris: 10, erik: 0, sascha: -10 });
  });
  it('while playing: the front decided, the lead over the holes both played', () => {
    const chris = par().map((p, i) => (i < 12 ? (i === 0 ? p - 1 : p) : null));
    const sascha = par().map((p, i) => (i < 10 ? p : null));
    const p = judgeDuelCards(duel, pool([duel], {}, { chris: [card(chris)], sascha: [card(sascha)] }));
    expect(p.duels?.[0]).toMatchObject({ front: 1, back: null, total: null, thru: 10, lead: 1 });
    expect(p.amount).toBe(5);
  });
  it('net: the strokes received count', () => {
    const net = { ...duel, net: true };
    const recv = PARS.map((_, i) => (i < 9 ? 1 : 0)); // Sascha gets 9 strokes on the front
    const p = judgeDuelCards(net, pool([net], {}, { chris: [card(par())], sascha: [card(par(), { received: recv })] }));
    expect(p.duels?.[0]).toMatchObject({ front: -1, back: 0, total: -1 });
    expect(p.amount).toBe(-15);
  });
  it('not counted while it waits for the answer, nor declined', () => {
    for (const state of ['open', 'declined'] as const) {
      const w = { ...duel, challenge: { state, at: '' } };
      const pl = pool([w], {}, { chris: [card(par(-1))], sascha: [card(par())] });
      expect(progressOf(pl, w)).toBeUndefined();
      expect(balances(withDuels(pl), '2026-11-10', true)).toEqual({ chris: 0, erik: 0, sascha: 0 });
    }
  });
  it('only its day: another day of the trip does not count', () => {
    const p = judgeDuelCards(duel, pool([duel], {}, { chris: [card(par(-1), { day: '2026-11-11' })], sascha: [card(par(), { day: '2026-11-11' })] }));
    expect(p.duels).toEqual([]);
  });
});

describe('the cards of a phone', () => {
  it('rounds of 18 on the pool\'s days – the one with more holes when a round shows twice', () => {
    const a = round(par().map((p, i) => (i < 5 ? p : null)), { id: 'a', day: '2026-11-10' });
    const b = round(par().map((p, i) => (i < 9 ? p : null)), { id: 'b', day: '2026-11-10' });
    const nine = round(par().slice(0, 9), { id: 'n', day: '2026-11-10', course: 'Nine' });
    const before = round(par(), { id: 'x', day: '2026-11-01' });
    const cs = cardsFor([a, b, nine, before], { from: '2026-11-04', to: '2026-11-18' });
    expect(cs).toHaveLength(1);
    expect(cs[0].strokes.filter((s) => s != null)).toHaveLength(9);
  });
  it('the player\'s own card wins over the host\'s; the host fills only a round the player has none of', () => {
    const own = { day: '2026-11-10', course: 'K', strokes: [4], received: [0] };
    const hostOld = { day: '2026-11-09', course: 'C', strokes: [5], received: [0], by: 'host' as const };
    // the host's phone: its card of the 10th is not taken – the player has his own; the 9th renewed
    expect(mergeCards([own, hostOld], [{ ...own, strokes: [3] }, { ...hostOld, strokes: [6] }], true)).toEqual([{ ...hostOld, strokes: [6] }, own]);
    // the player's phone: his cards anew, the host's of another round kept
    expect(mergeCards([own, hostOld], [{ ...own, strokes: [5] }])).toEqual([hostOld, { ...own, strokes: [5] }]);
  });
});

describe('a bet with no round yet', () => {
  it('reported without rounds: none played – "nothing yet", the same as with no report at all', () => {
    const w = bet({});
    expect(tally(w, { best: null, done: false, rounds: 0, at: '' })).toEqual({ made: 0, missed: 0, played: 0 });
    // a report from an older app with a round in it: the trip as one, as before
    expect(tally(w, { best: 2, done: false, rounds: 1, at: '' })).toBeNull();
  });
});
