import { describe, expect, it } from 'vitest';
import { stateOf, sumSoFar, type Progress, type Wager, type WagerPool } from './wagers';

// Audit 13.11.2026 (USA-Wetten, live data): Cedric's "Ergebnis brutto in 6 Runden" – the standing showed +53 after 3 of
// 6 rounds (summed from the rounds), the settlement read the stored total of his older app (best 30 after 2 rounds). Both
// now read the rounds: the bet is decided by them.
const w: Wager = { id: 's1', player: 'pc', kind: 'scoreSum', target: 108, stake: 20, payout: 'success', attempts: 'any', rounds: 6, counted: true } as unknown as Wager;
const pool = (p: Progress): WagerPool => ({ kind: 'wager-pool', id: 'p', name: 'USA', from: '2026-11-07', to: '2026-11-17', createdAt: '', players: [], wagers: [w], progress: { s1: p } }) as unknown as WagerPool;
const round = (day: string, value: number, open = false) => ({ day, course: 'X', value, counted: !open, ...(open ? { open: true } : {}) });
const stale = { best: 30, done: false, rounds: 2, at: '' };

describe('a total over 6 rounds: the settlement reads its rounds', () => {
  it('3 of 6 played (+53): open – not "missed" from a stored total, not before the 6', () => {
    const p = { ...stale, perRound: [round('2026-11-07', 22), round('2026-11-09', 18), round('2026-11-12', 13)] } as Progress;
    expect(sumSoFar(w, p)).toEqual({ sum: 53, played: 3, of: 6, verdict: null });
    expect(stateOf(w, pool(p), '2026-11-13')).toBe('open');
  });
  it('6 played, +100 ≤ +108: made – even with the old stored total', () => {
    const p = { ...stale, perRound: [18, 17, 16, 17, 16, 16].map((v, k) => round(`2026-11-1${k}`, v)) } as Progress;
    expect(stateOf(w, pool(p), '2026-11-17')).toBe('done');
  });
  it('6 played, +115: missed; the sixth still running: open', () => {
    const per = [20, 20, 20, 20, 20, 15].map((v, k) => round(`2026-11-1${k}`, v));
    expect(stateOf(w, pool({ ...stale, perRound: per } as Progress), '2026-11-17')).toBe('missed');
    expect(stateOf(w, pool({ ...stale, perRound: per.map((r, k) => (k === 5 ? { ...r, open: true } : r)) } as Progress), '2026-11-16')).toBe('open');
  });
  it('a report from an older app without its rounds: as before', () => {
    expect(stateOf(w, pool({ best: 100, done: false, rounds: 6, at: '' } as Progress), '2026-11-13')).toBe('missed');
  });
});
