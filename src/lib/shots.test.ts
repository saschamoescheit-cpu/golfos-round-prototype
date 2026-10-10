import { describe, expect, it } from 'vitest';
import { deriveFromShots, emptyDetail, firstPuttM, lieAt, shotLengths, suggestClub } from './shots';
import type { HoleMapData } from './geo';
import type { DetailEntry, LngLat, Ring } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number, lat = 48.78): LngLat => [9.69 + (east * M) / Math.cos((lat * Math.PI) / 180), lat + north * M];
const sq = (cx: number, cy: number, r: number): Ring => [at(cx - r, cy - r), at(cx + r, cy - r), at(cx + r, cy + r), at(cx - r, cy + r), at(cx - r, cy - r)];
// Straight par 4 to the north, 360 m; green 30 × 30 m; greenside bunker left of the green; fairway 40 m wide.
const hole: HoleMapData = {
  line: [at(0, 0), at(0, 360)], tee: at(0, 0), green: sq(0, 360, 15), greenCenter: at(0, 360),
  bunkers: [sq(-25, 355, 6)], water: [], fairways: [[at(-20, 150), at(20, 150), at(20, 330), at(-20, 330), at(-20, 150)]], tees: [],
};
const shot = (east: number, north: number, lie: DetailEntry['shots'][0]['lie'], penalty = false) => ({ pos: at(east, north), lie, club: null, penalty });

describe('detailed tracking', () => {
  it('suggests the lie from the course map', () => {
    expect(lieAt(at(0, 0), hole, true)).toBe('tee');
    expect(lieAt(at(5, 220), hole, false)).toBe('fairway');
    expect(lieAt(at(35, 220), hole, false)).toBe('rough');
    expect(lieAt(at(-25, 355), hole, false)).toBe('bunker');
  });
  it('suggests driver off the tee and a club for the remaining distance', () => {
    expect(suggestClub(4, true, 360)).toBe('Dr');
    expect(suggestClub(4, false, 128)).toBe('7i');
    expect(suggestClub(3, true, 152)).toBe('5i');
  });
  it('par: drive in the fairway, approach on the green, two putts', () => {
    const d: DetailEntry = { ...emptyDetail(), shots: [shot(0, 0, 'tee'), shot(4, 230, 'fairway')], onGreen: at(2, 352), pin: at(0, 360) };
    const v = deriveFromShots(d, 2, 4, hole);
    expect(v.strokes).toBe(4);
    expect(v.fairway).toBe('hit');
    expect(v.penalties).toBe(0);
    expect(v.greensideBunker).toBe(false);
    expect(shotLengths(d).map((m) => Math.round(m!))).toEqual([230, 122]);
    expect(Math.round(firstPuttM(d)!)).toBe(8);
  });
  it('missed fairway right, water penalty, sand save from the greenside bunker', () => {
    const d: DetailEntry = {
      ...emptyDetail(),
      shots: [shot(0, 0, 'tee'), shot(30, 210, 'rough', true), shot(-25, 355, 'bunker')],
      onGreen: at(-5, 358), pin: at(0, 360),
    };
    const v = deriveFromShots(d, 1, 4, hole);
    expect(v.fairway).toBe('right');
    expect(v.penalties).toBe(1);
    expect(v.strokes).toBe(5); // 3 shots + 1 penalty + 1 putt
    expect(v.greensideBunker).toBe(true);
    expect(v.upAndDown).toBe(true);
  });
  it('chip-in: holed from off the green, no putts', () => {
    const d: DetailEntry = { ...emptyDetail(), shots: [shot(0, 0, 'tee'), shot(-30, 250, 'rough'), shot(10, 340, 'rough')], holedOut: true };
    const v = deriveFromShots(d, null, 4, hole);
    expect(v.strokes).toBe(3);
    expect(v.putts).toBe(0);
    expect(v.fairway).toBe('left');
  });
  it('unfinished hole leaves the strokes open', () => {
    const d: DetailEntry = { ...emptyDetail(), shots: [shot(0, 0, 'tee')] };
    expect(deriveFromShots(d, null, 4, hole).strokes).toBeUndefined();
  });
});
