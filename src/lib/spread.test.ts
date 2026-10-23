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
