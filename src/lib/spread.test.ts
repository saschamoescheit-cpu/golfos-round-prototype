import { describe, expect, it } from 'vitest';
import { clubSpread, estimatedSpread, spreadShape } from './spread';
import { distanceM } from './geo';
import type { ClubReport } from './clubstats';
import type { LngLat } from '../types';

// the spread of a club (Sascha 23.10.2026): own shots from 5 on, else estimated from the handicap; on the map an
// ellipse around the landing spot and the cone from the ball
describe('the spread of a club', () => {
  it('estimated: wider with the length and the handicap, the same on both sides', () => {
    const pro = estimatedSpread('7i', 150, 2);
    const club = estimatedSpread('7i', 150, 28);
    expect(club.side.hi).toBeGreaterThan(pro.side.hi);
    expect(estimatedSpread('Dr', 220, 18).side.hi).toBeGreaterThan(estimatedSpread('9i', 110, 18).side.hi);
    expect(club.side.lo).toBe(-club.side.hi);
    expect(club.shots).toBe(0);
  });
  it('own shots once there are 5 – the side and the length band', () => {
    const rep = { club: '7i', corridor: { lo: -14, hi: 6, shots: 7 }, lenBand: { lo: -9, hi: 7 } } as unknown as ClubReport;
    expect(clubSpread('7i', 150, rep, 18)).toMatchObject({ side: { lo: -14, hi: 6 }, len: { lo: -9, hi: 7 }, shots: 7 });
    const few = { ...rep, corridor: null } as unknown as ClubReport;
    expect(clubSpread('7i', 150, few, 18).shots).toBe(0);
  });
  it('on the map: the ellipse around the landing spot, shifted to the side the balls go', () => {
    const from: LngLat = [9.689, 48.781];
    const target: LngLat = [9.689, 48.7797]; // ~145 m south
    const s = { club: '7i' as const, side: { lo: -20, hi: 0 }, len: { lo: -8, hi: 8 }, shots: 6 };
    const { ellipse, cone } = spreadShape(from, target, s);
    expect(ellipse.length).toBeGreaterThan(20);
    const width = Math.max(...ellipse.map((p) => distanceM(p, ellipse[0])));
    expect(width).toBeGreaterThan(18);
    expect(width).toBeLessThan(23);
    // shooting south, "left" is east: the middle of the ellipse lies east of the target
    const mid = ellipse.reduce((a, p) => [a[0] + p[0] / ellipse.length, a[1] + p[1] / ellipse.length], [0, 0]);
    expect(mid[0]).toBeGreaterThan(target[0]);
    expect(cone).toHaveLength(2);
    expect(cone[0][0]).toEqual(from);
  });
});

// Sascha 25.10.2026: the estimate for short clubs longer than wide (amateurs miss wedges in length more than to the side)
describe('the estimated shape by length', () => {
  it('a wedge longer than wide, a driver wider than long, the 7-iron about round', () => {
    const w = estimatedSpread('SW', 70, 18);
    expect(w.len.hi).toBeGreaterThan(w.side.hi * 1.3);
    const d = estimatedSpread('Dr', 220, 18);
    expect(d.side.hi).toBeGreaterThan(d.len.hi);
    const i7 = estimatedSpread('7i', 143, 18);
    expect(Math.abs(i7.side.hi - i7.len.hi)).toBeLessThanOrEqual(Math.max(2, i7.side.hi * 0.1));
  });
});

// feature 037: own shots on the course first, then the launch monitor, then the estimate
describe('where the spread comes from', () => {
  const lm = { club: '7i' as const, shots: 24, carry: 137, len: { lo: -6, hi: 5 }, side: { lo: -7, hi: 4 } };
  it('the launch monitor before the estimate', () => {
    const s = clubSpread('7i', 137, undefined, 18, lm);
    expect(s.source).toBe('lm');
    expect(s.shots).toBe(24);
    expect(s.side).toEqual({ lo: -7, hi: 4 });
    expect(s.len).toEqual({ lo: -6, hi: 5 });
  });
  it('own shots on the course before the launch monitor', () => {
    const report = { club: '7i', shots: 9, median: 135, basis: 'good', rated: 9, good: 7, misses: {}, flights: {}, flown: 0, corridor: { lo: -12, hi: 9, shots: 9 }, lenBand: { lo: -10, hi: 8 }, points: [] } as never;
    expect(clubSpread('7i', 137, report, 18, lm).source).toBe('own');
  });
  it('without either: the estimate', () => {
    expect(clubSpread('7i', 137, undefined, 18, null).source).toBe('est');
  });
});
