import { describe, expect, it } from 'vitest';
import { greenWalk } from './greenwalk';
import type { LngLat } from '../types';
import type { TrackPoint } from './track';

const N = 1 / 110540;
const E = 1 / 73400;
const at = (east: number, north: number): LngLat => [9.69 + east * E, 48.78 + north * N];
const green = [at(-12, -12), at(12, -12), at(12, 12), at(-12, 12), at(-12, -12)];
const fix = (s: number, east: number, north: number): TrackPoint => ({ t: s * 1000, p: at(east, north), acc: 4 });

describe('the walk on the green from the GPS track', () => {
  it('the visit to the green with the spots where the player stood (first putt, second putt)', () => {
    const track: TrackPoint[] = [
      fix(0, 0, -150), fix(30, 0, -80), fix(60, 0, -20), // the approach
      fix(70, 0, -10), fix(75, 0, -9), fix(80, 0, -9.5), fix(88, 0.5, -9), fix(95, 0, -9), // stands at the first putt
      fix(100, 0, -3), fix(104, 0, 1), fix(110, 0.5, 1), fix(118, 0, 1.5), fix(125, 0, 1), // second putt from 1 m
      fix(140, 20, 20), fix(170, 60, 60), // off to the next tee
      fix(600, 30, 0), fix(605, 15, 0), fix(610, 30, 5), // later passing by on another hole – short
    ];
    const w = greenWalk(track, green, at(0, 0))!;
    expect(w.path.length).toBe(10);
    expect(w.stops.length).toBe(2);
    expect(Math.abs((w.stops[0][1] - 48.78) / N + 9.3)).toBeLessThan(1);
    expect(Math.abs((w.stops[1][1] - 48.78) / N - 1.1)).toBeLessThan(1);
  });
  it('no fixes at the green: nothing to show', () => {
    expect(greenWalk([fix(0, 0, -150), fix(10, 0, -120)], green, at(0, 0))).toBeNull();
  });
});
