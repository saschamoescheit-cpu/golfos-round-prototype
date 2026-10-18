import { describe, expect, it } from 'vitest';
import { analyse, fairwayOf, focusAreas, pct, playerBag } from './stats';
import { emptyEntry } from './scoring';
import type { HoleEntry, LngLat, Round } from '../types';

const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];

/** A round of 18 par-4 holes; `hole(k)` returns the entry of hole k. */
function round(hcp: number | null, hole: (k: number) => Partial<HoleEntry>): Round {
  const holes = Array.from({ length: 18 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
  return {
    id: 'r', createdAt: '2026-10-10T10:00:00Z', finishedAt: '2026-10-10T14:00:00Z', courseId: 'c', courseName: 'C', loopOrder: ['Main'], holes, mode: 'detail',
    players: [{ id: 'me', name: 'Me', playingHandicap: hcp, isMe: true }],
    entries: { me: holes.map((_, k) => ({ ...emptyEntry(), ...hole(k) })) }, currentHole: 17,
  };
}

describe('analysis across rounds', () => {
  // Bogey golf: 5 strokes, 2 putts, fairway alternating hit/right, no GIR; every 6th hole a 3-putt double.
  const bogey = round(18, (k) => ({ strokes: k % 6 === 0 ? 6 : 5, putts: k % 6 === 0 ? 3 : 2, fairway: k % 2 ? 'right' : 'hit', penalties: k === 4 ? 1 : 0 }));
  const a = analyse([bogey]);
  it('scores, fairways, greens, putts', () => {
    expect(a.holes).toBe(18);
    expect(a.toParPer18).toBe(21); // 15 bogeys + 3 doubles
    expect(a.scoreMix.bogey).toBe(83);
    expect(a.scoreMix.doublePlus).toBe(17);
    expect(pct(a.fairways)).toBe(50);
    expect(pct(a.missRight)).toBe(50);
    expect(pct(a.gir)).toBe(0);
    expect(a.puttsPer18).toBe(39);
    expect(pct(a.threePutts)).toBe(17);
    expect(a.penaltiesPer18).toBe(1);
    expect(pct(a.scrambling)).toBe(0);
  });
  it('focus areas against the next better band (hcp 13–20 → 6–12)', () => {
    const f = focusAreas(a)!;
    expect(f.band).toBe('hcp 13–20');
    expect(f.target).toBe('hcp 6–12');
    expect(f.focus.length).toBe(3);
    expect(f.focus.map((x) => x.area)).toContain('Putting');
    expect(f.focus.map((x) => x.area)).toContain('Approach');
  });
  it('club distances from detailed shots replace the standard bag', () => {
    const det = round(18, () => ({
      strokes: 4, putts: 2,
      detail: { shots: [{ pos: at(0, 0), lie: 'tee', club: 'Dr', penalty: false }, { pos: at(0, 232), lie: 'fairway', club: '9i', penalty: false }], onGreen: at(0, 345), pin: at(0, 350), holedOut: false },
    }));
    const b = analyse([det]);
    expect(b.clubs.find((c) => c.club === 'Dr')!.median).toBe(232);
    expect(b.clubs.find((c) => c.club === '9i')!.avg).toBe(113);
    expect(b.puttsByFirstPutt[2]).toEqual({ label: '3–6 m', holes: 18, avgPutts: 2 });
    expect(playerBag([det]).find((x) => x.club === 'Dr')!.m).toBe(232);
    expect(playerBag([det]).find((x) => x.club === '7i')!.m).toBe(130); // no own data → standard
  });
});

describe('fairway hit from the checked shots', () => {
  const tee = at(0, 0);
  const pin = at(0, 350);
  const e = (second: { pos: LngLat; lie: 'fairway' | 'rough' }, penalty = false) =>
    ({ ...emptyEntry(), strokes: 4, putts: 2, detail: { shots: [{ pos: tee, lie: 'tee', club: 'Dr', penalty }, { pos: second.pos, lie: second.lie, club: '9i', penalty: false }], onGreen: at(0, 345), pin, holedOut: false } }) as HoleEntry;
  it('fairway lie = hit, rough = the side it lies on, a tee penalty = out of bounds', () => {
    expect(fairwayOf(e({ pos: at(0, 230), lie: 'fairway' }))).toBe('hit');
    expect(fairwayOf(e({ pos: at(-25, 230), lie: 'rough' }))).toBe('left');
    expect(fairwayOf(e({ pos: at(25, 230), lie: 'rough' }))).toBe('right');
    expect(fairwayOf(e({ pos: at(0, 230), lie: 'fairway' }, true))).toBe('ob');
  });
  it('what the player entered wins', () => {
    expect(fairwayOf({ ...e({ pos: at(25, 230), lie: 'rough' }), fairway: 'hit' })).toBe('hit');
  });
});

describe('where the misses ended and the short game (Sascha 18.10.2026)', () => {
  const shot = (lie: 'tee' | 'fairway' | 'semirough' | 'rough' | 'fringe' | 'bunker', club: string | null = null) => ({ pos: at(0, 0), lie, club: club as never, penalty: false });
  const r = round(18, (k) => ({
    strokes: 5,
    putts: 2,
    detail: { shots: [shot('tee', 'Dr'), shot(k % 3 === 0 ? 'semirough' : k % 3 === 1 ? 'rough' : 'fairway'), ...(k === 0 ? [shot('fringe', 'Pt')] : [])], onGreen: null, pin: null, holedOut: false },
  }));
  const a = analyse([r]);
  it('counts the missed tee shots by the lie of the second shot', () => {
    expect(a.missLies).toEqual({ semirough: 6, rough: 6, bunker: 0, other: 0 });
  });
  it('counts shots from the fringe and the Texas wedge', () => {
    expect(a.shortGame).toEqual({ fromFringe: 1, texas: 1 });
  });
});
