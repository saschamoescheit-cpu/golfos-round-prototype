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
  it('handicap allowance: 50 % halves the strokes received', () => {
    // A: hcp 8 at 50 % = 4 → one stroke on each of the four holes
    const b = leaderboard(round([{ id: 'A', hcp: 8, scores: [5, 5, 5, 5] }], { mode: 'single', scoring: 'net', allowance: 50 }));
    expect(b.rows[0].value).toBe('Par');
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
    // A & B: 4, 3, 5, 4 = +0; C & D: 4, 4, 4, 4 = par – stroke play: totals, no match status
    expect(b.rows.map((r) => [r.name, r.value])).toEqual([
      ['A & B', 'Par'],
      ['C & D', 'Par'],
    ]);
    expect(b.status).toBeNull();
    // the same as match play: hole by hole
    const m = leaderboard({ ...round([{ id: 'A', hcp: null, scores: [6, 3, 5, 4] }, { id: 'B', hcp: null, scores: [4, 6, 5, 6] }, { id: 'C', hcp: null, scores: [4, 4, 4, 4] }, { id: 'D', hcp: null, scores: [5, 5, 5, 5] }]) }, { mode: 'fourball', scoring: 'stroke', matchplay: true });
    expect(m.status).toBe('All square after 4');
  });
  it('modes depend on the number of players', () => {
    expect(modesFor(1)).toEqual(['single']);
    expect(modesFor(2)).toContain('match');
    expect(modesFor(4)).toContain('fourball');
  });
});

describe('team modes', () => {
  it('scramble and foursomes: team handicap from the players', async () => {
    const { teamHandicap, teamsOf, modesFor } = await import('./games');
    expect(teamHandicap('foursome', [10, 20])).toBe(15);
    expect(teamHandicap('scramble', [20, 10])).toBe(7); // 35 % of 10 + 15 % of 20 = 6.5
    expect(teamHandicap('scramble', [10, null])).toBeNull();
    expect(teamsOf('scramble', 4)).toEqual([[0, 1], [2, 3]]);
    expect(teamsOf('scramble', 3)).toEqual([[0, 1, 2]]);
    expect(modesFor(3)).toEqual(['single', 'scramble']);
  });
  it('two teams: ranked like players, as match play with the status', () => {
    const b = leaderboard(round([{ id: 'A & B', hcp: null, scores: [3, 4, null, null] }, { id: 'C & D', hcp: null, scores: [4, 4, null, null] }], { mode: 'scramble', scoring: 'stroke' }));
    expect(b.rows.map((r) => [r.name, r.value])).toEqual([
      ['A & B', '-1'],
      ['C & D', 'Par'],
    ]);
    const m = leaderboard(round([{ id: 'A & B', hcp: null, scores: [3, 4, null, null] }, { id: 'C & D', hcp: null, scores: [4, 4, null, null] }], { mode: 'scramble', scoring: 'stroke', matchplay: true }));
    expect(m.status).toBe('A & B 1 up after 2');
  });
});

// Sascha's concept 30.10.2026: greensome and Chapman, the WHS allowances, Texas scramble
describe('more formats', () => {
  it('greensome and Chapman: one ball per team, 60 % of the lower and 40 % of the higher playing handicap', async () => {
    const { teamHandicap, isTeamMode, teamsOf, modesFor } = await import('./games');
    expect(teamHandicap('greensome', [20, 10])).toBe(14); // 0.6 × 10 + 0.4 × 20
    expect(teamHandicap('chapman', [5, 5])).toBe(5);
    expect(teamHandicap('chapman', [8, null])).toBeNull();
    expect(isTeamMode('greensome') && isTeamMode('chapman')).toBe(true);
    expect(teamsOf('greensome', 4)).toEqual([[0, 1], [2, 3]]);
    expect(modesFor(2)).toEqual(expect.arrayContaining(['greensome', 'chapman']));
    expect(modesFor(3)).not.toContain('greensome');
  });
  it('the WHS allowance of a format: 95 % single play in a competition, 100 % with friends, better ball 85 / 90 %', async () => {
    const { whsAllowance } = await import('./games');
    expect(whsAllowance('single', false, true)).toBe(95);
    expect(whsAllowance('single', false, false)).toBe(100);
    expect(whsAllowance('match', true, true)).toBe(100);
    expect(whsAllowance('fourball', false, true)).toBe(85);
    expect(whsAllowance('fourball', true, false)).toBe(90);
    expect(whsAllowance('scramble', false, true)).toBe(100); // the share is in the team handicap
  });
  it('Texas scramble: whose drive – counted, and a warning when a player gets tight', async () => {
    const { texasDrives, drivesShort } = await import('./games');
    const holes = Array.from({ length: 6 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
    const e = (drive?: number) => ({ ...emptyEntry(), strokes: 4, ...(drive != null ? { drive } : {}) });
    const round = {
      holes,
      players: [{ id: 'me', name: 'Sascha & Cedric', playingHandicap: 3, isMe: true }],
      format: { mode: 'scramble' as const, scoring: 'stroke' as const, minDrives: 2 },
      entries: { me: [e(0), e(0), e(0), emptyEntry(), emptyEntry(), emptyEntry()] },
    };
    const t = texasDrives(round, 'me', 3)!;
    expect(t).toEqual({ members: ['Sascha', 'Cedric'], counts: [3, 0], min: 2, left: 2 });
    // Cedric needs 2, two holes are left after this one: tight now – his drive here makes it 1 of 2 left
    expect(drivesShort(t, 0)).toEqual([{ name: 'Cedric', need: 2 }]);
    expect(drivesShort(t, 1)).toEqual([]);
    expect(texasDrives({ ...round, format: { mode: 'scramble', scoring: 'stroke' } }, 'me', 3)).toBeNull();
  });
});