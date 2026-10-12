import { describe, expect, it } from 'vitest';
import { courseStats, personalBests, playedCourses, roundPoints, trendChange } from './history';
import { emptyEntry } from './scoring';
import type { Round, RoundHole } from '../types';

const holes18: RoundHole[] = Array.from({ length: 18 }, (_, i) => ({
  index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: i % 6 === 0 ? 3 : 4, strokeIndex: i + 1,
}));
let n = 0;
const round = (date: string, strokes: number[], extra: Partial<Round> = {}, putts = 2): Round => ({
  id: `r${n++}`, createdAt: date, finishedAt: date, courseId: 'osm:way/28625559', courseName: 'Son Antem West',
  loopOrder: ['Main'], holes: holes18, mode: 'quick', currentHole: 17, tee: 'Yellow',
  players: [{ id: 'me', name: 'Sascha', playingHandicap: 7, isMe: true }],
  entries: { me: strokes.map((s) => ({ ...emptyEntry(), strokes: s, putts })) },
  ...extra,
});
const par = holes18.map((h) => h.par); // par 69 course

describe('trend', () => {
  it('change along a straight line through the values; null below 3 values', () => {
    expect(trendChange([10, 9, 8, 7])).toEqual({ change: -3, rounds: 4 });
    expect(trendChange([10, null, 8, 7])).toEqual({ change: -3, rounds: 3 });
    expect(trendChange([10, null, 8])).toBeNull();
    expect(trendChange([10, 9])).toBeNull();
  });
  it('round points: oldest first, over par per 18, handicap played', () => {
    const a = round('2026-09-01T10:00:00Z', par.map((p) => p + 1));
    const b = round('2026-08-01T10:00:00Z', par.map((p) => p));
    const pts = roundPoints([a, b]);
    expect(pts.map((p) => p.toPar18)).toEqual([0, 18]);
    expect(pts[0].putts18).toBe(36);
    expect(pts[1].differential).toBe(Math.round((113 / 134) * (69 + 18 - 71.8) * 10) / 10);
  });
});

describe('course stats', () => {
  it('average per hole, hardest and easiest hole, best round', () => {
    const s1 = par.map((p) => p + 1);
    s1[4] = 7; // hole 5 (par 4): +3
    const s2 = par.slice();
    s2[4] = 6; // +2
    s2[9] = 3; // hole 10 (par 4): birdie
    const rs = [round('2026-08-01T10:00:00Z', s1), round('2026-09-01T10:00:00Z', s2), round('2026-09-02T10:00:00Z', par, { courseName: 'Alcanada' })];
    const c = courseStats(rs, 'Son Antem West');
    expect(c.rounds).toHaveLength(2);
    expect(c.hardest!.hole.label).toBe('5');
    expect(c.hardest!.toPar).toBe(2.5);
    expect(c.easiest!.hole.label).toBe('10');
    expect(c.best18!.gross).toBe(69 + 2 - 1);
    expect(playedCourses(rs)[0]).toMatchObject({ courseName: 'Son Antem West', rounds: 2 });
  });
});

describe('personal bests', () => {
  it('best round, most points, fewest putts, most birdies and the first eagle', () => {
    const good = par.slice();
    good[1] = 3; // birdie
    good[2] = 2; // eagle on the par-4 hole 3
    const bests = personalBests([round('2026-08-01T10:00:00Z', par.map((p) => p + 1)), round('2026-09-01T10:00:00Z', good, {}, 1)]);
    const by = Object.fromEntries(bests.map((b) => [b.key, b.value]));
    expect(by.gross).toMatch(/^66 /);
    expect(by.putts).toMatch(/^18 /);
    expect(by.birdies).toBe('2');
    expect(bests.find((b) => b.key === 'eagle')!.value).toMatch(/3$/);
  });
});
