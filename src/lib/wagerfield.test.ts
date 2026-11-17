import { describe, expect, it } from 'vitest';
import { balances, betOthers, dayPlayers, isGuest, owings, roundLedger, roundPayers, type Wager, type WagerPool } from './wagers';

// Sascha 14.11.2026: "Bei den Wetten ist es so, dass es sich immer nur auf die Spieler der Runde erstreckt. Wenn also
// Cedric, Sascha und Erik nur spielen, dann müssen Moritz und Chris auch nichts zahlen, sollte jemand Wetten auf dieser
// Runde erfüllen."
const players = ['sascha', 'cedric', 'erik', 'moritz', 'chris'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
const bet = (id: string, player: string, patch: Partial<Wager> = {}): Wager => ({ id, player, kind: 'pars', target: 10, stake: 20, payout: 'success', attempts: 'any', ...patch });
const rr = (day: string, value: number) => ({ day, course: 'Hawks Landing', value, counted: true });
// everyone plays on the 14th; on the 15th only Cedric, Sascha and Erik – Sascha makes his bet that day
const pool: WagerPool = {
  kind: 'wager-pool',
  id: 'p',
  name: 'USA',
  from: '2026-11-05',
  to: '2026-11-18',
  createdAt: '',
  players,
  wagers: [bet('ws', 'sascha'), bet('wc', 'cedric'), bet('we', 'erik'), bet('wm', 'moritz'), bet('wx', 'chris')],
  progress: {
    ws: { perRound: [rr('2026-11-14', 6), rr('2026-11-15', 11)], at: '', best: null, done: false, rounds: 0 },
    wc: { perRound: [rr('2026-11-14', 5), rr('2026-11-15', 4)], at: '', best: null, done: false, rounds: 0 },
    we: { perRound: [rr('2026-11-14', 7), rr('2026-11-15', 8)], at: '', best: null, done: false, rounds: 0 },
    wm: { perRound: [rr('2026-11-14', 3)], at: '', best: null, done: false, rounds: 0 },
    wx: { perRound: [rr('2026-11-14', 9)], at: '', best: null, done: false, rounds: 0 },
  },
};

describe('a bet made in a round: only the players of that round pay', () => {
  it('who played which day', () => {
    const f = dayPlayers(pool);
    expect([...(f.get('2026-11-15') ?? [])].sort()).toEqual(['cedric', 'erik', 'sascha']);
    expect(f.get('2026-11-14')?.size).toBe(5);
  });
  it('Sascha made it on the 15th: Cedric and Erik pay – Moritz and Chris (not playing) nothing', () => {
    expect(roundPayers(pool, pool.wagers[0], '2026-11-15').sort()).toEqual(['cedric', 'erik']);
    const b = balances(pool);
    expect(b).toEqual({ sascha: 40, cedric: -20, erik: -20, moritz: 0, chris: 0 });
  });
  it("the round's own settlement too", () => {
    expect(roundLedger(pool, '2026-11-15')).toEqual({ sascha: 40, cedric: -20, erik: -20, moritz: 0, chris: 0 });
  });
  it('a player of the pool without any round in it is not known to have stayed away – he pays as before', () => {
    const p2: WagerPool = { ...pool, players: [...players, { id: 'gast', name: 'Gast' }] };
    expect(roundPayers(p2, p2.wagers[0], '2026-11-15').sort()).toEqual(['cedric', 'erik', 'gast']);
  });
  it('against one opponent who did not play that day: nothing', () => {
    const w = bet('wo', 'sascha', { payout: 'opponent', opponent: 'chris' });
    expect(roundPayers({ ...pool, wagers: [...pool.wagers, w] }, w, '2026-11-15')).toEqual([]);
  });
});

// Sascha 17.11.2026: "Daniel nimmt aber ja gar nicht am Wettpool teil. Die USA Wetten laufen nur zwischen Chris, Erik,
// Moritz, Cedric und Sascha. Daniel und Thomas haben nur die letzten beiden Tage als Gast mitgespielt – müssen bei
// erfüllten Wetten nicht bezahlen." Daniel came into the pool by a 5+5+10 against Erik (16.11., Legends) – the Bilanz
// asked 20 $ of him for Sascha's "Grüns 11".
describe("a guest of the pool – in it only for a 5+5+10 – never pays the pool's bets", () => {
  const duel: Wager = { id: 'd', player: 'daniel', opponent: 'erik', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day: '2026-11-15', parts: { front: 5, back: 5, total: 10 }, challenge: { state: 'accepted', at: '' } };
  const withDaniel: WagerPool = {
    ...pool,
    players: [...players, { id: 'daniel', name: 'Daniel', hcp: '10,7' }],
    wagers: [...pool.wagers, duel],
    progress: { ...pool.progress, d: { at: '', best: null, done: false, rounds: 1, amount: 20, duels: [{ day: '2026-11-15', course: 'Hawks Landing', front: 1, back: 1, total: 1 }] } },
  };
  it('Daniel is a guest, the five are not', () => {
    expect(isGuest(withDaniel, 'daniel')).toBe(true);
    for (const p of players) expect(isGuest(withDaniel, p.id)).toBe(false);
  });
  it('Sascha made his bet the day Daniel played too: Cedric and Erik pay, Daniel nothing', () => {
    expect(roundPayers(withDaniel, withDaniel.wagers[0], '2026-11-15').sort()).toEqual(['cedric', 'erik']);
    expect(owings(withDaniel, undefined, true).filter((o) => o.w.id !== 'd' && (o.from === 'daniel' || o.to === 'daniel'))).toEqual([]);
  });
  it("the pool's balances as without him (his 5+5+10 is judged from the cards, as every duel)", () => {
    expect(balances(withDaniel, undefined, true)).toEqual({ ...balances(pool, undefined, true), daniel: 0 });
  });
  it("the round's own settlement leaves him out of the pool's bets", () => {
    const r = roundLedger(withDaniel, '2026-11-15')!;
    expect([r.sascha, r.cedric, r.daniel ?? 0]).toEqual([40, -20, 0]);
  });
  it('a bet made right against him still counts', () => {
    expect(betOthers(withDaniel, { player: 'sascha', payout: 'opponent', opponent: 'daniel' })).toEqual(['daniel']);
  });
  it('a bet of his own: he is in the pool after all', () => {
    const p2: WagerPool = { ...withDaniel, wagers: [...withDaniel.wagers, bet('wd', 'daniel')] };
    expect(isGuest(p2, 'daniel')).toBe(false);
  });
  it('a player of the pool without any bet and without a 5+5+10 is no guest – he pays as before', () => {
    const p2: WagerPool = { ...pool, players: [...players, { id: 'gast', name: 'Gast' }] };
    expect(isGuest(p2, 'gast')).toBe(false);
  });
});
