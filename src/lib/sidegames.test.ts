import { beforeEach, describe, expect, it } from 'vitest';
import { addSideGame, bindSideGames, NEXT_ROUND, sideGamesOf, sideGameView } from './sidegames';
import { standingOf } from './gameforms';
import type { Round } from '../types';

// Sascha 10.11.2026, USA: "a side bet – choose the game form": Skins, Nassau … judged from the round's own strokes.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
  (globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };
});
const holes = [1, 2, 3].map((n) => ({ index: n - 1, label: `${n}A`, loop: 'A', number: n, par: 4, strokeIndex: n }));
const e = (s: number | null, pickedUp = false) => ({ strokes: s, pickedUp, putts: null, fairway: null, sandShots: 0, penalties: 0 });
const round = {
  id: 'r1', courseName: 'Stonegate', createdAt: '2026-11-10T16:00:00Z', finishedAt: null, holes,
  players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 7 }, { id: 'p2', name: 'Chris', playingHandicap: 0 }],
  entries: { me: [e(4), e(5), e(null)], p2: [e(5), e(5, true), e(null)] },
} as unknown as Round;

describe('a side game beside the round', () => {
  it('set up with the round, bound to it once it starts', () => {
    addSideGame({ id: 's1', round: NEXT_ROUND, form: 'skins', players: [{ id: 'p1', name: 'Sascha', hcp: 7 }, { id: 'p2', name: 'Chris', hcp: 0 }], settings: { stake: 1, carry: true }, createdAt: new Date().toISOString() });
    bindSideGames('r1');
    expect(sideGamesOf('r1').map((s) => s.id)).toEqual(['s1']);
    expect(sideGamesOf(NEXT_ROUND)).toEqual([]);
  });
  it('its strokes the round\'s, by name – a hole picked up or not played: none', () => {
    const g = sideGameView({ id: 's1', round: 'r1', form: 'skins', players: [{ id: 'p1', name: 'Sascha', hcp: 7 }, { id: 'p2', name: 'chris', hcp: 0 }], settings: { stake: 1, carry: true }, createdAt: '' }, round);
    expect(g.scores).toEqual({ p1: [4, 5, null], p2: [5, null, null] });
    expect(g.holes.map((h) => h.si)).toEqual([1, 2, 3]);
    expect(standingOf(g).rows.length).toBe(2);
  });
});
