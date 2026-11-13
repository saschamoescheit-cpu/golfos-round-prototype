import { beforeEach, describe, expect, it } from 'vitest';

// Legends Clermont 13.11.2026: OSM's stroke index was another order than the club's card (8/25). A phone that kept the
// course before takes the corrected holes once – and keeps them (no loop of rebuilding).
describe('a corrected bundled course reaches a kept copy', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } } as Storage;
  });
  it('Legends: the old copy (hole 1 Hcp 18) becomes the card\'s (17, hole 6 = 1, hole 16 = 2)', async () => {
    const { saveCachedCourse, loadCachedCourse } = await import('./storage');
    const { loadCourse } = await import('./courses');
    const id = 'osm:relation/4040123';
    const old = { id, source: 'osm' as const, name: 'Legends Golf and Country Club', lat: 28.5064, lon: -81.7259, loops: ['Main'], bbox: [1, 2, 3, 4] as [number, number, number, number],
      holes: Array.from({ length: 18 }, (_, i) => ({ loop: 'Main', number: i + 1, label: String(i + 1), par: 4, strokeIndex: [i === 0 ? 18 : i + 1] })) };
    saveCachedCourse(old as never);
    const c = await loadCourse({ id, source: 'osm', name: 'Legends', lat: 28.5064, lon: -81.7259 } as never);
    const si = (n: number) => c.holes.find((h) => h.number === n)?.strokeIndex[0];
    expect([si(1), si(6), si(16), si(17)]).toEqual([17, 1, 2, 8]);
    expect(c.fixed).toBe('2026-11-13');
    expect(c.bbox).toEqual([1, 2, 3, 4]); // the map's area kept
    expect(loadCachedCourse(id)?.fixed).toBe('2026-11-13');
  });
});
