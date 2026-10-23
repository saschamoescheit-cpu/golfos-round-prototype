import { describe, expect, it } from 'vitest';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, stanceAt } from './terrain';
import type { LngLat, Ring } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];

describe('caddie: ground', () => {
  it('fairway hanging from right to left: aim right', () => {
    expect(slopeAdvice(4)).toEqual({ text: 'Fairway falls from right to left (4 %) – the ball rolls left', aimM: 6 });
    expect(slopeAdvice(-2.4)!.aimM).toBe(-4);
    expect(slopeAdvice(1.5)).toBeNull();
    expect(slopeAdvice(18)!.text).toBe('Strong side slope (18 %) – balls run left, favour the right half');
    expect(slopeAdvice(12)!.aimM).toBe(10);
  });
  it('cross slope at the landing distance', () => {
    const s: [number, number][] = [[200, 1], [210, 3.5], [220, 4]];
    expect(crossSlopeAt(s, 213)).toBe(3.5);
    expect(crossSlopeAt(s, 300)).toBeNull();
  });
  it('height along the hole (4A: 17 m downhill to the landing zone)', () => {
    const s: [number, number, number][] = [[0, -6, 446.6], [100, -9, 435.2], [200, -7, 429.2]];
    expect(heightAt(s, 150)).toBeCloseTo(432.2, 1);
    expect(heightAt(s, 200)! - heightAt(s, 0)!).toBeCloseTo(-17.4, 1);
    expect(heightAt(s, 400)).toBeNull();
  });
  it('course boundary 20 m right of the landing spot', () => {
    // boundary: a north–south line 20 m east of the hole line
    const boundary: Ring[] = [[at(20, 0), at(20, 400), at(200, 400), at(200, 0), at(20, 0)]];
    expect(obAdvice(boundary, at(0, 0), at(0, 220))!.text).toBe('Out of bounds 20 m right');
    expect(obAdvice(boundary, at(0, 0), at(-40, 220))).toBeNull();
  });
});

// the stance from the terrain model (Sascha 22.10.2026, round check)
describe('stance from the heights', () => {
  const rise: [number, number, number][] = Array.from({ length: 30 }, (_, k) => [k * 10, 0, 100 + k * 0.6]); // 6 % uphill
  const side: [number, number, number][] = Array.from({ length: 30 }, (_, k) => [k * 10, 6, 100]); // right side 6 % higher
  const flat: [number, number, number][] = Array.from({ length: 30 }, (_, k) => [k * 10, 0.5, 100]);
  it('uphill towards the green, downhill back to the tee', () => {
    expect(stanceAt(rise, 150, 250, false)).toBe('up');
    expect(stanceAt(rise, 150, 50, false)).toBe('down');
  });
  it('right side higher: ball above the feet of a right-hander, below a left-hander\'s', () => {
    expect(stanceAt(side, 150, 250, false)).toBe('above');
    expect(stanceAt(side, 150, 250, true)).toBe('below');
  });
  it('flat ground, and nothing off the profile', () => {
    expect(stanceAt(flat, 150, 250, false)).toBe('flat');
    expect(stanceAt(undefined, 150, 250, false)).toBeNull();
  });
});
