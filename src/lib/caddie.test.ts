import { describe, expect, it } from 'vitest';
import { adviseClub, DEFAULT_CARRY, explain, playsLike, type CarryBag } from './caddie';

// Sascha's example: 7-iron carries 155 m; par 3 of 160 m, headwind with gusts of 30 km/h, 14 °C → 5-iron.
const bag: CarryBag = DEFAULT_CARRY.map((b) => ({ ...b, carry: ({ '5i': 178, '6i': 167, '7i': 155, '8i': 144, '4i': 188, Hy: 195, '5W': 205, '3W': 215, Dr: 235 } as Record<string, number>)[b.club] ?? b.carry }));

describe('AI caddie', () => {
  it('still air at 20 °C, flat: plays like the distance, 7-iron for 155 m', () => {
    const p = playsLike(155, 0, { windKmh: 0, gustKmh: 0, windFromDeg: 0, tempC: 20 }, 0);
    expect(p.playsLike).toBeCloseTo(155, 5);
    expect(adviseClub(p.playsLike, bag).club).toBe('7i');
  });
  it('par 3 of 160 m into gusty headwind at 14 °C → 5-iron', () => {
    // Hole plays north (0°), wind from the north: 20 km/h, gusts 30 km/h → effective 25 km/h.
    const p = playsLike(160, 0, { windKmh: 20, gustKmh: 30, windFromDeg: 0, tempC: 14 }, 0);
    expect(p.headKmh).toBe(25);
    expect(Math.round(p.wind)).toBe(20); // 160 × 0.5 % × 25
    expect(Math.round(p.temp)).toBe(2); // 160 × 0.25 % × 6
    expect(Math.round(p.playsLike)).toBe(182);
    expect(adviseClub(p.playsLike, bag).club).toBe('5i');
    expect(explain(p, { windKmh: 20, gustKmh: 30, windFromDeg: 0, tempC: 14 })[0]).toBe('Into the wind 25 km/h (gusty): +20 m');
  });
  it('downwind helps less than headwind hurts; downhill plays shorter', () => {
    const tail = playsLike(160, 0, { windKmh: 20, gustKmh: 20, windFromDeg: 180, tempC: 20 }, 0);
    expect(Math.round(tail.wind)).toBe(-8);
    const down = playsLike(160, 0, null, -20);
    expect(down.playsLike).toBe(140);
    expect(adviseClub(down.playsLike, bag).club).toBe('8i');
  });
  it('aim: wind and own tendency combined', async () => {
    const { aimAdvice } = await import('./caddie');
    expect(aimAdvice(8, null, '7i')).toBe('Aim 8 m right (wind)');
    expect(aimAdvice(0, 8, '7i')).toBe('Aim 8 m left (your 7-iron goes 8 m right on average)');
    expect(aimAdvice(5, 8, '7i')).toBe('Aim 3 m left (wind + your 7-iron goes 8 m right on average)');
    expect(aimAdvice(1, 2, '7i')).toBeNull();
    expect(aimAdvice(-9, null, 'Dr', -17)).toBe('Aim at the left edge of the fairway (wind + slope)');
    expect(aimAdvice(25, null, 'Dr')).toBe('Aim 20 m right (wind)');
  });
  it('crosswind from the right: aim right', () => {
    const p = playsLike(150, 0, { windKmh: 20, gustKmh: 20, windFromDeg: 90, tempC: 20 }, 0);
    expect(p.crossKmh).toBe(20);
    expect(p.aimM).toBe(8); // 20 km/h × 0.25 m × 1.5
  });
  it('driver only from the tee', () => {
    expect(adviseClub(230, bag).club).not.toBe('Dr');
    expect(adviseClub(230, bag, true).club).toBe('Dr');
  });
});

import { missMap, strokesFrom } from './missmap';
import type { HoleMapData } from './geo';
import type { LngLat, Ring } from '../types';

describe('where not to miss', () => {
  const M = 1 / 111195;
  const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
  const sq = (cx: number, cy: number, r: number): Ring => [at(cx - r, cy - r), at(cx + r, cy - r), at(cx + r, cy + r), at(cx - r, cy + r), at(cx - r, cy - r)];
  // Green at 150 m north; bunker short-left, water right of the green.
  const hole: HoleMapData = { line: [at(0, 0), at(0, 150)], tee: at(0, 0), green: sq(0, 150, 12), greenCenter: at(0, 150), bunkers: [sq(-16, 138, 5)], water: [sq(25, 150, 8)], fairways: [], tees: [] };
  const pin = at(0, 150);
  it('on the green is best, bunker worse, water worst', () => {
    const green = strokesFrom(at(4, 152), pin, hole);
    const bunker = strokesFrom(at(-16, 138), pin, hole);
    const water = strokesFrom(at(25, 150), pin, hole);
    expect(green).toBeLessThan(bunker);
    expect(bunker).toBeLessThan(water);
  });
  it('relative cost 0…1 around the pin', () => {
    const pts = missMap(hole, pin, null);
    expect(Math.min(...pts.map((p) => p.cost))).toBe(0);
    expect(Math.max(...pts.map((p) => p.cost))).toBe(1);
    const worst = pts.reduce((a, b) => (b.cost > a.cost ? b : a));
    expect(pointInWater(worst.pos)).toBe(true);
    function pointInWater(p: LngLat) {
      return Math.abs(p[0] - at(25, 150)[0]) < 9 * M * 1.6 && Math.abs(p[1] - at(25, 150)[1]) < 9 * M;
    }
  });
});

