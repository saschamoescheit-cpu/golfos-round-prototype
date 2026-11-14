import { beforeEach, describe, expect, it } from 'vitest';

// Sascha 13.11.2026: the tee changed in the middle of a round – the round's tee, the player's own and his playing handicap
// follow; the others keep theirs; a course rating typed for the old tee no longer counts
describe('a round switched to another tee', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; } } as Storage;
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ hcpIndex: '14,2' }));
  });
  it('Son Quint yellow → red: own tee and playing handicap follow, Ben keeps his', async () => {
    const { withTee, roundTees } = await import('../components/TeeSwitch');
    const { playingHandicapFor } = await import('./handicap');
    const { RATINGS } = await import('../data/ratings');
    const courseId = Object.keys(RATINGS).find((k) => RATINGS[k].Yellow && RATINGS[k].Red && k === 'osm:relation/1654444') ?? Object.keys(RATINGS).find((k) => RATINGS[k].Yellow && RATINGS[k].Red)!;
    const holes = Array.from({ length: 18 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 4, strokeIndex: i + 1 }));
    const round = { id: 'r', courseId, tee: 'Yellow', rating: { cr: 70, slope: 130 }, holes, players: [{ id: 'me', name: 'Sascha', isMe: true, tee: 'Yellow', playingHandicap: 16 }, { id: 'b', name: 'Ben', isMe: false, tee: 'Yellow', playingHandicap: 20 }] } as never;
    const r = withTee(round, 'Red');
    expect(r.tee).toBe('Red');
    expect(r.rating).toBeUndefined();
    expect(r.players[0]).toMatchObject({ tee: 'Red', playingHandicap: playingHandicapFor(courseId, holes, 'Red', '14,2') });
    expect(r.players[0].playingHandicap).not.toBe(playingHandicapFor(courseId, holes, 'Yellow', '14,2'));
    expect(r.players[1]).toMatchObject({ tee: 'Yellow', playingHandicap: 20 });
    expect(roundTees(round).length).toBeGreaterThan(1);
  });
  // review 14.11.2026: switched in the middle of the round, the holes played keep the tee they were played from
  it('in the middle of the round: the holes played keep their tee, the rest follows the round', async () => {
    const { withTee } = await import('../components/TeeSwitch');
    const holes = Array.from({ length: 4 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 4, strokeIndex: i + 1 }));
    const e = (strokes: number | null, tee?: string) => ({ strokes, putts: null, ...(tee ? { tee } : {}) });
    const round = { id: 'r', courseId: 'x', tee: 'Yellow', holes, entries: { me: [e(5), e(4, 'Blue'), e(null), e(null)] }, players: [{ id: 'me', name: 'Sascha', isMe: true, tee: 'Yellow', playingHandicap: 16 }] } as never;
    const mid = withTee(round, 'Red', true) as unknown as { tee: string; entries: { me: { tee?: string }[] } };
    expect(mid.tee).toBe('Red');
    expect(mid.entries.me.map((x) => x.tee ?? null)).toEqual(['Yellow', 'Blue', null, null]);
    // after the round (the scorecard): every hole follows
    const after = withTee(round, 'Red') as unknown as { entries: { me: { tee?: string }[] } };
    expect(after.entries.me.map((x) => x.tee ?? null)).toEqual([null, 'Blue', null, null]);
  });
});
