import { describe, expect, it } from 'vitest';
import { alongLine, bearingDeg, distanceM, greenFrontBack, hazardToCarry, holeMapData, isAhead, lineLength, pointAt, suggestTarget } from './geo';
import type { LngLat, Ring } from '../types';
import { SEED_GEOMETRY } from '../data/seedGeometry';

// 1 degree latitude ≈ 111.2 km; offsets below are built from that.
const M = 1 / 111195;
const at = (east: number, north: number, lat = 48.78): LngLat => [9.69 + (east * M) / Math.cos((lat * Math.PI) / 180), lat + north * M];

describe('distance and bearing', () => {
  it('150 m north', () => {
    expect(distanceM(at(0, 0), at(0, 150))).toBeCloseTo(150, 0);
    expect(bearingDeg(at(0, 0), at(0, 150))).toBeCloseTo(0, 0);
    expect(bearingDeg(at(0, 0), at(100, 0))).toBeCloseTo(90, 0);
  });
});

describe('green front / center / back', () => {
  // Square green 20 × 20 m, centre 150 m north of the player.
  const green: Ring = [at(-10, 140), at(10, 140), at(10, 160), at(-10, 160), at(-10, 140)];
  it('front 140, center 150, back 160', () => {
    const d = greenFrontBack(at(0, 0), green);
    expect(d.front).toBeCloseTo(140, 0);
    expect(d.center).toBeCloseTo(150, 0);
    expect(d.back).toBeCloseTo(160, 0);
  });
});

describe('hazards', () => {
  const bunker: Ring = [at(-5, 100), at(5, 100), at(5, 118), at(-5, 118), at(-5, 100)];
  it('to 100, carry ~118', () => {
    const h = hazardToCarry(at(0, 0), bunker);
    expect(h.to).toBeCloseTo(100, 0);
    expect(h.carry).toBeGreaterThan(117);
    expect(h.carry).toBeLessThan(119);
  });
  it('ahead / behind', () => {
    expect(isAhead(at(0, 0), at(0, 150), at(3, 100))).toBe(true);
    expect(isAhead(at(0, 0), at(0, 150), at(0, -30))).toBe(false);
  });
});

describe('targets along a dogleg', () => {
  // 200 m north, then 200 m east.
  const line: LngLat[] = [at(0, 0), at(0, 200), at(200, 200)];
  it('length, position along the line, point at distance', () => {
    expect(lineLength(line)).toBeCloseTo(400, 0);
    expect(alongLine(line, at(5, 100))).toBeCloseTo(100, 0);
    expect(distanceM(pointAt(line, 300), at(100, 200))).toBeLessThan(0.5);
  });
  it('first target = 220 m along the line (round the corner), second ~55 % of the rest', () => {
    const t1 = suggestTarget(line, line[0]);
    expect(distanceM(t1, at(20, 200))).toBeLessThan(0.5);
    const t2 = suggestTarget(line, t1);
    expect(alongLine(line, t2)).toBeCloseTo(220 + 0.55 * 180, 0);
  });
});

describe('Hetzenhof geometry', () => {
  const geo = SEED_GEOMETRY['osm:relation/1326323'];
  it('every A/B/C hole has a line and a green', () => {
    for (const loop of ['A', 'B', 'C']) {
      for (let n = 1; n <= 9; n++) {
        const d = holeMapData(geo, loop, n);
        expect(d, `${n}${loop}`).not.toBeNull();
        expect(d!.green, `green ${n}${loop}`).not.toBeNull();
      }
    }
  });
  it('hole lengths are plausible for their par', () => {
    const d = holeMapData(geo, 'A', 4)!; // par 5
    const len = d.line.slice(1).reduce((s, p, i) => s + distanceM(d.line[i], p), 0);
    expect(len).toBeGreaterThan(380);
    expect(len).toBeLessThan(600);
  });
});
