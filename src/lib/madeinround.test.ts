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
  it('live on the round (a phone of the pool still plays it): green once made, never red (Sascha 12.11.2026)', () => {
    expect(roundVerdict(bet({}), r(2), true)).toBe('made');
    expect(roundVerdict(bet({}), r(1), true)).toBe(null);
    expect(roundVerdict(bet({ kind: 'scoreSum', target: 35, rounds: 7 }), r(6), true)).toBe(null);
    expect(roundVerdict(bet({ kind: 'scoreSum', target: 35, rounds: 7 }), r(4), true)).toBe(null);
  });
  it('a score over 7 rounds: its share of the round shown, never coloured in one round (Sascha 12.11.2026)', () => {
    const w = bet({ kind: 'scoreSum', target: 35, rounds: 7 });
    expect(shareOf(w)).toBe(5);
    expect(parText(shareOf(w)!)).toBe('+5');
    expect(roundVerdict(w, r(4))).toBe(null);
    expect(roundVerdict(w, r(6))).toBe(null);
    expect(roundVerdict(w, r(6, true))).toBe(null);
  });
  it('in the total: the rounds added up, decided once all are played', () => {
    const w = bet({ kind: 'scoreSum', target: 10, rounds: 2 });
    const p = (vals: number[]) => ({ best: null, done: false, rounds: vals.length, at: '', perRound: vals.map((v, k) => ({ day: `2026-11-0${k + 1}`, course: 'X', value: v, counted: true })) });
    expect(sumSoFar(w, p([4]))).toEqual({ sum: 4, played: 1, of: 2, verdict: null });
    expect(sumSoFar(w, p([4, 5]))?.verdict).toBe('made');
    expect(sumSoFar(w, p([4, 7]))?.verdict).toBe('missed');
  });
  it('a round still played counts as it stands – not decided while it runs (Sascha 12.11.2026: Erik +22 instead of +28)', () => {
    // Erik's "+30 in 6 Runden": Kissimmee +6, Cypress +16, Oaks +6 still being played
    const w = bet({ kind: 'scoreSum', target: 30, rounds: 6 });
    const per = [6, 16, 6].map((v, k) => ({ day: `2026-11-1${k}`, course: 'X', value: v, counted: false, ...(k === 2 ? { open: true } : {}) }));
    expect(sumSoFar(w, { best: null, done: false, rounds: 0, at: '', perRound: per })).toEqual({ sum: 28, played: 3, of: 6, verdict: null });
    const two = bet({ kind: 'scoreSum', target: 30, rounds: 2 });
    const p2 = { best: null, done: false, rounds: 0, at: '', perRound: per.slice(1) };
    expect(sumSoFar(two, p2)?.verdict).toBe(null);
    expect(sumSoFar(two, { ...p2, perRound: p2.perRound.map(({ open: _o, ...r }) => r) })?.verdict).toBe('made');
  });
});

// Sascha 11.11.2026, USA: "Cedric hat 2 von 6 für brutto über Par in 6 Runden in der Wertung, nicht 1 von 6" – a round
// with a hole picked up stays in the total: the hole counts as net double bogey (par + 2 + the strokes he receives)
import { judge, type PlayedRound } from './wagers';
describe('a score over N rounds with a hole picked up', () => {
  const round = (id: string, day: string, pick: boolean): PlayedRound => ({
    id,
    day,
    course: 'Kissimmee',
    pars: Array(18).fill(4),
    entries: Array.from({ length: 18 }, (_, i) => (pick && i === 4 ? { strokes: null, putts: null, pickedUp: true, fairway: null, penalties: 0 } : { strokes: 5, putts: 2, pickedUp: false, fairway: null, penalties: 0 })) as PlayedRound['entries'],
    hcp: 20,
    received: Array(18).fill(1),
    counted: true,
  });
  it('both rounds count, the picked-up hole as par + 2 + 1', () => {
    const w = bet({ kind: 'scoreSum', target: 50, rounds: 6 });
    const p = judge(w, { from: '2026-11-07', to: '2026-11-17' }, [round('a', '2026-11-08', false), round('b', '2026-11-09', true)]);
    expect(p.rounds).toBe(2);
    // round a: 18 × +1 = +18; round b: 17 × +1 and the hole picked up 4 + 2 + 1 = 7 → +3 → +20
    expect(p.best).toBe(38);
    expect(sumSoFar(w, p)?.played).toBe(2);
  });
});
