import { describe, expect, it } from 'vitest';
import { mono } from './golf3d';

// the 3D swing between its keys: smooth through a key, never beyond one, still where it holds or turns
describe('mono: the curve between the keys of a 3D swing', () => {
  const at = (p: number[], t: number[], i: number, u: number) => mono(p[Math.max(i - 1, 0)], p[i], p[i + 1], p[Math.min(i + 2, p.length - 1)], t[Math.max(i - 1, 0)], t[i], t[i + 1], t[Math.min(i + 2, p.length - 1)], u);
  it('passes through every key', () => {
    const p = [0, 10, 30, 35];
    const t = [0, 1, 2, 3];
    for (let i = 0; i < 3; i++) {
      expect(at(p, t, i, 0)).toBeCloseTo(p[i]);
      expect(at(p, t, i, 1)).toBeCloseTo(p[i + 1]);
    }
  });
  it('keeps moving through a key on the way (no stop at every position)', () => {
    const p = [0, 10, 30];
    const t = [0, 1, 2];
    const e = 1e-3;
    // the speed just before and just after the middle key: the same and not zero
    const before = (at(p, t, 0, 1) - at(p, t, 0, 1 - e)) / e;
    const after = (at(p, t, 1, e) - at(p, t, 1, 0)) / e;
    expect(before).toBeGreaterThan(5);
    expect(after).toBeCloseTo(before, 0);
  });
  it('never goes beyond the top of the backswing, and rests where it holds', () => {
    const p = [0, 0, 90, 20];
    const t = [0, 0.5, 2, 2.8];
    for (let u = 0; u <= 1; u += 0.05) {
      expect(at(p, t, 0, u)).toBe(0);
      expect(at(p, t, 1, u)).toBeLessThanOrEqual(90 + 1e-9);
      expect(at(p, t, 2, u)).toBeLessThanOrEqual(90 + 1e-9);
      expect(at(p, t, 2, u)).toBeGreaterThanOrEqual(20 - 1e-9);
    }
  });
});
