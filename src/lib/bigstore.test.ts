import { beforeEach, describe, expect, it } from 'vitest';
import { flushBig, isBig, openBigStore, resetBigStoreForTests, type BigBackend } from './bigstore';
import { decodeTrack, encodeTrack } from './trackcodec';

// The big data in IndexedDB instead of the 5 MB of localStorage (Sascha 08.11.2026: "storage full" right after opening
// the app). A storage like the browser's – its methods on the prototype – and a backend in memory.
class FakeStorage {
  data = new Map<string, string>();
  limit = 2000;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    let size = 0;
    for (const [kk, vv] of this.data) if (kk !== k) size += kk.length + vv.length;
    if (size + k.length + v.length > this.limit) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
const originals = {
  getItem: FakeStorage.prototype.getItem,
  setItem: FakeStorage.prototype.setItem,
  removeItem: FakeStorage.prototype.removeItem,
  key: FakeStorage.prototype.key,
  clear: FakeStorage.prototype.clear,
  length: Object.getOwnPropertyDescriptor(FakeStorage.prototype, 'length')!,
};

class MemBackend implements BigBackend {
  data = new Map<string, string>();
  failPut = false;
  async all() {
    return [...this.data];
  }
  async put(e: [string, string][]) {
    if (this.failPut) throw new Error('no db');
    for (const [k, v] of e) this.data.set(k, v);
  }
  async del(keys: string[]) {
    for (const k of keys) this.data.delete(k);
  }
}

let ls: FakeStorage;
beforeEach(() => {
  resetBigStoreForTests();
  Object.assign(FakeStorage.prototype, { getItem: originals.getItem, setItem: originals.setItem, removeItem: originals.removeItem, key: originals.key, clear: originals.clear });
  Object.defineProperty(FakeStorage.prototype, 'length', originals.length);
  ls = new FakeStorage();
});
const S = () => ls as unknown as Storage;

describe('the big store', () => {
  it('knows the big keys: tracks, map copies, course details, heights – not rounds or settings', () => {
    expect(isBig('golfos.track.v1.r1')).toBe(true);
    expect(isBig('golfos.geo.v1.osm:way/1')).toBe(true);
    expect(isBig('golfos.course.v1.x')).toBe(true);
    expect(isBig('golfos.elevation.v1')).toBe(true);
    // the tournaments' copies and the caddie's log too (09.11.2026)
    expect(isBig('golfos.event.v1.ABC123')).toBe(true);
    expect(isBig('golfos.caddielog.v1.r1')).toBe(true);
    expect(isBig('golfos.rounds.v1')).toBe(false);
    expect(isBig('golfos.profile.v1')).toBe(false);
  });

  it('moves the big keys out of localStorage – written first, then removed – and still answers them', async () => {
    ls.setItem('golfos.track.v1.r1', 't'.repeat(900));
    ls.setItem('golfos.geo.v1.c', 'g'.repeat(900));
    ls.setItem('golfos.rounds.v1', '[1]');
    const b = new MemBackend();
    expect(await openBigStore(b, S())).toBe(true);
    expect(b.data.get('golfos.track.v1.r1')).toBe('t'.repeat(900));
    expect(ls.data.has('golfos.track.v1.r1')).toBe(false); // out of the small storage
    expect(ls.getItem('golfos.track.v1.r1')).toBe('t'.repeat(900)); // still read as before
    expect(ls.getItem('golfos.rounds.v1')).toBe('[1]');
    // all keys still listed (the sync, the backup walk them)
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i));
    expect(keys.sort()).toEqual(['golfos.geo.v1.c', 'golfos.rounds.v1', 'golfos.track.v1.r1']);
  });

  it('room for the round again: the small storage held 1800 of 2000, now the round fits', async () => {
    ls.setItem('golfos.track.v1.r1', 't'.repeat(900));
    ls.setItem('golfos.geo.v1.c', 'g'.repeat(900));
    expect(() => ls.setItem('golfos.rounds.v1', 'r'.repeat(500))).toThrow();
    await openBigStore(new MemBackend(), S());
    ls.setItem('golfos.rounds.v1', 'r'.repeat(500));
    expect(ls.getItem('golfos.rounds.v1')).toBe('r'.repeat(500));
  });

  it('writes and removals reach the database – and come back after a restart', async () => {
    const b = new MemBackend();
    await openBigStore(b, S());
    ls.setItem('golfos.track.v1.r2', 'x'.repeat(5000)); // larger than the whole small storage
    ls.setItem('golfos.geo.v1.c', 'g');
    ls.removeItem('golfos.geo.v1.c');
    await flushBig();
    expect(b.data.get('golfos.track.v1.r2')).toHaveLength(5000);
    expect(b.data.has('golfos.geo.v1.c')).toBe(false);
    // the app started again
    resetBigStoreForTests();
    Object.assign(FakeStorage.prototype, { getItem: originals.getItem, setItem: originals.setItem, removeItem: originals.removeItem, key: originals.key, clear: originals.clear });
    Object.defineProperty(FakeStorage.prototype, 'length', originals.length);
    await openBigStore(b, S());
    expect(ls.getItem('golfos.track.v1.r2')).toHaveLength(5000);
  });

  it('a track in both places (a session without the big store began it again): put together, fix by fix', async () => {
    const b = new MemBackend();
    b.data.set('golfos.track.v1.r1', encodeTrack([[1000, 9.69, 48.78, 4], [2000, 9.6901, 48.78, 4]]));
    ls.setItem('golfos.track.v1.r1', encodeTrack([[2000, 9.6901, 48.78, 4], [3000, 9.6902, 48.78, 5]]));
    await openBigStore(b, S());
    expect(decodeTrack(ls.getItem('golfos.track.v1.r1')).map((r) => r[0])).toEqual([1000, 2000, 3000]);
    expect(decodeTrack(b.data.get('golfos.track.v1.r1')!).map((r) => r[0])).toEqual([1000, 2000, 3000]);
  });
  it('anything else in both places: the one written last (localStorage)', async () => {
    const b = new MemBackend();
    b.data.set('golfos.geo.v1.c', 'old');
    ls.setItem('golfos.geo.v1.c', 'new');
    await openBigStore(b, S());
    expect(ls.getItem('golfos.geo.v1.c')).toBe('new');
  });

  it('no database: nothing moves, nothing is lost', async () => {
    ls.setItem('golfos.track.v1.r1', 't'.repeat(100));
    const b = new MemBackend();
    b.failPut = true;
    expect(await openBigStore(b, S())).toBe(false);
    expect(ls.data.get('golfos.track.v1.r1')).toBe('t'.repeat(100));
    expect(await openBigStore(null, S())).toBe(false);
  });

  it('clear empties both (the tests start clean, "reset app data")', async () => {
    const b = new MemBackend();
    ls.setItem('golfos.track.v1.r1', 't');
    await openBigStore(b, S());
    ls.clear();
    await flushBig();
    expect(ls.getItem('golfos.track.v1.r1')).toBeNull();
    expect(b.data.size).toBe(0);
    expect(ls.length).toBe(0);
  });
});
