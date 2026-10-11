import { describe, expect, it } from 'vitest';
import { aimPoint, blocked } from './aimpoint';
import { DEFAULT_CARRY } from './caddie';
import { distanceM, type HoleMapData } from './geo';
import type { LngLat, Ring } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
const sq = (cx: number, cy: number, w: number, h: number): Ring => [at(cx - w, cy - h), at(cx + w, cy - h), at(cx + w, cy + h), at(cx - w, cy + h), at(cx - w, cy - h)];
// Straight par 4 to the north, 380 m.
const hole: HoleMapData = { line: [at(0, 0), at(0, 380)], tee: at(0, 0), green: sq(0, 380, 12, 12), greenCenter: at(0, 380), bunkers: [], water: [], fairways: [], tees: [] };
const base = { data: hole, pin: at(0, 380), par: 4, bag: DEFAULT_CARRY, conditions: null, tendency: new Map() };

describe('caddie aim point', () => {
  it('tee shot: landing zone at driver carry on the line', () => {
    const a = aimPoint({ ...base, from: at(0, 0), teeShot: true });
    expect(a.kind).toBe('drive');
    expect(a.club).toBe('Dr');
    expect(Math.round(a.distance)).toBe(200);
  });
  it('fairway hangs right to left: aim point moves right', () => {
    const a = aimPoint({ ...base, from: at(0, 0), teeShot: true, slopes: [[200, 4]] });
    expect(a.reasons).toContain('slope 6 m right');
    expect(a.pos[0]).toBeGreaterThan(at(5, 200)[0]);
  });
  it('second shot in reach: the pin', () => {
    const a = aimPoint({ ...base, from: at(0, 230), teeShot: false });
    expect(a.kind).toBe('approach');
    expect(distanceM(a.pos, at(0, 380))).toBeLessThan(1);
  });
  it('trees right in front of a ball in the right rough: free line to the side', () => {
    const trees: Ring[] = [sq(25, 250, 10, 12)]; // wood 10–35 m ahead of the ball
    const from = at(25, 225);
    expect(blocked(from, at(0, 380), trees)).toBe(true);
    const a = aimPoint({ ...base, from, teeShot: false, trees });
    expect(a.kind).toBe('recovery');
    expect(blocked(from, a.pos, trees)).toBe(false);
    expect(a.note).toMatch(/^Trees in the way – play \d+° left, \d+ m$/);
  });
  it('downhill tee shot: plays shorter by the height difference', () => {
    const slopes: [number, number, number][] = [[0, 0, 446], [100, 0, 438], [200, 0, 429], [300, 0, 428], [380, 0, 427]];
    const a = aimPoint({ ...base, from: at(0, 0), teeShot: true, slopes });
    expect(Math.round(a.pl.height)).toBe(-17);
  });
  it('hole notes: out of bounds right – never aim right, note shown; safe style clubs down', () => {
    const slopes: [number, number][] = [[200, 6]]; // slope would push the aim right
    const a = aimPoint({ ...base, from: at(0, 0), teeShot: true, slopes, note: { obRight: true } });
    expect(a.side).toBe(0);
    expect(a.note).toBe('Out of bounds right');
    const safe = aimPoint({ ...base, from: at(0, 0), teeShot: true, note: { obRight: true }, style: 'safe' });
    expect(safe.club).toBe('3W');
  });
  it('layup leaves the favourite distance', () => {
    const par5: HoleMapData = { ...hole, line: [at(0, 0), at(0, 520)], greenCenter: at(0, 520), green: sq(0, 520, 12, 12) };
    const a = aimPoint({ ...base, data: par5, pin: at(0, 520), par: 5, from: at(0, 250), teeShot: false, favourite: 90 });
    expect(a.kind).toBe('layup');
    expect(Math.round(distanceM(a.pos, at(0, 520)))).toBe(90);
  });
});

describe('safe landing (020)', () => {
  it('drive landing in a pond moves out of the water', () => {
    const pond = sq(0, 200, 15, 12);
    const a = aimPoint({ ...base, data: { ...hole, water: [pond] }, from: at(0, 0), teeShot: true });
    expect(a.landing).toBeDefined();
    expect(distanceM(a.landing, at(0, 200))).toBeGreaterThanOrEqual(12);
    expect(a.reasons.join(' ')).toMatch(/water/);
  });
  it('crosswind towards out of bounds: aim stays 20 m inside the boundary', () => {
    // course boundary 25 m left of the line, wind from the left pushes the aim left
    const boundary: Ring[] = [[at(-25, -20), at(80, -20), at(80, 420), at(-25, 420), at(-25, -20)]];
    const conditions = { windKmh: 25, gustKmh: 35, windFromDeg: 270, tempC: 20 };
    const a = aimPoint({ ...base, from: at(0, 0), teeShot: true, boundary, conditions });
    expect(a.pos[0]).toBeGreaterThan(at(-6, 200)[0]); // not more than 5 m left of the line
    expect(a.reasons.join(' ')).toMatch(/out of bounds/);
  });
  it('slope aim never points into a bunker', () => {
    const bunker = sq(-8, 200, 5, 6);
    const a = aimPoint({ ...base, data: { ...hole, bunkers: [bunker] }, from: at(0, 0), teeShot: true, slopes: [[200, -4]] });
    expect(distanceM(a.pos, at(-8, 200))).toBeGreaterThan(5);
  });
});
