import { describe, expect, it } from 'vitest';
import type { Club } from '../types';
import type { LmShot } from './launchmonitor';
import { closeGaps, flightOf, mishits, offTour, outOfOrder, spreadOf, TOUR } from './rangesession';

// The session page's sums (Sascha 26.10.2026): the flights of the round check from the device's numbers, the bag beside the
// measurement, the tour average.
const shot = (o: Partial<LmShot>): LmShot => ({ club: '7i', carry: 150, side: 0, ...o });

describe('the flight from launch direction and curve', () => {
  it('the nine flights and draw/fade for a right-hander', () => {
    expect(flightOf(shot({ dir: 0, sideAngle: 0, side: 0 }))).toBe('straight');
    expect(flightOf(shot({ dir: -4, sideAngle: -4, side: -10 }))).toBe('pull');
    expect(flightOf(shot({ dir: -4, sideAngle: -8, side: -21 }))).toBe('pullHook');
    expect(flightOf(shot({ dir: 0, sideAngle: 4, side: 10 }))).toBe('slice');
    expect(flightOf(shot({ dir: 4, sideAngle: 9, side: 24 }))).toBe('pushSlice');
    // started right, curved back near the line: a draw; past it: a push hook
    expect(flightOf(shot({ dir: 3, sideAngle: 0.5, side: 1.3 }))).toBe('draw');
    expect(flightOf(shot({ dir: 3, sideAngle: -4, side: -10 }))).toBe('pushHook');
    expect(flightOf(shot({ dir: -3, sideAngle: -0.5, side: -1.3 }))).toBe('fade');
  });
  it('mirrored for a left-hander – his pull goes right', () => {
    expect(flightOf(shot({ dir: 4, sideAngle: 4, side: 10 }), true)).toBe('pull');
    expect(flightOf(shot({ dir: 0, sideAngle: -4, side: -10 }), true)).toBe('slice');
  });
  it('the curve from the side distance when the file has no angle; nothing without a launch direction', () => {
    expect(flightOf(shot({ dir: 0, side: 12, carry: 150 }))).toBe('slice');
    expect(flightOf(shot({ side: 12 }))).toBeNull();
  });
});

describe('spread, mishits, gaps', () => {
  const xs = [148, 150, 152, 155, 157, 160, 70].map((c, k) => shot({ carry: c, side: [-6, 4, 0, 8, -3, 2, 30][k] }));
  it('a clear mishit (under 60 % of the median) is left out of carry and spread', () => {
    expect(mishits(xs).size).toBe(1);
    const s = spreadOf(xs);
    expect(s.shots).toBe(6);
    expect(s.carry).toBe(154);
    expect(s.sideHi!).toBeLessThan(10);
  });
  it('the bag beside the measurement: clubs that do not fit the order', () => {
    const measured = new Map<Club, number>([['7i', 159], ['PW', 117]]);
    const bag: { club: Club; carry: number }[] = [{ club: '5i', carry: 150 }, { club: '6i', carry: 140 }, { club: '7i', carry: 159 }, { club: '8i', carry: 120 }, { club: '9i', carry: 110 }, { club: 'PW', carry: 117 }, { club: 'GW', carry: 85 }];
    expect([...outOfOrder(measured, bag)].sort()).toEqual(['5i', '6i', '9i']);
  });
  it('neighbouring measured clubs close together: 4i only 11 m beyond 7i (three clubs)', () => {
    expect(closeGaps(new Map<Club, number>([['4i', 170], ['7i', 159], ['PW', 117]]))).toEqual([{ long: '4i', short: '7i', gap: 11, steps: 3 }]);
  });
  it('against the tour: spin a quarter off, attack angle 2.5°, smash 0.06 below', () => {
    const t = TOUR['7i']!;
    expect(t.clubSpeed).toBe(145);
    expect(offTour('spin', 4865, t.spin)).toBe(true);
    expect(offTour('spin', 6800, t.spin)).toBe(false);
    expect(offTour('attack', -0.6, t.attack)).toBe(true);
    expect(offTour('smash', 1.35, t.smash)).toBe(false);
  });
});
