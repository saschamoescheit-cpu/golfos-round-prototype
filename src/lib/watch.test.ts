import { describe, expect, it } from 'vitest';
import { addWatchShot, removeWatchShot, watchRound, type WatchShot } from './watch';
import type { HoleMapData } from './geo';
import type { LngLat, Round } from '../types';

// The Apple Watch's swings in the round (Sascha 08.11.2026: "the phone often lies in the cart").
const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [9.69 + (east * M) / Math.cos((48.78 * Math.PI) / 180), 48.78 + north * M];
const hole: HoleMapData = {
  line: [at(0, 0), at(0, 360)], tee: at(0, 0), green: [at(-15, 345), at(15, 345), at(15, 375), at(-15, 375), at(-15, 345)], greenCenter: at(0, 360),
  bunkers: [], water: [], fairways: [], tees: [],
};
const round = { id: 'r1', courseId: 'c', holes: [{ label: '1', par: 4 }, { label: '2', par: 3 }], players: [], entries: {}, startHole: 0 } as unknown as Round;
const swing = (id: string, t: number, p: LngLat | null, hit = true, manual = false): WatchShot => ({
  id, round: 'r1', hole: 0, t, lng: p ? p[0] : null, lat: p ? p[1] : null, acc: 4, peak: 24, jolt: hit ? 5 : 0, full: true, hit, manual,
});

describe('the round on the watch', () => {
  it('holes with tee, green middle and outline, a hole without a map as null', () => {
    const w = watchRound(round, [hole, null], 'm', 'de');
    expect(w.holes[0]?.par).toBe(4);
    expect(w.holes[0]?.green?.length).toBeLessThanOrEqual(24);
    expect(w.holes[1]).toBeNull();
    expect(w.start).toBe(0);
  });
});

describe('a swing from the watch', () => {
  it('becomes a "shot here" at the watch\'s place – once', () => {
    const a = addWatchShot(round, swing('w1', 1000, at(0, 2)), 0, null);
    expect(a.manualShots).toHaveLength(1);
    expect(a.manualShots![0].watch).toBe('w1');
    expect(addWatchShot(a, swing('w1', 1000, at(0, 2)), 0, null)).toBe(a);
  });

  it('without the watch\'s place: where the phone was – without either: nothing', () => {
    const a = addWatchShot(round, swing('w1', 1000, null), 0, { pos: at(0, 5), accuracy: 6 });
    expect(a.manualShots![0].pos).toEqual(at(0, 5));
    expect(addWatchShot(round, swing('w2', 1000, null), 0, null)).toBe(round);
  });

  it('a practice swing, then the shot at the same spot: one shot, the later one', () => {
    let r = addWatchShot(round, swing('w1', 1000, at(0, 2), false), 0, null);
    r = addWatchShot(r, swing('w2', 31000, at(1, 3), true), 0, null);
    expect(r.manualShots).toHaveLength(1);
    expect(r.manualShots![0].watch).toBe('w2');
    expect(r.manualShots![0].also).toEqual(['w1']);
  });

  it('a swing after the shot that felt no ball: the shot stays', () => {
    let r = addWatchShot(round, swing('w1', 1000, at(0, 2), true), 0, null);
    r = addWatchShot(r, swing('w2', 20000, at(0, 3), false), 0, null);
    expect(r.manualShots).toHaveLength(1);
    expect(r.manualShots![0].watch).toBe('w1');
  });

  it('the next shot 230 m on, or one noted on the watch by hand: a shot of its own', () => {
    let r = addWatchShot(round, swing('w1', 1000, at(0, 2)), 0, null);
    r = addWatchShot(r, swing('w2', 200000, at(0, 232)), 0, null);
    r = addWatchShot(r, swing('w3', 230000, at(0, 233), true, true), 0, null);
    expect(r.manualShots).toHaveLength(3);
  });

  it('taken back on the watch: gone', () => {
    const r = addWatchShot(round, swing('w1', 1000, at(0, 2)), 0, null);
    expect(removeWatchShot(r, 'w1').manualShots).toHaveLength(0);
    expect(removeWatchShot(r, 'nope')).toBe(r);
  });
});
