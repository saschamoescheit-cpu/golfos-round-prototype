import { describe, expect, it } from 'vitest';
import { cleanCode, guestRound, mergeGames, newCode, onWire, stamp } from './sharedgame';
import { roundForGame } from '../screens/GameOnMap';
import type { Game } from './gameforms';

// Two phones in one game: Sascha enters on his phone, Ben on his – nothing is lost.
const base = (): Game => ({
  id: 'g1',
  createdAt: '2026-10-16T08:00:00Z',
  finishedAt: null,
  courseName: 'Hetzenhof',
  holes: [0, 1, 2].map((i) => ({ label: `${i + 1}A`, par: 4, si: i + 1 })),
  players: [
    { id: 'me', name: 'Sascha', hcp: 7 },
    { id: 'b', name: 'Ben', hcp: 12 },
  ],
  form: 'skins',
  settings: { stake: 1 },
  scores: { me: [null, null, null], b: [null, null, null] },
  extra: [{}, {}, {}],
  current: 0,
  shared: { code: 'K7P4QX' },
});
const set = (g: Game, pid: string, i: number, v: number, at: string): Game =>
  stamp({ ...g, scores: { ...g.scores, [pid]: g.scores[pid].map((s, k) => (k === i ? v : s)) } }, `s:${pid}:${i}`, at);

describe('a game on two phones', () => {
  it('each phone enters its own player – both scores are kept', () => {
    const phoneA = set(base(), 'me', 0, 4, '2026-10-16T08:10:00Z');
    const phoneB = set(base(), 'b', 0, 5, '2026-10-16T08:10:05Z');
    const m = mergeGames(phoneA, phoneB);
    expect(m.scores.me[0]).toBe(4);
    expect(m.scores.b[0]).toBe(5);
    expect(mergeGames(phoneB, phoneA).scores).toEqual(m.scores);
  });
  it('the same score entered on both phones: the later entry wins', () => {
    const a = set(base(), 'b', 1, 6, '2026-10-16T08:20:00Z');
    const b = set(base(), 'b', 1, 5, '2026-10-16T08:21:00Z'); // Ben corrected it
    expect(mergeGames(a, b).scores.b[1]).toBe(5);
    expect(mergeGames(b, a).scores.b[1]).toBe(5);
  });
  it('presses from both phones, finished when one finished', () => {
    const a = { ...base(), presses: [{ hole: 1, by: 'b' }] };
    const b = { ...base(), presses: [{ hole: 1, by: 'b' }, { hole: 2, by: 'me' }], finishedAt: '2026-10-16T10:00:00Z' };
    const m = mergeGames(a, b);
    expect(m.presses).toEqual([{ hole: 1, by: 'b' }, { hole: 2, by: 'me' }]);
    expect(m.finishedAt).toBe('2026-10-16T10:00:00Z');
  });
  it('codes: six letters without 0/O and 1/I; typed codes are cleaned', () => {
    const c = newCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(cleanCode(' k7p-4qx ')).toBe('K7P4QX');
  });
});

describe('a game on the map, shared', () => {
  const withRound = (): Game => {
    const g = base();
    const holes = g.holes.map((h, i) => ({ id: `h${i}`, label: h.label, par: h.par, si: h.si })) as never;
    const round = roundForGame(g, { id: 'hetzenhof', name: 'Hetzenhof' }, holes, ['A']);
    round.entries.me[0] = { ...round.entries.me[0], strokes: 4, shots: [{ at: [9.1, 48.7] }] } as never;
    return { ...g, round, scores: { ...g.scores, me: [4, null, null] } };
  };
  it('the server gets the round frame only – no shots, no GPS, nobody marked as "me"', () => {
    const w = onWire(withRound());
    expect(w.round!.entries).toEqual({});
    expect(w.round!.players.some((p) => p.isMe)).toBe(false);
    expect(w.round!.holes).toHaveLength(3);
  });
  it('the guest gets his own round: he is "me", the scores so far are in it', () => {
    const g = guestRound(onWire(withRound()), 'b');
    expect(g.round!.players.find((p) => p.isMe)?.id).toBe('b');
    expect(g.round!.entries.me[0].strokes).toBe(4);
    expect(g.round!.entries.b[0].strokes).toBeNull();
  });
});
