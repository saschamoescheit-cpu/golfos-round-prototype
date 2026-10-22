import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GEO, guardStorage, makeRoom, touchGeometry } from './storageguard';

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
    ls.setItem('golfos.track.v1.r1', 'x'.repeat(400));
    expect(() => ls.setItem('golfos.track.v1.r2', 'x'.repeat(300))).toThrow();
    expect(ls.getItem(GEO + 'c')).not.toBeNull();
    expect(ls.getItem('golfos.track.v1.r1')).not.toBeNull();
    expect(makeRoom('x')).toBe(false);
  });
  it('a write that fits is not touched', () => {
    ls.setItem(GEO + 'a', 'x'.repeat(100));
    ls.setItem('golfos.me.v1', '{}');
    expect(ls.getItem(GEO + 'a')).not.toBeNull();
  });
});
