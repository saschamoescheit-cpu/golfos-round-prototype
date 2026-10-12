import { describe, expect, it } from 'vitest';
import { pinStrategy, spread } from './pinstrategy';
import type { HoleMapData } from './geo';
import type { LngLat, Ring } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number, lat = 48.78): LngLat => [9.69 + (east * M) / Math.cos((lat * Math.PI) / 180), lat + north * M];
const circle = (cx: number, cy: number, r: number): Ring => {
  const pts = Array.from({ length: 24 }, (_, k) => at(cx + r * Math.cos((k / 24) * 2 * Math.PI), cy + r * Math.sin((k / 24) * 2 * Math.PI)));
  return [...pts, pts[0]];
};
// Green of radius 15 m around (0, 300); a deep bunker hugging the back right of the green.
const hole: HoleMapData = {
  line: [at(0, 0), at(0, 300)], tee: at(0, 0), green: circle(0, 300, 15), greenCenter: at(0, 300),
  bunkers: [circle(19, 312, 9)], water: [], fairways: [], tees: [],
};
const from = at(0, 160); // 140 m out, straight in

describe('pin strategy', () => {
  it('flag tucked behind the bunker (back right): play towards the middle of the green', () => {
    const p = pinStrategy({ from, pin: at(9, 308), data: hole, distM: 148, playing: 12 })!;
    expect(['centre', 'between']).toContain(p.kind);
    expect(p.saved).toBeGreaterThanOrEqual(0.08);
    expect(p.text).toMatch(/Pin close to the bunker long|Pin close to the bunker right/);
  });
  it('flag in the middle, no danger: go for it', () => {
    const p = pinStrategy({ from, pin: at(0, 298), data: hole, distM: 138, playing: 12 })!;
    expect(p.kind).toBe('pin');
    expect(p.saved).toBe(0);
  });
  it('a weaker player is sent away from the flag sooner than a good one', () => {
    const pin = at(5, 306);
    const good = pinStrategy({ from, pin, data: hole, distM: 146, playing: 0, style: 'aggressive' })!;
    const weak = pinStrategy({ from, pin, data: hole, distM: 146, playing: 30, style: 'safe' })!;
    const dGood = Math.hypot(good.aim[0] - pin[0], good.aim[1] - pin[1]);
    const dWeak = Math.hypot(weak.aim[0] - pin[0], weak.aim[1] - pin[1]);
    expect(dWeak).toBeGreaterThanOrEqual(dGood);
    expect(spread(140, 30).side).toBeGreaterThan(spread(140, 0).side);
  });
  it('no plan without a green outline or out of approach range', () => {
    expect(pinStrategy({ from, pin: at(0, 300), data: { ...hole, green: null }, distM: 140, playing: 10 })).toBeNull();
    expect(pinStrategy({ from: at(0, 0), pin: at(0, 300), data: hole, distM: 300, playing: 10 })).toBeNull();
  });
});
