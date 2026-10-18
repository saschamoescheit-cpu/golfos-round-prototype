import { describe, expect, it } from 'vitest';
import { expectedStrokes, groupForHandicap, groupSg, holeSg } from './sg';
import { suggestKind } from './shots';
import type { DetailEntry, LngLat } from '../types';

const M = 1 / 111195;
const at = (north: number): LngLat => [9.69, 48.78 + north * M];

describe('strokes gained', () => {
  it('tour baseline: 400 yd tee ≈ 3.99, 8 ft putt ≈ 1.5, 100 yd fairway ≈ 2.8', () => {
    expect(expectedStrokes(400 / 1.09361, 'tee')).toBeCloseTo(3.99, 2);
    expect(expectedStrokes(8 / 3.28084, 'green')).toBeCloseTo(1.5, 2);
    expect(expectedStrokes(100 / 1.09361, 'fairway')).toBeCloseTo(2.8, 2);
    expect(expectedStrokes(100 / 1.09361, 'rough')).toBeGreaterThan(expectedStrokes(100 / 1.09361, 'fairway'));
  });
  it('the shots of a hole add up to: expected from the tee − strokes taken', () => {
    // 366 m (400 yd) par 4: drive 251 m to the fairway, approach to 6 m, two putts = 4 strokes.
    const d: DetailEntry = { shots: [{ pos: at(0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(251), lie: 'fairway', club: '9i', penalty: false }], onGreen: at(360), pin: at(366), holedOut: false };
    const s = holeSg(d, 2, 4)!;
    expect(s.map((x) => x.category)).toEqual(['tee', 'approach', 'putting']);
    expect(s.reduce((a, x) => a + x.sg, 0)).toBeCloseTo(expectedStrokes(366, 'tee') - 4, 5);
  });
  it('par 5: the second shot from more than 180 m is "long game", the third from 90 m "approach"', () => {
    const d: DetailEntry = { shots: [{ pos: at(0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(230), lie: 'fairway', club: '3W', penalty: false }, { pos: at(410), lie: 'fairway', club: 'PW', penalty: false }], onGreen: at(495), pin: at(500), holedOut: false };
    expect(holeSg(d, 2, 5)!.map((x) => x.category)).toEqual(['tee', 'long', 'approach', 'putting']);
  });
  it('a penalty costs a full stroke more', () => {
    const base: DetailEntry = { shots: [{ pos: at(0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(220), lie: 'rough', club: '7i', penalty: false }], onGreen: at(362), pin: at(366), holedOut: false };
    const pen = { ...base, shots: [{ ...base.shots[0], penalty: true }, base.shots[1]] };
    expect(holeSg(base, 2, 4)![0].sg - holeSg(pen, 2, 4)![0].sg).toBeCloseTo(1, 5);
  });
  it('chip inside 30 yards is "around the green"; an unfinished hole has no value', () => {
    const d: DetailEntry = { shots: [{ pos: at(0), lie: 'tee', club: '7i', penalty: false }, { pos: at(130), lie: 'rough', club: 'LW', penalty: false }], onGreen: at(146), pin: at(150), holedOut: false };
    expect(holeSg(d, 1, 3)!.map((x) => x.category)).toEqual(['approach', 'around', 'putting']);
    expect(holeSg({ ...d, onGreen: null }, null, 3)).toBeNull();
    expect(holeSg({ ...d, pin: null }, 1, 3)).toBeNull(); // no flag / green centre → no value
  });
  it('comparison groups and shot types', () => {
    expect(groupSg('h10').total).toBe(-13);
    expect(groupSg('tour').approach).toBe(0);
    expect(groupForHandicap(7)).toBe('h5');
    expect(groupForHandicap(18)).toBe('h15'); // the next better group (Sascha 16.10.2026)
    expect(groupForHandicap(1)).toBe('scratch');
    expect(suggestKind('recovery', 140)).toBe('punch');
    expect(suggestKind('rough', 25)).toBe('chip');
    expect(suggestKind('fairway', 60)).toBe('pitch');
    expect(suggestKind('bunker', 15)).toBe('bunker');
    expect(suggestKind('fairway', 150)).toBe('full');
  });
});

describe('semi rough (Sascha 18.10.2026)', () => {
  it('lies between fairway and rough', () => {
    for (const m of [60, 140, 220]) {
      const s = expectedStrokes(m, 'semirough');
      expect(s).toBeGreaterThan(expectedStrokes(m, 'fairway'));
      expect(s).toBeLessThan(expectedStrokes(m, 'rough'));
    }
  });
});
