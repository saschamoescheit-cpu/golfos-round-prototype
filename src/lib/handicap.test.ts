import { describe, expect, it } from 'vitest';
import { courseHandicap, handicapIndex, parseIndex, playedHandicap, playingHandicapFor, ratingFor, scoreDifferential } from './handicap';
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

describe('course handicap (playing handicap from the index)', () => {
  it('index × slope / 113 + (CR − par), rounded – matches the RFEG table of Son Antem West yellow', () => {
    // table: playing handicap 8 for index 6.5 – 7.3, 9 for 7.4 – 8.1 (71.8 / 134, par 72)
    expect(courseHandicap(6.5, { cr: 71.8, slope: 134 }, 72)).toBe(8);
    expect(courseHandicap(7.3, { cr: 71.8, slope: 134 }, 72)).toBe(8);
    expect(courseHandicap(7.4, { cr: 71.8, slope: 134 }, 72)).toBe(9);
    expect(courseHandicap(8.1, { cr: 71.8, slope: 134 }, 72)).toBe(9);
    expect(courseHandicap(-1.0, { cr: 71.8, slope: 134 }, 72)).toBe(-1);
  });
  it('reads the index as typed', () => {
    expect(parseIndex('7,4')).toBe(7.4);
    expect(parseIndex('+1,2')).toBe(-1.2);
    expect(parseIndex('')).toBeNull();
    expect(parseIndex('abc')).toBeNull();
  });
});

// Sascha 13.11.2026: "every course must always have slope and course rating" – the women's values bundled too
describe('course rating of a tee: men and women apart (13.11.2026)', () => {
  const loops = (...l: string[]) => l.flatMap((x) => Array.from({ length: 9 }, () => ({ loop: x })));
  it('a man: the bundled men\'s values as before – per 18-hole combination, 9 holes of a loop the first with it', () => {
    expect(ratingFor('osm:relation/1326323', 'Yellow', loops('A', 'B'))).toEqual({ cr: 71.6, slope: 130, par: 71 });
    expect(ratingFor('osm:relation/1326323', 'Yellow', loops('C'))).toEqual({ cr: 72.6, slope: 132, par: 72 }); // A+C
    expect(ratingFor('osm:way/28625559', 'Red', loops('Main', 'Main'))).toEqual({ cr: 67.7, slope: 123 });
  });
  it('a woman: her own bundled values, the same way – Hetzenhof with the ladies\' par', () => {
    expect(ratingFor('osm:relation/1326323', 'Red', loops('A', 'B'), true)).toEqual({ cr: 71.3, slope: 126, par: 71 });
    expect(ratingFor('osm:relation/1326323', 'Red', loops('B'), true)).toEqual({ cr: 71.3, slope: 126, par: 71 }); // A+B
    expect(ratingFor('osm:relation/1326323', 'Yellow', loops('A', 'C'), true)).toEqual({ cr: 79.1, slope: 139, par: 76 });
    expect(ratingFor('osm:way/28625559', 'Red', loops('Main', 'Main'), true)).toEqual({ cr: 72.6, slope: 131 });
    expect(ratingFor('osm:relation/4039062', 'Green', loops('Main', 'Main'), true)).toEqual({ cr: 68.6, slope: 117 });
    // also under the course's OpenGolfAPI id
    expect(ratingFor('oga:06d2d455-f1f5-49a8-842f-ab79e127942d', 'White', loops('Main', 'Main'), true)).toEqual({ cr: 74.5, slope: 129 });
  });
  it('a woman on a tee not rated for women: never the men\'s value', () => {
    expect(ratingFor('osm:way/28625559', 'White', loops('Main', 'Main'), true)).toBeNull(); // Son Antem West: women from blue
    expect(ratingFor('osm:relation/1326323', 'White', loops('A', 'B'), true)).toBeNull();
  });
  it('her playing handicap from her values: index 20 on Son Antem West red = 20 × 131 / 113 + (72.6 − 72) = 24', () => {
    const holes = Array.from({ length: 18 }, () => ({ loop: 'Main', par: 4 }));
    expect(playingHandicapFor('osm:way/28625559', holes, 'Red', '20', true)).toBe(24);
    expect(playingHandicapFor('osm:way/28625559', holes, 'Red', '20', false)).toBe(17); // 20 × 123 / 113 − 4.3
  });
});
