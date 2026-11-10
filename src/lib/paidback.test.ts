import { describe, expect, it } from 'vitest';
import type { WagerPool } from './wagers';
import { people } from './gamepay';
import { balances, openPoolTransfers, owings, settleDebts } from './wagers';

// Sascha 12.11.2026: "Chris shows 70 – the 10 for yesterday's 5+5+10 I paid yesterday already": Chris owes Sascha 80 for
// his bets, Sascha owed Chris 10 for the duel and paid it – open is Chris's 80, in the pool and in the balance
describe('a debt paid, the other way still open', () => {
  const at = '2026-11-10T10:00:00Z';
  const done = { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } };
  const base = {
    kind: 'wager-pool', id: 'p', name: 'USA-Wetten', from: '2026-11-05', to: '2026-11-18', createdAt: at, currency: 'USD',
    players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }],
    wagers: [
      { id: 'w1', player: 's', kind: 'birdies', target: 3, stake: 80, payout: 'opponent', opponent: 'c', attempts: 'any' },
      { id: 'd', player: 'c', kind: 'nassau', opponent: 's', parts: { front: 5, back: 5, total: 10 }, stake: 0, payout: 'opponent', attempts: 'day', day: '2026-11-11' },
    ],
    progress: { w1: done, d: { best: null, done: false, rounds: 1, amount: 10, duels: [], at } },
    payments: [{ id: 'x', from: 's', to: 'c', amount: 10, paidAt: at }],
  } as unknown as WagerPool;
  for (const settle of [undefined, 'single'] as const) {
    const pool = { ...base, ...(settle ? { settle } : {}) } as WagerPool;
    it(`settled ${settle ?? 'set off'}: Chris pays Sascha 80 – in the pool and in the balance`, () => {
      const debts = settleDebts(pool, owings(pool, '2026-11-12', true));
      const open = openPoolTransfers(pool, balances(pool, '2026-11-12', true), debts);
      expect(open.map((t) => `${t.from}${t.to}${t.amount}`)).toEqual(['cs80']);
      const chris = people([], [{ code: 'P', me: 's', pool }], '2026-11-12').find((p) => p.name === 'Chris')!;
      expect(chris.items[0].open).toBe(80);
    });
  }
});

// the balance judges a challenged 5+5+10 from the cards as the pool does – not by the progress kept from before (gross
// 20 kept, the cards now say otherwise: here no card at all – nothing)
describe('the balance with a 5+5+10 from the cards', () => {
  const at = '2026-11-10T10:00:00Z';
  const pool = {
    kind: 'wager-pool', id: 'p', name: 'USA-Wetten', from: '2026-11-05', to: '2026-11-18', createdAt: at, currency: 'USD',
    players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }],
    wagers: [
      { id: 'w1', player: 's', kind: 'birdies', target: 3, stake: 80, payout: 'opponent', opponent: 'c', attempts: 'any' },
      { id: 'd', player: 'c', kind: 'nassau', opponent: 's', parts: { front: 5, back: 5, total: 10 }, stake: 0, payout: 'opponent', attempts: 'day', day: '2026-11-11', challenge: { state: 'accepted', at } },
    ],
    progress: { w1: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } }, d: { best: null, done: false, rounds: 1, amount: 20, duels: [], at } },
  } as unknown as WagerPool;
  it('the kept 20 does not count – Chris owes Sascha his 80', () => {
    const chris = people([], [{ code: 'P', me: 's', pool }], '2026-11-12').find((p) => p.name === 'Chris')!;
    expect(chris.items[0].open).toBe(80);
  });
});
