import { describe, expect, it } from 'vitest';
import { roundSummary } from './summary';
import { emptyEntry } from './scoring';
import type { DetailEntry, HoleEntry, LngLat, Round, RoundHole } from '../types';

const M = 1 / 111195;
const at = (north: number, east = 0): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
const holes = (n: number): RoundHole[] => Array.from({ length: n }, (_, i) => ({ index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 4, strokeIndex: i + 1 }));
const round = (entries: HoleEntry[], playing: number | null = 10): Round => ({
  id: 'r', createdAt: '2026-10-13T10:00:00Z', finishedAt: '2026-10-13T14:00:00Z', courseId: 'x', courseName: 'Test', loopOrder: ['Main'],
  holes: holes(entries.length), mode: 'detail', currentHole: entries.length - 1,
  players: [{ id: 'me', name: 'Sascha', playingHandicap: playing, isMe: true }], entries: { me: entries },
});

describe('round summary', () => {
  it('approaches that keep finishing short: says so, plans the carry check and one club more', () => {
    // 366 m par 4: drive to 250 m, approach 116 m finishes 26 m short, chip to 2 m, two putts = 5
    const hole = (): HoleEntry => {
      const d: DetailEntry = {
        shots: [
          { pos: at(0), lie: 'tee', club: 'Dr', penalty: false },
          { pos: at(250), lie: 'fairway', club: '9i', penalty: false },
          { pos: at(340), lie: 'fairway', club: 'SW', penalty: false },
        ],
        onGreen: at(364), pin: at(366), holedOut: false,
      };
      return { ...emptyEntry(), detail: d, strokes: 5, putts: 2, fairway: 'hit' };
    };
    const s = roundSummary(round(Array.from({ length: 18 }, hole)))!;
    expect(s.facts.approach).toMatchObject({ shots: 18, short: 18, greens: 0 });
    expect(s.facts.sg).not.toBeNull();
    expect(s.plan.map((d) => d.title)).toContain('Carry check');
    expect(s.nextRound).toMatch(/one club more/);
    expect(s.lines.some((l) => l.tone === 'bad' && /^Most strokes lost/.test(l.text))).toBe(true);
    expect(s.plan.find((d) => d.title === 'Carry check')!.why).toMatch(/18 of 18 approaches were short/);
  });

  it('quick tracking with three-putts: no strokes gained, still a headline and the lag ladder', () => {
    const e = (strokes: number, putts: number): HoleEntry => ({ ...emptyEntry(), strokes, putts, fairway: 'hit' });
    const entries = Array.from({ length: 18 }, (_, i) => (i % 6 === 0 ? e(6, 3) : e(5, 2)));
    const s = roundSummary(round(entries))!;
    expect(s.facts.sg).toBeNull();
    expect(s.facts.putting).toMatchObject({ threePutts: 3 });
    expect(s.headline).toMatch(/points/);
    expect(s.plan.map((d) => d.title)).toEqual(['Lag ladder']);
    // 18 × bogey and 3 doubles with playing handicap 10: 36 − points = strokes over the handicap
    expect(s.facts.vsPlaying).toBe(36 - s.facts.points!);
  });

  it('nothing to say about a round of fewer than 9 holes', () => {
    const short = round(Array.from({ length: 18 }, (_, i) => ({ ...emptyEntry(), strokes: i < 4 ? 4 : null })));
    expect(roundSummary(short)).toBeNull();
  });
});
