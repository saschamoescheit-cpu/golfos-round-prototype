import { describe, expect, it } from 'vitest';
import { teeStrategy } from './teestrategy';
import type { HoleMapData } from './geo';
import type { LngLat, Ring } from '../types';
import { DEFAULT_CARRY } from './caddie';

// A straight par 4 to the north, 380 m: positions in metres east/north of the tee.
const LAT = 48.78;
const at = (east: number, north: number): LngLat => [9.69 + east / (111320 * Math.cos((LAT * Math.PI) / 180)), LAT + north / 111320];
const rect = (w: number, s: number, e: number, n: number): Ring => [at(w, s), at(e, s), at(e, n), at(w, n), at(w, s)];
function hole(o: { fairwayHalf?: number; water?: Ring[] } = {}): HoleMapData {
  const h = o.fairwayHalf ?? 20;
  return {
    line: [at(0, 0), at(0, 380)],
    tee: at(0, 0),
    green: rect(-12, 368, 12, 392),
    greenCenter: at(0, 380),
    bunkers: [],
    water: o.water ?? [],
    fairways: [rect(-h, 120, h, 360)],
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
  it('par 3: no tee strategy', () => {
    expect(teeStrategy({ data: hole(), par: 3, bag: DEFAULT_CARRY, playing: 10, conditions: null })).toBeNull();
  });
});
