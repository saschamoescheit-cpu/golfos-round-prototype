import { describe, expect, it } from 'vitest';
import { handicapIndex, playedHandicap, scoreDifferential } from './handicap';
import { emptyEntry } from './scoring';
import type { Round, RoundHole } from '../types';

const holes18: RoundHole[] = Array.from({ length: 18 }, (_, i) => ({
  index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 4, strokeIndex: i + 1,
}));
const round = (strokes: number[], extra: Partial<Round> = {}): Round => ({
  id: 'r', createdAt: '2026-10-13T10:00:00Z', finishedAt: '2026-10-13T14:30:00Z', courseId: 'osm:way/28625559', courseName: 'Son Antem West',
  loopOrder: ['Main'], holes: holes18, mode: 'quick', currentHole: 17, tee: 'Yellow',
  players: [{ id: 'me', name: 'Sascha', playingHandicap: 7, isMe: true }],
  entries: { me: strokes.map((s) => ({ ...emptyEntry(), strokes: s })) },
  ...extra,
});

describe('played handicap (WHS score differential)', () => {
  it('113 / slope × (adjusted gross − course rating)', () => {
    expect(scoreDifferential(90, { cr: 72.2, slope: 136 })).toBe(14.8);
    expect(scoreDifferential(70, { cr: 72.2, slope: 136 })).toBe(-1.8);
  });
  it('uses the bundled rating of the tee: 18 × 5 on Son Antem West yellow (71.8 / 134) = 15.3', () => {
    const p = playedHandicap(round(Array(18).fill(5)))!;
    expect(p.adjustedGross).toBe(90);
    expect(p.rating).toEqual({ cr: 71.8, slope: 134 });
    expect(p.differential).toBe(15.3);
  });
  it('caps every hole at net double bogey: 10 on stroke index 1 counts 7, 9 on stroke index 18 counts 6', () => {
    const s = Array(18).fill(5);
    s[0] = 10; // stroke index 1, one handicap stroke → 4 + 2 + 1
    s[17] = 9; // stroke index 18, no stroke → 4 + 2
    expect(playedHandicap(round(s))!.adjustedGross).toBe(16 * 5 + 7 + 6);
  });
  it('a rating the player entered wins over the bundled one', () => {
    expect(playedHandicap(round(Array(18).fill(5), { rating: { cr: 72.2, slope: 136 } }))!.differential).toBe(14.8); // 113 / 136 × 17.8
  });
  it('none for 9 holes, a missing score or a course without rating', () => {
    expect(playedHandicap(round(Array(9).fill(5), { holes: holes18.slice(0, 9) }))).toBeNull();
    const s: (number | null)[] = Array(18).fill(5);
    s[4] = null;
    expect(playedHandicap(round(s as number[]))).toBeNull();
    expect(playedHandicap(round(Array(18).fill(5), { courseId: 'osm:way/1' }))).toBeNull();
  });
});

describe('handicap index (WHS table)', () => {
  it('needs 3 rounds; 3 rounds = best − 2, 4 = best − 1, 5 = best', () => {
    expect(handicapIndex([10, 12])).toBeNull();
    expect(handicapIndex([12, 10, 15])!.index).toBe(8);
    expect(handicapIndex([12, 10, 15, 11])!.index).toBe(9);
    expect(handicapIndex([12, 10, 15, 11, 13])!.index).toBe(10);
  });
  it('6 rounds = average of best 2 − 1; 20 rounds = average of best 8; only the newest 20 count', () => {
    expect(handicapIndex([12, 10, 15, 11, 13, 14])!.index).toBe(9.5);
    const twenty = Array.from({ length: 20 }, (_, i) => 10 + i); // best 8: 10 … 17
    expect(handicapIndex(twenty)).toEqual({ index: 13.5, used: 8, of: 20 });
    expect(handicapIndex([...twenty, 0, 0])!.index).toBe(13.5);
  });
});
