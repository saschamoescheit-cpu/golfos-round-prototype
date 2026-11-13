import { describe, expect, it } from 'vitest';
import { roundsSettled } from '../components/RoundSettle';
import { judge, roundLedger, type PlayedRound, type Wager, type WagerPool } from './wagers';
import { emptyEntry } from './scoring';
import type { PoolEntry } from './wagerstore';

// "Settled after every round played" (Sascha 09.11.2026): each round's money on its own.
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const round = (scores: number[], day: string, open = false): PlayedRound => ({
  id: day, day, course: 'K', pars: PARS, entries: scores.map((s) => ({ ...emptyEntry(), strokes: s })), hcp: 10, counted: true, ...(open ? { open: true } : {}),
});
const birdies = (n: number) => PARS.map((p, i) => (i < n ? p - 1 : p));
const bet: Wager = { id: 'w', player: 'c', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any' };
const pool = (progress: WagerPool['progress']): WagerPool => ({
  kind: 'wager-pool', id: 'p', name: 'USA-Wetten', from: '2026-11-05', to: '2026-11-18', createdAt: '', currency: 'USD',
  players: [{ id: 'c', name: 'Chris' }, { id: 'e', name: 'Erik' }, { id: 's', name: 'Sascha' }], wagers: [bet], progress,
});
const span = { from: '2026-11-05', to: '2026-11-18' };

describe('each round settled on its own', () => {
  const p = judge(bet, span, [round(birdies(3), '2026-11-08'), round(PARS, '2026-11-09'), round(birdies(4), '2026-11-10', true)]);
  it('made on the 8th: Chris +40, the others −20 each – missed on the 9th: nothing (only when made)', () => {
    expect(roundLedger(pool({ w: p }), '2026-11-08')).toEqual({ c: 40, e: -20, s: -20 });
    expect(roundLedger(pool({ w: p }), '2026-11-09')).toEqual({ c: 0, e: 0, s: 0 });
  });
  it('the round still being played: not settled yet', () => {
    expect(roundLedger(pool({ w: p }), '2026-11-10')).toBeNull();
  });
  it('on the start page: the 8th once, not the 9th (no money) nor the 10th (still played); seen – gone', () => {
    const e: PoolEntry = { code: 'ABC123', me: 's', pool: pool({ w: p }) };
    expect(roundsSettled([e], '2026-11-10', []).map((x) => [x.day, x.money.s])).toEqual([['2026-11-08', -20]]);
    expect(roundsSettled([e], '2026-11-10', ['ABC123|2026-11-08'])).toEqual([]);
  });
});

// audit 13.11.2026: a round whose details are missing ("5?" – putts not in) is not settled as missed, a "höchstens" bet
// not as made – as the standing (tally) decides it
describe('details missing: not decided in the round\'s settlement', () => {
  const most: Wager = { id: 'm', player: 'c', kind: 'putts', target: 30, stake: 20, payout: 'opponent', opponent: 'e', attempts: 'any' } as unknown as Wager;
  const greens: Wager = { id: 'g', player: 'c', kind: 'greens', target: 8, stake: 20, payout: 'opponent', opponent: 'e', attempts: 'any' } as unknown as Wager;
  const at = '2026-11-12';
  const p = (value: number) => ({ best: value, done: false, rounds: 1, at, perRound: [{ day: at, course: 'K', value, counted: true, unknown: true }] });
  it('greens "5?" (target 8): nothing settled; a "höchstens" bet with 28 putts so far: not made', () => {
    expect(roundLedger({ ...pool({ g: p(5) }), wagers: [greens] }, at)).toBeNull();
    expect(roundLedger({ ...pool({ m: p(28) }), wagers: [most] }, at)).toBeNull();
  });
  it('the details in: settled', () => {
    const known = { ...p(9), perRound: [{ day: at, course: 'K', value: 9, counted: true }] };
    expect(roundLedger({ ...pool({ g: known }), wagers: [greens] }, at)).toEqual({ c: 20, e: -20, s: 0 });
  });
});