import { readGreen } from './caddie';
describe('green reading', () => {
  it('slope falling away from the player = downhill putt; falling to the right = breaks right', () => {
    expect(readGreen({ pct: 2.5, downDeg: 0 }, 0)).toEqual({ level: 'moderate', text: 'downhill putt' });
    expect(readGreen({ pct: 2.5, downDeg: 180 }, 0).text).toBe('uphill putt');
    expect(readGreen({ pct: 1.5, downDeg: 90 }, 0)).toEqual({ level: 'gentle', text: 'breaks right' });
    expect(readGreen({ pct: 0.5, downDeg: 90 }, 0).level).toBe('flat');
  });
});

import { approachPlan, teePlan } from './holeplan';
describe('hole plan in words', () => {
  const M = 1 / 111195;
  const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
  const sq = (cx: number, cy: number, r: number): Ring => [at(cx - r, cy - r), at(cx + r, cy - r), at(cx + r, cy + r), at(cx - r, cy + r), at(cx - r, cy - r)];
  // Par 3 to the north: water right of the green, bunker long, open front.
  const par3: HoleMapData = { line: [at(0, 0), at(0, 150)], tee: at(0, 0), green: sq(0, 150, 12), greenCenter: at(0, 150), bunkers: [sq(0, 170, 6)], water: [sq(24, 150, 9)], fairways: [], tees: [] };
  it('par 3 with water right and bunker long: miss short, avoid right and long', () => {
    const p = approachPlan(par3, at(0, 0), at(0, 150));
    expect(p.best).toBe('short');
    expect(p.avoid.map((a) => a.side)).toEqual(['right', 'long']);
    expect(p.text).toBe('Best miss: short. Avoid right (water), long (bunker).');
  });
  it('tee shot: water right of the landing zone → favour the left', () => {
    const par4: HoleMapData = { ...par3, line: [at(0, 0), at(0, 380)], greenCenter: at(0, 380), green: sq(0, 380, 12), bunkers: [], water: [sq(20, 220, 8)] };
    expect(teePlan(par4, 220)).toBe('Favour the left side – right: water.');
    expect(teePlan({ ...par4, water: [] }, 220)).toBe('Landing zone is open on both sides.');
  });
});

import { adviseClubMax, lieEffect, scoreStrategy } from './caddie';
import { forecastNote } from './weather';
import { fairwayWidth } from './holeplan';

describe('caddie extras (019)', () => {
  it('lie: deep rough caps the club, downhill plays shorter and aims left', () => {
    expect(adviseClubMax(170, DEFAULT_CARRY, false, lieEffect('heavyRough')!.maxClub).club).toBe('7i');
    expect(lieEffect('downhill')!.factor).toBeLessThan(1);
    expect(lieEffect('downhill')!.aimM).toBeLessThan(0);
    expect(lieEffect('normal')).toBeNull();
  });
  it('stableford: strokes received and pick up', () => {
    expect(scoreStrategy({ par: 4, received: 1, shotsSoFar: 0 })).toBe('You get 1 stroke here – a 5 still scores 2 points, no need to force it');
    expect(scoreStrategy({ par: 4, received: 1, shotsSoFar: 6 })).toBe('No Stableford point left on this hole – pick up and keep the pace');
    expect(scoreStrategy({ par: 4, received: 1, shotsSoFar: 5 })).toBeNull();
    expect(scoreStrategy({ par: 4, received: 0, shotsSoFar: 0 })).toBeNull();
    expect(scoreStrategy({ par: 4, received: 1, shotsSoFar: null })).toBeNull();
  });
  it('forecast: rain and wind coming', () => {
    const f = { hours: [{ time: '2026-10-11T14:00', rainPct: 10, gustKmh: 20 }, { time: '2026-10-11T15:00', rainPct: 70, gustKmh: 38 }] };
    expect(forecastNote(f, 20)).toBe('Coming up: rain likely from 15:00, gusts up to 38 km/h around 15:00');
    expect(forecastNote({ hours: [] }, 20)).toBeNull();
  });
  it('fairway width at the landing zone', () => {
    const M = 1 / 111320;
    const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
    const fw: Ring = [at(-12, 100), at(16, 100), at(16, 300), at(-12, 300), at(-12, 100)];
    const d: HoleMapData = { line: [at(0, 0), at(0, 380)], tee: at(0, 0), green: null, greenCenter: at(0, 380), bunkers: [], water: [], fairways: [fw], tees: [] };
    expect(fairwayWidth(d, 200)).toBeGreaterThanOrEqual(27);
    expect(fairwayWidth(d, 200)).toBeLessThanOrEqual(29);
    expect(fairwayWidth(d, 50)).toBeNull();
  });
});
