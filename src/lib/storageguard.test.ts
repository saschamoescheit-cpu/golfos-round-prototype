import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GEO, guardStorage, holdGeometry, makeRoom, touchGeometry } from './storageguard';

// a device storage with Safari's kind of limit, small enough for a test
class FakeStorage {
  data = new Map<string, string>();
  limit = 1000;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
  setItem(k: string, v: string) {
    let size = 0;
    for (const [kk, vv] of this.data) if (kk !== k) size += kk.length + vv.length;
    if (size + k.length + v.length > this.limit) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
}

const ls = new FakeStorage();
beforeAll(() => {
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = ls;
  guardStorage();
});
beforeEach(() => ls.clear());

describe('storage full', () => {
  it('a course map copy makes room for the round – the one used longest ago first', () => {
    ls.setItem(GEO + 'a', 'x'.repeat(300));
    ls.setItem(GEO + 'b', 'x'.repeat(300));
    touchGeometry('a');
    const used = JSON.parse(ls.getItem('golfos.geoused.v1') ?? '{}');
    ls.setItem('golfos.geoused.v1', JSON.stringify({ ...used, b: used.a - 60000 })); // b used a minute before a
    ls.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'r1', courseId: 'z', finishedAt: '2026-10-22' }]) + ' '.repeat(250));
    expect(ls.getItem(GEO + 'b')).toBeNull();
    expect(ls.getItem(GEO + 'a')).not.toBeNull();
    expect(ls.getItem('golfos.rounds.v1')).not.toBeNull();
  });
  it('never the map of a course with a round being played, never rounds or tracks', () => {
    ls.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'r1', courseId: 'c', finishedAt: null }]));
    ls.setItem(GEO + 'c', 'x'.repeat(400));
    touchGeometry('c'); // played now
    ls.setItem('golfos.track.v1.r1', 'x'.repeat(300));
    expect(() => ls.setItem('golfos.track.v1.r2', 'x'.repeat(300))).toThrow();
    expect(ls.getItem(GEO + 'c')).not.toBeNull();
    expect(ls.getItem('golfos.track.v1.r1')).not.toBeNull();
    expect(makeRoom('x')).toBe(false);
  });
  it('never the map of a game being played (Games, Celebration 08.11.2026) or of the map on screen', () => {
    ls.setItem('golfos.games.v1', JSON.stringify([{ id: 'g1', finishedAt: null, round: { courseId: 'cel' } }, { id: 'g0', finishedAt: '2026-11-07', round: { courseId: 'old' } }]));
    ls.setItem(GEO + 'cel', 'x'.repeat(200));
    touchGeometry('cel'); // played now
    ls.setItem(GEO + 'old', 'x'.repeat(200));
    ls.setItem(GEO + 'seen', 'x'.repeat(200));
    const free = holdGeometry('seen');
    while (makeRoom('x'));
    expect(ls.getItem(GEO + 'cel')).not.toBeNull();
    expect(ls.getItem(GEO + 'seen')).not.toBeNull();
    expect(ls.getItem(GEO + 'old')).toBeNull();
    free();
    expect(makeRoom('x')).toBe(true);
    expect(ls.getItem(GEO + 'seen')).toBeNull();
  });
  it('an unfinished game or round not played for days holds no map (Sascha 08.11.2026, Moritz: "storage full" right after opening)', () => {
    ls.setItem('golfos.games.v1', JSON.stringify([{ id: 'g1', finishedAt: null, round: { courseId: 'trip1' } }]));
    ls.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'r1', courseId: 'trip2', finishedAt: null }]));
    ls.setItem(GEO + 'trip1', 'x'.repeat(200));
    ls.setItem(GEO + 'trip2', 'x'.repeat(200));
    ls.setItem('golfos.geoused.v1', JSON.stringify({ trip1: Date.now() - 2 * 86400000, trip2: Date.now() - 86400000 }));
    expect(makeRoom('x')).toBe(true);
    expect(makeRoom('x')).toBe(true);
    expect(ls.getItem(GEO + 'trip1')).toBeNull();
    expect(ls.getItem(GEO + 'trip2')).toBeNull();
  });
  it('a write that fits is not touched', () => {
    ls.setItem(GEO + 'a', 'x'.repeat(100));
    ls.setItem('golfos.me.v1', '{}');
    expect(ls.getItem(GEO + 'a')).not.toBeNull();
  });
});

// Sascha 08.11.2026, Eric: "storage full" with not one round on the phone – the caches that load again go too
describe('storage full without map copies', () => {
  it('the heights and the details of a course not played go – the course played stays, the round is saved', () => {
    ls.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'r1', courseId: 'play', finishedAt: null }]));
    ls.setItem('golfos.course.v1.play', 'p'.repeat(150));
    ls.setItem('golfos.course.v1.old', 'o'.repeat(200));
    ls.setItem('golfos.elevation.v1', 'e'.repeat(250));
    ls.setItem('golfos.holenotes.v1.x', 'n'.repeat(100));
    const round = JSON.stringify([{ id: 'r1', courseId: 'play', finishedAt: null, more: 'm'.repeat(300) }]);
    ls.setItem('golfos.rounds.v1', round);
    expect(ls.getItem('golfos.rounds.v1')).toBe(round);
    expect(ls.getItem('golfos.elevation.v1')).toBeNull();
    expect(ls.getItem('golfos.course.v1.play')).not.toBeNull();
    expect(ls.getItem('golfos.holenotes.v1.x')).not.toBeNull(); // what the player entered never goes
  });
  it('nothing that may go: false, the entries stay', () => {
    ls.setItem('golfos.holenotes.v1.x', 'n'.repeat(500));
    expect(makeRoom('golfos.rounds.v1')).toBe(false);
    expect(ls.getItem('golfos.holenotes.v1.x')).not.toBeNull();
  });
});