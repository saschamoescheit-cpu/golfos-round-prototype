import { describe, expect, it } from 'vitest';
import { clubDispersion, sideOf } from './dispersion';
import { emptyEntry } from './scoring';
import type { LngLat, Round } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];

describe('dispersion per club', () => {
  it('side of the line: right positive, left negative', () => {
    expect(Math.round(sideOf(at(0, 0), at(0, 100), at(10, 50)))).toBe(10);
    expect(Math.round(sideOf(at(0, 0), at(0, 100), at(-6, 80)))).toBe(-6);
  });
  it('7-iron that goes right and a little short on average', () => {
    // Par 4s: 2nd shot with 7i from 150 m, landing 6/8/10 m right and 5 m short of the pin.
    const holes = [0, 1, 2].map((k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
    const entries = [6, 8, 10].map((right) => ({
      ...emptyEntry(),
      detail: {
        shots: [
          { pos: at(0, 0), lie: 'tee' as const, club: 'Dr' as const, penalty: false },
          { pos: at(0, 210), lie: 'fairway' as const, club: '7i' as const, penalty: false },
        ],
        onGreen: at(right, 355),
        pin: at(0, 360),
        holedOut: false,
      },
      putts: 2,
    }));
    const round = { id: 'r', createdAt: '', finishedAt: 'x', courseId: 'c', courseName: 'C', loopOrder: ['Main'], holes, mode: 'detail' as const, players: [{ id: 'me', name: 'Me', playingHandicap: 10, isMe: true }], entries: { me: entries }, currentHole: 2 } as Round;
    const d = clubDispersion([round]);
    expect(d.map((x) => x.club)).toEqual(['7i']); // the drives on par 4 do not count
    expect(d[0]).toMatchObject({ shots: 3, sideMean: 8, lengthMean: -5 });
    expect(d[0].sideSd).toBe(2);
  });
});
