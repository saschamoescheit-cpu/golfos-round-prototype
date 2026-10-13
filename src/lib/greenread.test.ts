import { describe, expect, it } from 'vitest';
import { bestLeave, heightAt, readPutt, type GreenGrid } from './greenread';
import type { LngLat } from '../types';

// A 30 × 30 m test green north up; heights from a plane: sx = % rising to the east, sy = % rising to the north.
const M = 1 / 111320;
const LAT = 39.6;
const at = (east: number, north: number): LngLat => [2.6 + (east * M) / Math.cos((LAT * Math.PI) / 180), LAT + north * M];
function plane(sx: number, sy: number): GreenGrid {
  const size = 30;
  const cm: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const east = c + 0.5;
      const north = size - r - 0.5;
      cm.push(Math.round(100 + east * sx + north * sy)); // sx % = sx cm per m
    }
  }
  return { corners: [at(0, 30), at(30, 30), at(30, 0), at(0, 0)], size, base: 50, cm };
}

/** The same plane on a 0.5 m grid (Hetzenhof heights from the 25 cm terrain model). */
function planeHalf(sx: number, sy: number): GreenGrid {
  const size = 60;
  const cm: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const east = (c + 0.5) / 2;
      const north = (size - r - 0.5) / 2;
      cm.push(Math.round(100 + east * sx + north * sy));
    }
  }
  return { corners: [at(0, 30), at(30, 30), at(30, 0), at(0, 0)], size, cell: 0.5, base: 50, cm };
}

describe('green read (024)', () => {
  it('a 0.5 m grid reads the same green the same way', () => {
    const a = readPutt(plane(2, 1), at(8, 6), at(20, 18))!;
    const b = readPutt(planeHalf(2, 1), at(8, 6), at(20, 18))!;
    expect(Math.abs(a.aimCm - b.aimCm)).toBeLessThan(6);
    expect(Math.abs(a.rise - b.rise)).toBeLessThan(0.02);
    expect(heightAt(planeHalf(2, 0), at(10, 15))).toBeCloseTo(51 + 0.2, 1);
  });
  it('heights from the grid', () => {
    expect(heightAt(plane(2, 0), at(10, 15))).toBeCloseTo(51 + 0.2, 1);
  });
  it('flat green: straight at the hole', () => {
    const p = readPutt(plane(0, 0), at(15, 5), at(15, 13))!;
    expect(Math.abs(p.aimCm)).toBeLessThan(5);
    expect(p.text).toBe('Putt 8.0 m, flat – straight at the hole');
  });
  it('green rising to the east, putt to the north: ball breaks left, aim right', () => {
    const p = readPutt(plane(2, 0), at(15, 5), at(15, 8))!;
    expect(p.aimCm).toBeGreaterThan(5); // 3 m, 2 % side slope, Stimp 10: about 10–25 cm
    expect(p.aimCm).toBeLessThan(40);
  });
  it('uphill putt is said so', () => {
    const p = readPutt(plane(0, 3), at(15, 5), at(15, 11))!;
    expect(p.rise).toBeCloseTo(0.18, 1);
    expect(p.text).toMatch(/18 cm uphill/);
  });
  it('best leave: below the hole on a sloping green', () => {
    // green rising to the north, player comes from the south: short of the pin = uphill putt
    const b = bestLeave(plane(0, 3), at(15, 15), at(15, -120), null)!;
    expect(b.text).toBe('Best leave: short of the pin – uphill putt');
  });
});
