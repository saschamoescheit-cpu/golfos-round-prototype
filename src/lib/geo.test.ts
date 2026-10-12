import { describe, expect, it } from 'vitest';
import { alongLine, bearingDeg, detectHole, distanceM, greenFrontBack, hazardToCarry, holeMapData, isAhead, lineLength, pointAt, suggestTarget } from './geo';
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

describe('hole detection after taking the phone out of the pocket', () => {
  const geo = SEED_GEOMETRY['osm:relation/1326323'];
  const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => holeMapData(geo, 'A', n));
  const mid = (k: number) => pointAt(holes[k]!.line, lineLength(holes[k]!.line) / 2);
  it('stays on the current hole while the player is on it', () => {
    expect(detectHole(holes[0]!.tee, holes, 0)).toBeNull();
    expect(detectHole(mid(0), holes, 0)).toBeNull();
  });
  it('switches to the next hole on its tee or fairway', () => {
    expect(detectHole(holes[1]!.tee, holes, 0)).toBe(1);
    expect(detectHole(mid(2), holes, 0)).toBe(2);
  });
  it('never jumps back and ignores positions off the course', () => {
    expect(detectHole(mid(0), holes, 3)).toBeNull();
    expect(detectHole([9.0, 48.0], holes, 0)).toBeNull();
  });
});

describe('Son Quint geometry (course guide 2026 + PNOA)', () => {
  const geo = SEED_GEOMETRY['osm:relation/1654444'];
  // Official lengths from the yellow tees (course guide 2026).
  const yellow = [307, 316, 151, 333, 318, 290, 410, 330, 131, 290, 303, 166, 423, 113, 324, 339, 435, 346];
  it('all 18 holes have a line, a green outline and the official length', () => {
    yellow.forEach((len, k) => {
      const d = holeMapData(geo, 'Main', k + 1);
      expect(d, `hole ${k + 1}`).not.toBeNull();
      expect(d!.green, `green ${k + 1}`).not.toBeNull();
      expect(Math.abs(lineLength(d!.line) - len), `length ${k + 1}`).toBeLessThan(len * 0.05);
    });
  });
});

describe('Son Vida geometry (course guide 2026 + PNOA)', () => {
  const geo = SEED_GEOMETRY['osm:relation/1130271'];
  // Official lengths from the yellow tees (course guide 2026).
  const yellow = [258, 191, 332, 139, 362, 449, 298, 132, 309, 198, 483, 137, 502, 327, 368, 125, 400, 460];
  it('all 18 holes have a line, a green outline and the official length', () => {
    yellow.forEach((len, k) => {
      const d = holeMapData(geo, 'Main', k + 1);
      expect(d, `hole ${k + 1}`).not.toBeNull();
      expect(d!.green, `green ${k + 1}`).not.toBeNull();
      expect(Math.abs(lineLength(d!.line) - len), `length ${k + 1}`).toBeLessThan(len * 0.05);
    });
  });
});

describe('Son Muntaner geometry (OpenStreetMap snapshot)', () => {
  const geo = SEED_GEOMETRY['osm:way/51852280'];
  // Official lengths from the white tees (scorecard 2026); OSM lines run back tee → pin.
  const white = [372, 487, 350, 407, 196, 416, 141, 502, 388, 382, 205, 359, 130, 315, 524, 442, 328, 361];
  it('all 18 holes have a line, a green outline and about the official length', () => {
    white.forEach((len, k) => {
      const d = holeMapData(geo, 'Main', k + 1);
      expect(d, `hole ${k + 1}`).not.toBeNull();
      expect(d!.green, `green ${k + 1}`).not.toBeNull();
      expect(Math.abs(lineLength(d!.line) - len), `length ${k + 1}`).toBeLessThan(len * 0.1);
    });
  });
});

describe('Son Gual geometry (OpenStreetMap snapshot, hole 5 corrected)', () => {
  const geo = SEED_GEOMETRY['osm:way/60140256'];
  it('has all 18 holes with a line and a green', () => {
    for (let n = 1; n <= 18; n++) {
      const d = holeMapData(geo, 'Main', n);
      expect(d, `hole ${n}`).not.toBeNull();
      expect(d!.green, `green ${n}`).not.toBeNull();
    }
  });
});

import { shiftTee, teeDelta, type HoleMapData } from './geo';
describe('tee colour (019)', () => {
  const M = 1 / 111320;
  const at = (north: number): [number, number] => [2.6, 39.6 + north * M];
  const d: HoleMapData = { line: [at(0), at(200), at(350)], tee: at(0), green: null, greenCenter: at(350), bunkers: [], water: [], fairways: [], tees: [] };
  it('reference is the tee whose length matches the map line', () => {
    // Son Quint hole 1: line starts at the blue tee (307 m) – yellow is 27 m further back.
    expect(teeDelta([351, 334, 307, 284, 196], 1, 309)).toBe(-27);
    expect(teeDelta([351, 334, 307, 284, 196], 3, 309)).toBe(23);
    expect(teeDelta([139, 116, null], 2, 140)).toBe(0); // no tee of that colour: unchanged
    expect(teeDelta(undefined, 0, 300)).toBe(0);
  });
  it('forward tee cuts the line, back tee extends it', () => {
    const fwd = shiftTee(d, 50);
    expect(lineLength(fwd.line)).toBeCloseTo(300, 0);
    expect(fwd.tee).toEqual(fwd.line[0]);
    const back = shiftTee(d, -27);
    expect(lineLength(back.line)).toBeCloseTo(377, 0);
    expect(shiftTee(d, 1)).toBe(d);
  });
});

import { islandsCut, pointInRing } from './geo';
describe('island greens (025)', () => {
  it('a green inside a pond is dry land after the cut, the pond stays wet', () => {
    const M = 1 / 111320;
    const at = (e: number, n: number): LngLat => [2.76 + (e * M) / Math.cos((39.45 * Math.PI) / 180), 39.45 + n * M];
    const pond: Ring = [at(0, 0), at(80, 0), at(80, 60), at(0, 60), at(0, 0)];
    const green: Ring = [at(30, 20), at(50, 20), at(50, 40), at(30, 40), at(30, 20)];
    const [cut] = islandsCut([pond], [green]);
    expect(pointInRing(at(40, 30), cut)).toBe(false); // on the green
    expect(pointInRing(at(10, 10), cut)).toBe(true); // in the water
    expect(pointInRing(at(70, 50), cut)).toBe(true);
    expect(pointInRing(at(100, 30), cut)).toBe(false); // outside the pond
  });
});
