import { describe, expect, it } from 'vitest';
import { balances, decidedOf, owings, sameProgress, stateOf, type Progress, type Wager, type WagerPool } from './wagers';
import { concedable, concedeCost } from '../screens/Wagers';

// A bet given up (Sascha 14.11.2026): Cedric's "brutto in 6 Runden" against Chris (+108) and against Sascha (+109) – +90
// after 4 of 6, he paid both 20 $ early. Given up it counts as missed: he pays each opponent once; a bet "only when made"
// costs nothing; the host's word by hand wins; the reports of the rounds keep it.
const W = (id: string, player: string, extra: Partial<Wager>): Wager => ({ id, player, kind: 'scoreSum', target: 108, rounds: 6, stake: 20, payout: 'opponent', attempts: 'any', counted: true, ...extra }) as Wager;
const fourOfSix: Progress = { best: 90, done: false, rounds: 4, at: 'x', perRound: [1, 2, 3, 4].map((k) => ({ day: `2026-11-0${k + 5}`, course: 'C' + k, value: 22 + (k % 2), counted: true })) } as Progress;
const pool = (progress: WagerPool['progress']): WagerPool =>
  ({
    kind: 'wager-pool',
    id: 'p',
    name: 'USA-Wetten',
    from: '2026-11-05',
    to: '2026-11-18',
    currency: 'USD',
    createdAt: 'x',
    players: [
      { id: 's', name: 'Sascha' },
      { id: 'c', name: 'Cedric' },
      { id: 'h', name: 'Chris' },
    ],
    wagers: [W('vsChris', 'c', { opponent: 'h' }), W('vsSascha', 'c', { opponent: 's', target: 109 }), W('pars', 'c', { kind: 'parRun', target: 5, payout: 'success', rounds: undefined, opponent: undefined })],
    progress,
  }) as unknown as WagerPool;
const today = '2026-11-14';

describe('a bet given up', () => {
  it('still open: it can be given up – and what it costs: 20 $ to the opponent; nothing for "only when made"', () => {
    const p = pool({ vsChris: fourOfSix, vsSascha: fourOfSix });
    expect(concedable(p.wagers[0], p, today)).toBe(true);
    expect(concedeCost(p.wagers[0], p)).toEqual([{ to: 'h', amount: 20 }]);
    expect(concedeCost(p.wagers[2], p)).toEqual([]);
  });

  it('given up: missed, Cedric pays Chris and Sascha 20 $ each – and it cannot be given up twice', () => {
    const c = { at: '2026-11-14T13:00:00Z', by: 'Cedric' };
    const p = pool({ vsChris: { ...fourOfSix, conceded: c }, vsSascha: { ...fourOfSix, conceded: c } });
    expect(stateOf(p.wagers[0], p, today)).toBe('missed');
    expect(decidedOf(p.progress.vsChris)).toEqual({ done: false, by: 'Cedric', conceded: true });
    const owed = owings(p, today, true).map((o) => `${o.from}>${o.to}:${o.amount}`).sort();
    expect(owed).toEqual(['c>h:20', 'c>s:20']);
    expect(balances(p, today, true)).toMatchObject({ c: -40, h: 20, s: 20 });
    expect(concedable(p.wagers[0], p, today)).toBe(false);
  });

  it('the host\'s word wins: decided "made" by hand over a giving up', () => {
    const p = pool({ vsChris: { ...fourOfSix, conceded: { at: 'x', by: 'Cedric' }, manual: { done: true, by: 'Sascha' } } });
    expect(stateOf(p.wagers[0], p, today)).toBe('done');
  });

  it('a new report of the rounds is the same judgement – the giving up does not make it a change', () => {
    expect(sameProgress({ ...fourOfSix, conceded: { at: 'x', by: 'Cedric' } }, { ...fourOfSix, at: 'y' })).toBe(true);
  });
});
