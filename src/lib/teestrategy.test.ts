import { describe, expect, it } from 'vitest';
import { teeStrategy } from './teestrategy';
import type { HoleMapData } from './geo';
import type { LngLat, Ring } from '../types';
import { DEFAULT_CARRY } from './caddie';

// A straight par 4 to the north, 380 m: positions in metres east/north of the tee.
const LAT = 48.78;
const at = (east: number, north: number): LngLat => [9.69 + east / (111320 * Math.cos((LAT * Math.PI) / 180)), LAT + north / 111320];
const rect = (w: number, s: number, e: number, n: number): Ring => [at(w, s), at(e, s), at(e, n), at(w, n), at(w, s)];
function hole(o: { fairwayHalf?: number; water?: Ring[]; length?: number } = {}): HoleMapData {
  const h = o.fairwayHalf ?? 20;
  const L = o.length ?? 380;
  return {
    line: [at(0, 0), at(0, L)],
    tee: at(0, 0),
    green: rect(-12, L - 12, 12, L + 12),
    greenCenter: at(0, L),
    bunkers: [],
    water: o.water ?? [],
    fairways: [rect(-h, 120, h, L - 20)],
    tees: [],
  };
}

describe('tee strategy (017)', () => {
  it('wide open hole: driver, no extra sentence', () => {
    const s = teeStrategy({ data: hole({ fairwayHalf: 40 }), par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null })!;
    expect(s.club).toBe('Dr');
    expect(s.side).toBe(0);
    expect(s.text).toBeNull();
  });
  it('water across the fairway in driver range: a shorter club, said why', () => {
    const s = teeStrategy({ data: hole({ water: [rect(-60, 192, 60, 232)] }), par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null })!;
    expect(s.club).not.toBe('Dr');
    expect(s.saved).toBeGreaterThanOrEqual(0.1);
    expect(s.text).toMatch(/instead of|statt/);
    expect(s.text).toMatch(/water|Wasser/);
  });
  it('out of bounds close on the right: aim to the left side, never towards it', () => {
    const boundary = [rect(-150, -50, 24, 450)]; // the course ends 24 m right of the line
    const s = teeStrategy({ data: hole(), par: 4, bag: DEFAULT_CARRY, playing: 14, conditions: null, boundary })!;
    expect(s.side).toBeLessThan(0);
    expect(s.text).toMatch(/left|linke/);
  });
  // Sascha 28.10.2026: "is the favourite distance from my bag taken into account?" – on a short par 4 the club that
  // leaves it, said so; a long par 4 where no club leaves it stays as it was
  it('short par 4: the club that leaves the favourite distance, said so', () => {
    // the driver would leave a half wedge of 45 m
    const dr = DEFAULT_CARRY.find((b) => b.club === 'Dr')!.carry;
    const L = dr + 45;
    const short = hole({ fairwayHalf: 30, length: L });
    const plain = teeStrategy({ data: short, par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null })!;
    expect(plain.club).toBe('Dr');
    const s = teeStrategy({ data: short, par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null, favourite: 90 })!;
    const carry = DEFAULT_CARRY.find((b) => b.club === s.club)!.carry;
    expect(Math.abs(L - carry - 90)).toBeLessThanOrEqual(12);
    expect(s.club).not.toBe('Dr');
    expect(s.side).toBe(0);
    expect(s.text).toMatch(/favourite distance|Lieblingsdistanz/);
    // a favourite distance the driver leaves already: the driver, no sentence about it
    const own = teeStrategy({ data: short, par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null, favourite: 45 })!;
    expect(own.club).toBe('Dr');
    expect(own.text ?? '').not.toMatch(/Lieblingsdistanz|favourite/);
  });
  it('long par 4: no club leaves the favourite distance – the plan as before', () => {
    const a = teeStrategy({ data: hole({ fairwayHalf: 40 }), par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null })!;
    const b = teeStrategy({ data: hole({ fairwayHalf: 40 }), par: 4, bag: DEFAULT_CARRY, playing: 10, conditions: null, favourite: 90 })!;
    expect(b.club).toBe(a.club);
    expect(b.text).toBe(a.text);
  });
  it('par 5: the favourite distance is for the second shot, not the tee', () => {
    const p5 = hole({ fairwayHalf: 40, length: 480 });
    const a = teeStrategy({ data: p5, par: 5, bag: DEFAULT_CARRY, playing: 10, conditions: null })!;
    const b = teeStrategy({ data: p5, par: 5, bag: DEFAULT_CARRY, playing: 10, conditions: null, favourite: 90 })!;
    expect(b).toEqual(a);
  });
  it('par 3: no tee strategy', () => {
    expect(teeStrategy({ data: hole(), par: 3, bag: DEFAULT_CARRY, playing: 10, conditions: null })).toBeNull();
  });
});
