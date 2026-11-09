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

// Sascha 10.11.2026: "a round played – green when made, else red; over 7 rounds the strokes by the rounds (Erik +35 →
// +5 a round); in the total the rounds added up, coloured once all are played"
import { roundVerdict, shareOf, sumSoFar, parText } from '../screens/Wagers';
describe('a round decided', () => {
  const r = (value: number | null, open = false) => ({ day: '2026-11-09', course: 'Kissimmee', value, counted: true, ...(open ? { open: true } : {}) });
  it('a bet for each round: green made, red missed once played, nothing while it is played', () => {
    expect(roundVerdict(bet({}), r(2))).toBe('made');
    expect(roundVerdict(bet({}), r(1))).toBe('missed');
    expect(roundVerdict(bet({}), r(1, true))).toBe(null);
    expect(roundVerdict(bet({}), r(null))).toBe(null);
  });
  it('a score over 7 rounds: its share of the round', () => {
    const w = bet({ kind: 'scoreSum', target: 35, rounds: 7 });
    expect(shareOf(w)).toBe(5);
    expect(parText(shareOf(w)!)).toBe('+5');
    expect(roundVerdict(w, r(4))).toBe('made');
    expect(roundVerdict(w, r(6))).toBe('missed');
    expect(roundVerdict(w, r(6, true))).toBe(null);
  });
  it('in the total: the rounds added up, decided once all are played', () => {
    const w = bet({ kind: 'scoreSum', target: 10, rounds: 2 });
    const p = (vals: number[]) => ({ best: null, done: false, rounds: vals.length, at: '', perRound: vals.map((v, k) => ({ day: `2026-11-0${k + 1}`, course: 'X', value: v, counted: true })) });
    expect(sumSoFar(w, p([4]))).toEqual({ sum: 4, played: 1, of: 2, verdict: null });
    expect(sumSoFar(w, p([4, 5]))?.verdict).toBe('made');
    expect(sumSoFar(w, p([4, 7]))?.verdict).toBe('missed');
  });
});
