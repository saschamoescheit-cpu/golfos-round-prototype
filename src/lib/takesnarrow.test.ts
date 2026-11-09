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
