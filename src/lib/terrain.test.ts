import { describe, expect, it } from 'vitest';
import { crossSlopeAt, obAdvice, slopeAdvice } from './terrain';
import type { LngLat, Ring } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];

describe('caddie: ground', () => {
  it('fairway hanging from right to left: aim right', () => {
    expect(slopeAdvice(4)).toEqual({ text: 'Fairway falls from right to left (4 %) – the ball rolls left', aimM: 10 });
    expect(slopeAdvice(-2.4)!.aimM).toBe(-6);
    expect(slopeAdvice(1.5)).toBeNull();
    expect(slopeAdvice(18)!.text).toBe('Steep side slope (18 %) – balls run left, favour the right edge');
  });
  it('cross slope at the landing distance', () => {
    const s: [number, number][] = [[200, 1], [210, 3.5], [220, 4]];
    expect(crossSlopeAt(s, 213)).toBe(3.5);
    expect(crossSlopeAt(s, 300)).toBeNull();
  });
  it('course boundary 20 m right of the landing spot', () => {
    // boundary: a north–south line 20 m east of the hole line
    const boundary: Ring[] = [[at(20, 0), at(20, 400), at(200, 400), at(200, 0), at(20, 0)]];
    expect(obAdvice(boundary, at(0, 0), at(0, 220))!.text).toBe('Out of bounds (likely) right 20 m from your target');
    expect(obAdvice(boundary, at(0, 0), at(-40, 220))).toBeNull();
  });
});
