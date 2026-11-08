import { describe, expect, it } from 'vitest';
import { cellOf } from '../screens/Wagers';
import type { Progress, Wager } from './wagers';

// The cell of a bet in the pool's standing: the target, then the best so far (Sascha 08.11.2026: "instead of the 0 I'd
// prefer the dash")
const bet = (patch: Partial<Wager>): Wager => ({ id: 'w', player: 'p', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', ...patch });

const pr = (p: Partial<Progress>): Progress => ({ best: null, done: false, rounds: 0, at: '', ...p });

describe('a bet cell', () => {
  it('none yet – and a count of 0, provisional or counted – is a dash', () => {
    expect(cellOf(bet({}), undefined)).toBe('2/–');
    expect(cellOf(bet({}), pr({ best: null }))).toBe('2/–');
    expect(cellOf(bet({}), pr({ best: null, pending: 0 }))).toBe('2/–');
    expect(cellOf(bet({}), pr({ best: 0 }))).toBe('2/–');
    expect(cellOf(bet({ kind: 'greens', target: 11 }), pr({ best: null, pending: 0 }))).toBe('11/–');
  });
  it('a count above 0 stays a number; a score of par stays "E"', () => {
    expect(cellOf(bet({}), pr({ best: 1 }))).toBe('2/1');
    expect(cellOf(bet({ kind: 'score', target: 2 }), pr({ best: 0 }))).toBe('+2/E');
  });
});
