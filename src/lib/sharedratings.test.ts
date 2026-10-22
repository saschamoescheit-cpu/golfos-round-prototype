import { beforeEach, describe, expect, it } from 'vitest';
import { agreed, sharedRating } from './sharedratings';
import { ratingFor } from './handicap';

// Course rating and slope shared between players (night run 22./23.10.2026): what most players entered counts.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe('shared course ratings', () => {
  beforeEach(() => store.clear());
  it('the value most players agree on; on a tie the newest', () => {
    expect(agreed([{ tee: 'Yellow', loops: 'Main', lady: false, cr: 70.1, slope: 128 }, { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.4, slope: 129 }, { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.4, slope: 129 }])).toEqual({ cr: 70.4, slope: 129 });
    expect(agreed([{ tee: 'Red', loops: 'Main', lady: false, cr: 66, slope: 120, updated_at: '2026-10-01' }, { tee: 'Red', loops: 'Main', lady: false, cr: 66.4, slope: 121, updated_at: '2026-10-20' }])).toEqual({ cr: 66.4, slope: 121 });
  });
  it('a course without bundled values gets the shared ones – men and ladies apart', () => {
    store.set('golfos.sharedratings.v1.osm:way/119442124', JSON.stringify([
      { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.6, slope: 131 },
      { tee: 'Red', loops: 'Main', lady: true, cr: 72.3, slope: 128 },
    ]));
    const holes = Array.from({ length: 18 }, () => ({ loop: 'Main' }));
    expect(ratingFor('osm:way/119442124', 'Yellow', holes)).toEqual({ cr: 70.6, slope: 131 });
    expect(ratingFor('osm:way/119442124', 'Red', holes, true)).toEqual({ cr: 72.3, slope: 128 });
    expect(ratingFor('osm:way/119442124', 'Red', holes, false)).toBeNull();
    expect(sharedRating('osm:way/119442124', 'Yellow', 'Main', true)).toBeNull();
  });
  it('the own value still wins', () => {
    store.set('golfos.sharedratings.v1.c1', JSON.stringify([{ tee: 'Yellow', loops: 'Main', lady: false, cr: 70.6, slope: 131 }]));
    store.set('golfos.ratings.v1', JSON.stringify({ 'c1|Yellow|Main': { cr: 71, slope: 133 } }));
    expect(ratingFor('c1', 'Yellow', [{ loop: 'Main' }])).toEqual({ cr: 71, slope: 133 });
  });
});
