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
