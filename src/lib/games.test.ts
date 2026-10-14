import { describe, expect, it } from 'vitest';
import type { Round } from '../types';
import { emptyEntry } from './scoring';
import { leaderboard, modesFor } from './games';

// four par-4 holes, stroke index 1–4
function round(players: { id: string; hcp: number | null; scores: (number | null)[] }[], format?: Round['format']): Round {
  const holes = [1, 2, 3, 4].map((n, i) => ({ index: i, label: String(n), loop: 'A', number: n, par: 4, strokeIndex: n }));
  return {
    id: 'r',
    createdAt: '2026-10-14T08:00:00Z',
    finishedAt: null,
    courseId: 'c',
    courseName: 'Test',
    loopOrder: ['A'],
    holes,
    mode: 'quick',
    players: players.map((p, k) => ({ id: p.id, name: p.id, playingHandicap: p.hcp, isMe: k === 0 })),
    entries: Object.fromEntries(players.map((p) => [p.id, p.scores.map((s) => ({ ...emptyEntry(), strokes: s }))])),
    currentHole: 0,
    ...(format ? { format } : {}),
  };
}

describe('leaderboard', () => {
  it('stroke play: lowest to par first, holes played as "thru"', () => {
    const b = leaderboard(round([{ id: 'A', hcp: null, scores: [5, 5, null, null] }, { id: 'B', hcp: null, scores: [4, 4, 4, null] }]));
    expect(b.rows.map((r) => [r.name, r.value, r.thru])).toEqual([
      ['B', 'Par', 3],
      ['A', '+2', 2],
    ]);
  });
  it('Stableford: most points first', () => {
    // A gets a stroke on every hole (hcp 4 on four holes): 5 = net par = 2 points each
    const b = leaderboard(round([{ id: 'A', hcp: 4, scores: [5, 5, 5, 5] }, { id: 'B', hcp: 0, scores: [4, 4, 5, 4] }], { mode: 'single', scoring: 'stableford' }));
    expect(b.rows.map((r) => [r.name, r.value])).toEqual([
      ['A', '8 pts'],
      ['B', '7 pts'],
    ]);
  });
  it('match play: net per hole, ends when the lead is bigger than the holes left', () => {
    const b = leaderboard(round([{ id: 'A', hcp: 0, scores: [3, 3, 3, null] }, { id: 'B', hcp: 0, scores: [4, 4, 4, null] }], { mode: 'match', scoring: 'stroke' }));
    expect(b.status).toBe('A wins 3&1');
    expect(b.rows[0].name).toBe('A');
  });
  it('four-ball: the better ball of each team counts', () => {
    const b = leaderboard(
      round(
        [
          { id: 'A', hcp: null, scores: [6, 3, 5, 4] },
          { id: 'B', hcp: null, scores: [4, 6, 5, 6] },
          { id: 'C', hcp: null, scores: [4, 4, 4, 4] },
          { id: 'D', hcp: null, scores: [5, 5, 5, 5] },
        ],
        { mode: 'fourball', scoring: 'stroke' },
      ),
    );
    // A & B: 4, 3, 5, 4 = +0; C & D: 4, 4, 4, 4 = par
    expect(b.rows.map((r) => [r.name, r.value])).toEqual([
      ['A & B', 'Par'],
      ['C & D', 'Par'],
    ]);
    expect(b.status).toBe('All square after 4');
  });
  it('modes depend on the number of players', () => {
    expect(modesFor(1)).toEqual(['single']);
    expect(modesFor(2)).toContain('match');
    expect(modesFor(4)).toContain('fourball');
  });
});
