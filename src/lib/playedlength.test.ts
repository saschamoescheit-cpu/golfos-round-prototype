import { describe, expect, it } from 'vitest';
import { playedLengths } from './clubstats';
import { pointAt } from './geo';
import type { DetailEntry, LngLat } from '../types';

// Sascha 23.10.2026: 130 m into a strong headwind played like 160 m – the 6-iron was right; the review says so
describe('a shot as it played with the wind', () => {
  const tee: LngLat = [9.689, 48.781];
  const south = (m: number): LngLat => pointAt([tee, [9.689, 48.77]], m);
  const d: DetailEntry = { shots: [{ pos: tee, lie: 'fairway', club: '6i', penalty: false, kind: 'full' }], onGreen: south(130), pin: null, holedOut: false };
  it('into the wind longer, with it shorter, without weather as measured', () => {
    const into = playedLengths(d, { tempC: 12.5, windKmh: 20.6, windFromDeg: 186 })[0]!;
    const down = playedLengths(d, { tempC: 12.5, windKmh: 20.6, windFromDeg: 6 })[0]!;
    expect(into).toBeGreaterThan(140);
    expect(down).toBeLessThan(130);
    expect(playedLengths(d, undefined)[0]).toBeCloseTo(130, 0);
  });
});
