import { describe, expect, it } from 'vitest';
import { emptyEntry, greenInRegulation, handicapStrokes, playerTotals, stablefordPoints } from './scoring';
import { buildRoundHoles, loopOptions, parseHoleRef, parseStrokeIndex } from './loops';
import type { CourseHole, RoundHole } from '../types';

const holes18: RoundHole[] = Array.from({ length: 18 }, (_, i) => ({
  index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 4, strokeIndex: i + 1,
}));

describe('handicapStrokes', () => {
  it('handicap 15 on 18 holes: stroke index 1–15 get one stroke', () => {
    const s = handicapStrokes(holes18, 15);
    expect(s.filter((x) => x === 1)).toHaveLength(15);
    expect(s[15]).toBe(0);
  });
  it('handicap 20: all holes one, index 1 and 2 a second', () => {
    const s = handicapStrokes(holes18, 20);
    expect(s[0]).toBe(2);
    expect(s[1]).toBe(2);
    expect(s[2]).toBe(1);
    expect(s.reduce((a, b) => a + b, 0)).toBe(20);
  });
  it('plus handicap +2: gives a stroke back on stroke index 18 and 17', () => {
    const s = handicapStrokes(holes18, -2);
    expect(s[17]).toBe(-1);
    expect(s[16]).toBe(-1);
    expect(s.reduce((a, b) => a + b, 0)).toBe(-2);
    // par on the easiest hole is only 1 point for a +2 player
    expect(stablefordPoints({ ...emptyEntry(), strokes: 4 }, 4, s[17])).toBe(1);
  });
  it('no handicap: zero strokes', () => {
    expect(handicapStrokes(holes18, null).every((x) => x === 0)).toBe(true);
  });
});

describe('stableford', () => {
  it('net par = 2 points, bogey with stroke = 2, double over net = 0', () => {
    expect(stablefordPoints({ ...emptyEntry(), strokes: 5 }, 4, 1)).toBe(2);
    expect(stablefordPoints({ ...emptyEntry(), strokes: 4 }, 4, 0)).toBe(2);
    expect(stablefordPoints({ ...emptyEntry(), strokes: 3 }, 4, 0)).toBe(3);
    expect(stablefordPoints({ ...emptyEntry(), strokes: 8 }, 4, 1)).toBe(0);
  });
  it('picked up: 0 points, gross = net double bogey', () => {
    const entries = holes18.map(() => emptyEntry());
    entries[0] = { ...entries[0], pickedUp: true };
    const t = playerTotals(holes18, entries, 18);
    expect(t.gross).toBe(4 + 2 + 1);
    expect(t.stableford).toBe(0);
  });
});

describe('GIR', () => {
  it('par 4: 4 strokes 2 putts is GIR, 5 strokes 2 putts is not', () => {
    expect(greenInRegulation({ ...emptyEntry(), strokes: 4, putts: 2 }, 4)).toBe(true);
    expect(greenInRegulation({ ...emptyEntry(), strokes: 5, putts: 2 }, 4)).toBe(false);
  });
});

describe('loops (Hetzenhof style data)', () => {
  it('parses hole refs', () => {
    expect(parseHoleRef('4A')).toEqual({ loop: 'A', number: 4 });
    expect(parseHoleRef('12')).toEqual({ loop: 'Main', number: 12 });
    expect(parseHoleRef('Kurzplatz - Loch 3')).toEqual({ loop: 'Kurzplatz', number: 3 });
    expect(parseHoleRef('15 (Old Course)')).toEqual({ loop: 'Old Course', number: 15 });
    expect(parseHoleRef('9/18 - Blindes Loch')).toEqual({ loop: 'Main', number: 9 });
    expect(parseHoleRef('Bahn 1/10 - Terrassenschreck')).toEqual({ loop: 'Main', number: 1 });
    expect(parseHoleRef('8 – Academy Course')).toEqual({ loop: 'Academy Course', number: 8 });
  });
  it('parses "11/12" stroke index', () => {
    expect(parseStrokeIndex('11/12')).toEqual([11, 12]);
    expect(parseStrokeIndex('7')).toEqual([7]);
  });
  it('A+B: first nine lower index, second nine higher', () => {
    const mk = (loop: string, n: number, si: number[]): CourseHole => ({ ref: `${n}${loop}`, loop, number: n, par: 4, strokeIndex: si });
    const holes = [
      ...Array.from({ length: 9 }, (_, i) => mk('A', i + 1, [2 * i + 1, 2 * i + 2])),
      ...Array.from({ length: 9 }, (_, i) => mk('B', i + 1, [2 * i + 1, 2 * i + 2])),
    ];
    const opt = loopOptions(holes).find((o) => o.id === 'A+B')!;
    const round = buildRoundHoles(holes, opt);
    expect(round).toHaveLength(18);
    expect(round[0].strokeIndex).toBe(1);
    expect(round[9].strokeIndex).toBe(2);
    expect(round[9].label).toBe('1B');
  });
});

import { playing18 } from './scoring';
describe('18-hole playing handicap', () => {
  it('a 9-hole round carries the 9-hole value: doubled for the caddie and the comparison group', () => {
    expect(playing18(9, 4)).toBe(8);
    expect(playing18(18, 8)).toBe(8);
    expect(playing18(9, null)).toBeNull();
    expect(playing18(6, -1)).toBe(-2); // short course, plus handicap
  });
});

describe('hole refs with the word (night check 22.10.2026)', () => {
  it('"Loch 3", "Hole 12", "Bahn Nr. 4", "Loch 3A" – the main loop or the letter, never a loop "Loch"', async () => {
    const { parseHoleRef } = await import('./loops');
    expect(parseHoleRef('Loch 3')).toEqual({ loop: 'Main', number: 3 });
    expect(parseHoleRef('Hole 12')).toEqual({ loop: 'Main', number: 12 });
    expect(parseHoleRef('Bahn Nr. 4')).toEqual({ loop: 'Main', number: 4 });
    expect(parseHoleRef('Loch 3A')).toEqual({ loop: 'A', number: 3 });
    expect(parseHoleRef('Kurzplatz - Loch 3')).toEqual({ loop: 'Kurzplatz', number: 3 });
  });
});
