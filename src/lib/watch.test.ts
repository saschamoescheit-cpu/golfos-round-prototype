import { afterEach, describe, expect, it, vi } from 'vitest';
import { addWatchShot, endWatchRoundIfGone, removeWatchShot, watchHoleFor, watchRound, type WatchShot } from './watch';
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

// Sascha 08.11.2026: "the hole's picture on the watch beside the score and the distances"
describe('the hole drawn on the watch', () => {
  it('in metres from the tee, the green straight up', async () => {
    const { watchMap } = await import('./watch');
    // a hole running north-east: the green 300 m away at 45°
    const d = 300 / Math.SQRT2;
    const h: HoleMapData = { ...hole, line: [at(0, 0), at(d, d)], greenCenter: at(d, d), green: [at(d - 10, d), at(d, d + 10), at(d + 10, d), at(d, d - 10)] };
    const m = watchMap(h, h.greenCenter);
    expect(Math.round(m.b)).toBe(45);
    const end = m.line[m.line.length - 1];
    expect(Math.abs(end[0])).toBeLessThanOrEqual(1); // straight ahead
    expect(end[1]).toBeGreaterThan(295);
    expect(end[1]).toBeLessThan(305);
    expect(m.line[0]).toEqual([0, 0]);
  });
  it('small enough for the watch: 18 holes of Hetzenhof under 40 kB', async () => {
    const { SEED_GEOMETRY } = await import('../data/seedGeometry');
    const { holeMapData } = await import('./geo');
    const geo = SEED_GEOMETRY['osm:relation/1326323'];
    const maps = ['A', 'B'].flatMap((loop) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => holeMapData(geo, loop, n)));
    const r18 = { ...round, holes: maps.map((_, k) => ({ label: String(k + 1), par: 4 })) } as unknown as Round;
    const w = watchRound(r18, maps, 'm', 'de');
    const json = JSON.stringify(w);
    expect(w.holes.filter((x) => x?.map).length).toBeGreaterThan(12);
    expect(json.length).toBeLessThan(40000);
    const first = w.holes.find((x) => x?.map)!;
    expect(first.map!.fairways.length + first.map!.bunkers.length + (first.map!.green ? 1 : 0)).toBeGreaterThan(0);
  });
});

// Sascha 08.11.2026: "Erik saves or deletes the round on the phone, on the watch it is still there – opening the app
// again, he is on the hole the watch still shows"
describe('the round on the watch and on the phone', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  afterEach(() => vi.unstubAllGlobals());
  it('a hole changed on the watch moves only its own round, and only within a minute of the watch’s time', () => {
    const now = 1_000_000;
    expect(watchHoleFor({ hole: 4, t: now - 5000, round: 'r1' }, 'r1', 18, now)).toBe(true);
    expect(watchHoleFor({ hole: 4, t: now - 5000, round: 'old' }, 'r1', 18, now)).toBe(false);
    expect(watchHoleFor({ hole: 4, t: now - 120000, round: 'r1' }, 'r1', 18, now)).toBe(false);
    expect(watchHoleFor({ hole: 20, t: now, round: 'r1' }, 'r1', 18, now)).toBe(false);
    expect(watchHoleFor({ hole: 4, t: now - 5000 }, 'r1', 18, now)).toBe(true); // an older watch app: no round
  });
  it('the round sent to the watch deleted or finished: the watch is told once – while it runs, not', () => {
    vi.stubGlobal('localStorage', mem());
    vi.stubGlobal('sessionStorage', mem());
    localStorage.setItem('golfos.watch.round', 'r1');
    localStorage.setItem('golfos.watch.started.r1', '1');
    expect(endWatchRoundIfGone([{ id: 'r1', finishedAt: null }])).toBe(false);
    expect(endWatchRoundIfGone([{ id: 'r1', finishedAt: '2026-11-08T17:00:00Z' }])).toBe(true);
    expect(localStorage.getItem('golfos.watch.started.r1')).toBeNull(); // brought back: its workout starts again
    expect(endWatchRoundIfGone([])).toBe(false); // told already
    localStorage.setItem('golfos.watch.round', 'r2');
    expect(endWatchRoundIfGone([{ id: 'r1', finishedAt: null }])).toBe(true); // deleted
  });
});
