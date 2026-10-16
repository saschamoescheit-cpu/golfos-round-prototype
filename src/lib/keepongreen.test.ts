import { describe, expect, it } from 'vitest';
import { distToLine, keepOnGreen, pointInRing } from './geo';
import type { LngLat } from '../types';

// Sascha 16.10.2026: "Fahne sollte sich nur auf dem Grün verschieben lassen und nicht vom Grün runter".
const N = 1 / 110540;
const E = 1 / 73400;
const at = (east: number, north: number): LngLat => [9.69 + east * E, 48.78 + north * N];
const green = [at(-10, -12), at(10, -12), at(12, 0), at(10, 12), at(-10, 12), at(-12, 0), at(-10, -12)];
const centre = at(0, 0);

describe('the flag stays on the green', () => {
  it('on the green it stays where it is', () => {
    expect(keepOnGreen(at(3, 4), green, centre)).toEqual(at(3, 4));
  });
  it('dragged 30 m off the green it waits 1 m inside the edge, on the side it was dragged to', () => {
    const p = keepOnGreen(at(0, 40), green, centre);
    expect(pointInRing(p, green)).toBe(true);
    expect(distToLine(p, green)).toBeGreaterThan(0.8);
    expect(distToLine(p, green)).toBeLessThan(1.3);
    expect((p[1] - 48.78) / N).toBeGreaterThan(9); // the back of the green
  });
  it('without a mapped green: within 25 m of its centre', () => {
    const p = keepOnGreen(at(0, 60), null, centre);
    expect((p[1] - 48.78) / N).toBeCloseTo(25, 0);
  });
});
