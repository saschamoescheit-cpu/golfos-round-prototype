import { describe, expect, it } from 'vitest';
import { puttStats } from './puttstats';
import type { LngLat, Round } from '../types';

// the putter as a club (Sascha 24.10.2026): holed by distance, putts by the first putt's length, where the 3-putts start
const pin: LngLat = [9.689, 48.781];
const off = (m: number): LngLat => [pin[0], pin[1] - m / 111320];
const round = (holes: { first: number; putts: number; balls?: number[] }[]): Round =>
  ({
    id: 'r',
    players: [{ id: 'me', isMe: true }],
    holes: holes.map((_, i) => ({ label: String(i + 1), par: 4 })),
    entries: {
      me: holes.map((h) => ({
        strokes: 4,
        putts: h.putts,
        detail: { shots: [], onGreen: off(h.first), pin, holedOut: true },
        ...(h.balls ? { puttsAt: { pin, balls: h.balls.map(off) } } : {}),
      })),
    },
  }) as unknown as Round;

describe('the putter', () => {
  it('holed by distance – every placed putt counts, the last one went in', () => {
    const s = puttStats([round([{ first: 1.5, putts: 1 }, { first: 1.2, putts: 2, balls: [1.2, 0.4] }, { first: 6, putts: 2, balls: [6, 0.8] }])]);
    const b = (label: string) => s.bands.find((x) => x.label === label)!;
    expect(b('1–2 m')).toMatchObject({ tried: 2, holed: 1, holes: 2, one: 1, two: 1 });
    expect(b('0–1 m')).toMatchObject({ tried: 2, holed: 2 });
    expect(b('5–8 m')).toMatchObject({ tried: 1, holed: 0, holes: 1, two: 1 });
    expect(s.holes).toBe(3);
  });
  it('where the 3-putts start and how far half of the putts go in', () => {
    const s = puttStats([round([{ first: 9.4, putts: 3 }, { first: 14, putts: 3 }, { first: 10, putts: 2 }, { first: 0.5, putts: 1 }, { first: 0.8, putts: 1 }, { first: 0.6, putts: 1 }])]);
    expect(s.threeFrom).toEqual({ m: 8, of: 3, n: 2 }); // the first 3-putt in 8–12 m; from 8 m on 2 of 3 holes
    expect(s.halfIn?.label).toBe('0–1 m');
  });
  it('nothing placed: no numbers', () => {
    const s = puttStats([]);
    expect(s.holes).toBe(0);
    expect(s.halfIn).toBeNull();
    expect(s.threeFrom).toBeNull();
  });
});

describe('one odd short 3-putt', () => {
  it('does not set where the 3-putts start', () => {
    const holes = [{ first: 0.7, putts: 3 }, ...Array.from({ length: 12 }, (_, k) => ({ first: 1.5 + k, putts: 2 })), { first: 9, putts: 3 }, { first: 11, putts: 3 }];
    expect(puttStats([round(holes)]).threeFrom?.m).toBe(8);
  });
});
