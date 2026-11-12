import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { distToLine, holeMapData, lineLength, pointAt, shotHole } from './geo';

// Sascha 12.11.2026: Erik's Apple Watch – 45 "shots" on hole 5, the swings of the holes after it piled on it while his
// phone stayed there. A swing far off the hole it came with, inside another hole's corridor, goes to that hole.
describe('the hole of a swing the watch felt', () => {
  const geo = SEED_GEOMETRY['osm:relation/1326323'];
  const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => holeMapData(geo, 'A', n));
  const mid = (k: number) => pointAt(holes[k]!.line, lineLength(holes[k]!.line) / 2);
  it('on the hole it came with: that hole', () => {
    expect(shotHole(mid(4), holes, 4)).toBe(4);
    expect(shotHole(holes[4]!.tee, holes, 4)).toBe(4);
  });
  it('the watch still on 2, the swing in the middle of 8: hole 8 – also beyond the next three holes', () => {
    const k = 7;
    expect(distToLine(mid(k), holes[1]!.line)).toBeGreaterThan(120);
    expect(shotHole(mid(k), holes, 1)).toBe(k);
  });
  it('off every hole (the car park): the hole it came with', () => {
    const far = [holes[0]!.tee[0] + 0.02, holes[0]!.tee[1] + 0.02] as [number, number];
    expect(shotHole(far, holes, 3)).toBe(3);
  });
});
