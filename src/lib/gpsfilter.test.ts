import { describe, expect, it } from 'vitest';
import { PositionFilter } from './gpsfilter';
import { distanceM } from './geo';
import type { LngLat } from '../types';

const M = 1 / 111195; // degrees latitude per metre
const at = (n: number, e = 0): LngLat => [9.69 + e * M * 1.5, 48.78 + n * M];

// deterministic "noise": a few metres in changing directions
const noise = (k: number): [number, number] => [Math.sin(k * 1.7) * 4, Math.cos(k * 2.3) * 4];

describe('GPS filter', () => {
  it('standing at the ball: the average is much closer to the truth than single fixes', () => {
    const f = new PositionFilter();
    const truth = at(0);
    let out = f.push({ pos: truth, accuracy: 5, t: 0 });
    let worstSingle = 0;
    for (let k = 1; k <= 15; k++) {
      const [dn, de] = noise(k);
      const p = at(dn, de);
      worstSingle = Math.max(worstSingle, distanceM(p, truth));
      out = f.push({ pos: p, accuracy: 5, t: k * 1000 });
    }
    expect(out.still).toBe(true);
    expect(distanceM(out.pos, truth)).toBeLessThan(1.5);
    expect(worstSingle).toBeGreaterThan(3);
    expect(out.accuracy).toBeLessThan(5);
  });
  it('walking on: follows the newest fix at once', () => {
    const f = new PositionFilter();
    for (let k = 0; k < 10; k++) f.push({ pos: at(0), accuracy: 5, t: k * 1000 });
    const out = f.push({ pos: at(12), accuracy: 5, t: 11000 });
    expect(out.still).toBe(false);
    expect(distanceM(out.pos, at(12))).toBeLessThan(0.1);
  });
  it('walking with noisy fixes: the shown position stays close behind the player', () => {
    const f = new PositionFilter();
    let worst = 0;
    for (let k = 0; k <= 60; k++) {
      const truth = at(k * 1.3); // 1.3 m/s
      const [dn, de] = noise(k);
      const out = f.push({ pos: at(k * 1.3 + dn, de), accuracy: 5, t: k * 1000 });
      if (k > 5) worst = Math.max(worst, distanceM(out.pos, truth));
    }
    expect(worst).toBeLessThan(8); // never worse than a single noisy fix plus a step or two
  });
  it('a bad fix under trees does not throw the position around', () => {
    const f = new PositionFilter();
    f.push({ pos: at(0), accuracy: 5, t: 0 });
    const out = f.push({ pos: at(60), accuracy: 70, t: 2000 });
    expect(distanceM(out.pos, at(0))).toBeLessThan(0.1);
    // … but after a while without good fixes it is taken
    const later = f.push({ pos: at(60), accuracy: 70, t: 20000 });
    expect(distanceM(later.pos, at(60))).toBeLessThan(0.1);
  });
});
