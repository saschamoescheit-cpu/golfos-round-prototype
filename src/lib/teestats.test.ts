import { describe, expect, it } from 'vitest';
import { teeStats } from './teestats';
import type { Round } from '../types';

const entry = (strokes: number, fairway: 'left' | 'hit' | 'right' | 'ob' | null, club?: string) => ({
  strokes, pickedUp: false, putts: 2, fairway, penalties: 0, greensideBunker: false, upAndDown: null,
  ...(club ? { detail: { shots: [{ club }] } } : {}),
});

const round = {
  players: [{ id: 'me', name: 'Ich', playingHandicap: 8, isMe: true }],
  holes: [
    { index: 0, label: '1', loop: 'A', number: 1, par: 4, strokeIndex: 1 },
    { index: 1, label: '2', loop: 'A', number: 2, par: 3, strokeIndex: 2 },
    { index: 2, label: '3', loop: 'A', number: 3, par: 5, strokeIndex: 3 },
    { index: 3, label: '4', loop: 'A', number: 4, par: 4, strokeIndex: 4 },
    { index: 4, label: '5', loop: 'A', number: 5, par: 4, strokeIndex: 5 },
  ],
  entries: { me: [entry(4, 'hit', 'Dr'), entry(3, null), entry(7, 'left', 'Dr'), entry(6, 'ob', '3W'), entry(5, 'right', '3W')] },
} as unknown as Round;

describe('teeStats', () => {
  it('counts the tee results per club, par 4 and 5 only', () => {
    const s = teeStats([round]);
    expect(s.byClub.map((c) => [c.club, c.n, c.hit, c.left, c.right, c.ob])).toEqual([
      ['Dr', 2, 1, 1, 0, 0],
      ['3W', 2, 0, 0, 1, 1],
    ]);
  });
  it('what a missed fairway costs: strokes over par after a hit, a miss and out of bounds', () => {
    const s = teeStats([round]);
    expect(s.cost).toEqual({ hit: 0, missed: 1.5, ob: 2, nHit: 1, nMissed: 2, nOb: 1 });
  });
});
