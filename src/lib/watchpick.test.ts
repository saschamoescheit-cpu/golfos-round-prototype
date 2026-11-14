import { describe, expect, it } from 'vitest';
import { pickWatchShots } from './watch';
import type { LngLat } from '../types';

// Sascha 14.11.2026, Erik on the Reserve, hole 6: 47 shots from the watch for a 5 (2 putts) – practice swings, the waggle,
// the arm while waiting, the watch's GPS wandering a few metres. A par 4 northwards: the tee, the second from 190 m out,
// a chip from 15 m short of the green.
const at = (north: number, east = 0): LngLat => [-81.6 + east / 98000, 28.37 + north / 111000];
let t = 0;
const swing = (north: number, east: number, hit = false, watch = true) => ({ hole: 5, pos: at(north, east), t: (t += 20000), acc: 8, ...(watch ? { watch: `w${t}` } : {}), ...(hit ? { hit: true } : {}) });
const hole6 = () => {
  t = 0;
  return [
    swing(0, 0), swing(1, 1), swing(2, 0, true), // the tee: two practice swings, the drive
    ...Array.from({ length: 18 }, (_, k) => swing(190 + (k % 5) * 3, (k % 3) * 4, k === 12)), // waiting at the drive's ball, the second shot
    ...Array.from({ length: 22 }, (_, k) => swing(305 + (k % 4) * 4, (k % 2) * 6, k === 20)), // around the green: waiting, the chip
    swing(330, 0), swing(331, 1), // the putts (on the green – the review takes them as the putts' start)
  ];
};

describe('the watch\'s swings – candidates, not shots', () => {
  it('Erik\'s hole 6: 45 swings off the green become the three shots that felt the ball', () => {
    const off = hole6().slice(0, 43);
    const picked = pickWatchShots(off, null);
    expect(picked).toHaveLength(3);
    expect(picked.every((x) => x.hit)).toBe(true);
  });
  it('never more than the score leaves: 5 strokes, 2 putts → 3 shots, even when the places are apart', () => {
    t = 0;
    const apart = [swing(0, 0, true), swing(60, 0), swing(120, 0), swing(190, 0, true), swing(250, 0), swing(305, 0, true)];
    const picked = pickWatchShots(apart, 3);
    expect(picked.map((x) => Math.round((x.pos[1] - 28.37) * 111000))).toEqual([0, 190, 305]);
  });
  it('a place tapped by hand always stays – the watch\'s go first', () => {
    t = 0;
    const list = [swing(0, 0, true), swing(150, 0, false, false), swing(152, 2), swing(240, 0)];
    const picked = pickWatchShots(list, 2);
    expect(picked.some((x) => !x.watch)).toBe(true);
    expect(picked).toHaveLength(2);
  });
});
