import { describe, expect, it } from 'vitest';
import { madeInRound } from '../screens/Wagers';
import type { Wager } from './wagers';

// Sascha 10.11.2026, USA: "Ergebnis brutto in 7 Runden" green in the round of Celebration (+18 under +126) – a bet over
// 7 rounds must not be green in one round.
const bet = (o: Partial<Wager>): Wager => ({ id: 'w', player: 'c', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', ...o });

describe('a bet made in one round', () => {
  it('a bet for each round: green once made', () => {
    expect(madeInRound(bet({}), 3)).toBe(true);
    expect(madeInRound(bet({}), 1)).toBe(false);
    expect(madeInRound(bet({}), null)).toBe(false);
  });
  it('the score over 7 rounds: never green in one round', () => {
    expect(madeInRound(bet({ kind: 'scoreSum', target: 126, rounds: 7 }), 18)).toBe(false);
  });
  it('a bet over the whole trip: never green in one round', () => {
    expect(madeInRound(bet({ scope: 'trip', target: 2 }), 5)).toBe(false);
  });
});
