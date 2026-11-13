import { describe, expect, it } from 'vitest';
import { takes } from './wagerstore';
import type { Progress, Wager, WagerPool } from './wagers';

// Sascha 10.11.2026, USA: a test round on the Hetzenhof (08.11.) made Moritz's bets – "nobody has made a bet yet". The
// pool narrowed to the trip's rounds: the host's judgement without that round replaces the old one, though it has fewer.
const w: Wager = { id: 'w', player: 'm', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any' };
const old: Progress = { best: 2, done: false, rounds: 2, at: 'x', perRound: [{ day: '2026-11-07', course: 'Celebration Golf Club', value: 1 }, { day: '2026-11-08', course: 'Golfclub Hetzenhof', value: 2 }] } as Progress;
const now: Progress = { best: 1, done: false, rounds: 1, at: 'y', perRound: [{ day: '2026-11-07', course: 'Celebration Golf Club', value: 1 }] } as Progress;
const open: Pick<WagerPool, 'from' | 'to' | 'rounds'> = { from: '2026-11-05', to: '2026-11-18' };
const trip: Pick<WagerPool, 'from' | 'to' | 'rounds'> = { ...open, rounds: [{ id: 'r1', day: '2026-11-07', course: 'Celebration Golf Club' }, { id: 'r2', day: '2026-11-09', course: 'Kissimmee Bay Country Club' }] };

describe('another player\'s bet judged anew', () => {
  it('fewer rounds: kept as it was while every round still counts', () => {
    expect(takes(w, 's', old, now, open)).toBe(false);
  });
  it('a round no longer in the pool: the new judgement wins', () => {
    expect(takes(w, 's', old, now, trip)).toBe(true);
  });
});

// audit 13.11.2026: Moritz's phone reported in the middle of the Oaks round (pars in a row 3, open) and never again; the
// host's phone has his finished card (7) – it takes over, though his best of the trip was higher before
describe('a round reported while played, finished now', () => {
  const pars: Wager = { id: 'p', player: 'm', kind: 'parRun', target: 9, stake: 20, payout: 'success', attempts: 'any' } as unknown as Wager;
  const before: Progress = { best: 8, done: false, rounds: 2, at: 'x', perRound: [{ day: '2026-11-09', course: 'K', value: 8 }, { day: '2026-11-12', course: 'Oaks', value: 3, open: true }] } as Progress;
  const after: Progress = { best: 8, done: false, rounds: 2, at: 'y', perRound: [{ day: '2026-11-09', course: 'K', value: 8 }, { day: '2026-11-12', course: 'Oaks', value: 7 }] } as Progress;
  it('the host\'s finished round wins', () => {
    expect(takes(pars, 's', before, after, open)).toBe(true);
  });
  it('both still running: as before (no better best, no more rounds)', () => {
    const still = { ...after, perRound: [after.perRound![0], { ...after.perRound![1], value: 4, open: true }] } as Progress;
    expect(takes(pars, 's', before, still, open)).toBe(false);
  });
});
