import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addWatchShot, endWatchIfIdle, warmUpSwing, watchPlaceWins, endWatchRoundIfGone, removeWatchShot, watchHoleFor, watchRound, type WatchShot } from './watch';
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
describe('warming up on the range (Sascha 09.11.2026 at Kissimmee Bay: 11:27 and 11:47, the tee time 12:08)', () => {
  const teeTime = Date.parse('2026-11-09T12:08:00');
  const t = (hm: string) => Date.parse(`2026-11-09T${hm}:00`);
  const tees = [at(0, 0), at(300, 400)];
  const me = { ...round, players: [{ id: 'p', name: 'Erik', isMe: true }], entries: { p: [null, null] } } as unknown as Round;
  it('before the tee time (more than 10 minutes): not counted', () => {
    expect(warmUpSwing(me, swing('a', t('11:47'), at(0, 2)), { pos: at(0, 2), tees, teeTime })).toBe('early');
    expect(warmUpSwing(me, swing('a', t('12:00'), at(0, 2)), { pos: at(0, 2), tees, teeTime })).toBeNull();
  });
  it('on the range – 150 m from every tee – not counted; at a tee it is the first shot', () => {
    expect(warmUpSwing(me, swing('a', t('12:05'), at(-150, 0)), { pos: at(-150, 0), tees, teeTime: null })).toBe('away');
    expect(warmUpSwing(me, swing('a', t('12:05'), at(5, 3)), { pos: at(5, 3), tees, teeTime: null })).toBeNull();
    // starting on another hole's tee
    expect(warmUpSwing(me, swing('a', t('12:05'), at(300, 395)), { pos: at(300, 395), tees, teeTime: null })).toBeNull();
  });
  it('a crack the phone heard counts as the round begun – the next swing on the fairway is a shot', () => {
    const heard = { ...me, soundShots: [{ hole: 0, pos: at(0, 2), t: t('12:09'), level: 0.5, acc: 4 }] } as unknown as Round;
    expect(warmUpSwing(heard, swing('a', t('12:12'), at(-150, 0)), { pos: at(-150, 0), tees, teeTime })).toBeNull();
  });
  it('once the round has a shot or a score, a shot by hand on the watch, or no map: counted as ever', () => {
    const shot = addWatchShot(me, swing('w', t('12:09'), at(0, 2)), 0, null);
    expect(warmUpSwing(shot, swing('a', t('12:20'), at(-150, 0)), { pos: at(-150, 0), tees, teeTime })).toBeNull();
    const scored = { ...me, entries: { p: [{ strokes: 4 }, null] } } as unknown as Round;
    expect(warmUpSwing(scored, swing('a', t('11:00'), at(-150, 0)), { pos: at(-150, 0), tees, teeTime })).toBeNull();
    expect(warmUpSwing(me, swing('a', t('11:00'), at(-150, 0), true, true), { pos: at(-150, 0), tees, teeTime })).toBeNull();
    expect(warmUpSwing(me, swing('a', t('12:05'), at(-150, 0)), { pos: at(-150, 0), tees: [null, null], teeTime: null })).toBeNull();
  });
});

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
    // Hetzenhof alone (15.11.2026: every bundled course at once got slow with the Florida crowns and fairways)
    const { SEED_LOADERS } = await import('../data/seedLoaders');
    const { holeMapData } = await import('./geo');
    const geo = await SEED_LOADERS['osm:relation/1326323']();
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

// Sascha 16.11.2026: "Auf der Apple Watch wäre es gut, wenn die Grün-Slopes kommen, wenn der Spieler auf dem Grün ist" –
// "auch die Anzeige vom Wind"
describe("the green's slope and the wind on the watch", () => {
  // a green rising 2 cm a metre to the south: the ball runs north – straight up the picture of a hole played north
  const grid = (cmPerM: number) => {
    const size = 40;
    return {
      corners: [at(-20, 380), at(20, 380), at(20, 340), at(-20, 340)] as [LngLat, LngLat, LngLat, LngLat],
      size,
      cell: 1,
      base: 300,
      cm: Array.from({ length: size * size }, (_, k) => Math.floor(k / size) * cmPerM),
    };
  };
  it("a fall line every 4 m inside the green, downhill and its percent in the hole's picture", async () => {
    const { watchSlope } = await import('./watch');
    const s = watchSlope(hole, grid(2), hole.greenCenter)!;
    expect(s.s).toBe(4);
    expect(s.a.length).toBeGreaterThan(30); // 30 × 30 m: about 56
    expect(s.a.length).toBeLessThan(80);
    expect(s.a.every(([, , d, p]) => (d < 3 || d > 357) && p === 20)).toBe(true); // up the picture, 2.0 %
    expect(s.pct).toBe(2);
    expect(s.down === 0 || s.down === 360).toBe(true);
    expect(s.pin[0]).toBe(0);
    expect(Math.abs(s.pin[1] - 360)).toBeLessThanOrEqual(3);
    // every point inside the green
    expect(s.a.every(([x, y]) => Math.abs(x) <= 15 && y >= 342 && y <= 375)).toBe(true);
  });
  it('the ball running east is to the right in the picture of a hole played north', async () => {
    const { watchSlope } = await import('./watch');
    const g = grid(0);
    const size = g.size;
    g.cm = Array.from({ length: size * size }, (_, k) => (size - 1 - (k % size)) * 3); // higher in the west
    const s = watchSlope(hole, g, hole.greenCenter)!;
    expect(Math.abs(s.down - 90)).toBeLessThanOrEqual(2);
    expect(s.pct).toBe(3);
  });
  it('without heights or a green: no slope, the round as before', async () => {
    const { watchSlope } = await import('./watch');
    expect(watchSlope({ ...hole, green: null }, grid(2), hole.greenCenter)).toBeNull();
    const w = watchRound(round, [hole, null], 'm', 'de');
    expect(w.holes[0]).not.toHaveProperty('slope');
    expect(w).not.toHaveProperty('wind');
  });
  it('the round with the slope of its hole and the wind of the moment', () => {
    const w = watchRound(round, [hole, null], 'm', 'de', [], { grids: { '1': grid(2) }, wind: { windKmh: 12.4, gustKmh: 24.6, windFromDeg: 271.2 }, now: 5000 });
    expect(w.holes[0]?.slope?.pct).toBe(2);
    expect(w.wind).toEqual({ kmh: 12, gust: 25, from: 271, t: 5000 });
  });
  it("18 holes of Hetzenhof with their greens' slopes still small for the watch (under 60 kB)", async () => {
    const { SEED_LOADERS } = await import('../data/seedLoaders');
    const { holeMapData } = await import('./geo');
    const { readFileSync } = await import('node:fs');
    const grids = JSON.parse(readFileSync('public/greens/hetzenhof/heights.json', 'utf8'));
    const geo = await SEED_LOADERS['osm:relation/1326323']();
    const refs = ['A', 'B'].flatMap((loop) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ loop, n })));
    const maps = refs.map(({ loop, n }) => holeMapData(geo, loop, n));
    const r18 = { ...round, holes: refs.map(({ loop, n }) => ({ label: `${n}${loop}`, par: 4 })) } as unknown as Round;
    const w = watchRound(r18, maps, 'm', 'de', [], { grids, wind: { windKmh: 10, gustKmh: 20, windFromDeg: 250 } });
    const withSlope = w.holes.filter((x) => x?.slope);
    expect(withSlope.length).toBeGreaterThan(12);
    expect(withSlope.every((x) => x!.slope!.a.length >= 3 && x!.slope!.pct < 10)).toBe(true);
    expect(JSON.stringify(w).length).toBeLessThan(60000);
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

// Sascha 09.11.2026: "the phone in the cart, the player at the ball with the watch only" – the crack heard on the wrist,
// and the watch's own track in place of the phone's
describe('the crack heard on the wrist', () => {
  it('a short chip without the jolt, its crack heard: the shot – a swing after it at the spot does not replace it', () => {
    const p = at(0, 200);
    const chip = { ...swing('c1', 1000, p, false), sound: true };
    const r1 = addWatchShot(round, chip, 0, null);
    expect(r1.manualShots?.[0]).toMatchObject({ watch: 'c1', hit: true });
    const r2 = addWatchShot(r1, swing('c2', 20000, p, false), 0, null);
    expect(r2.manualShots).toHaveLength(1);
    expect(r2.manualShots?.[0]).toMatchObject({ watch: 'c1', also: ['c2'] });
  });
});

// Sascha 09.11.2026: "the deleted round is still on the watch" – the watch told again whenever nothing runs
describe('nothing running: the watch told again', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  beforeEach(() => {
    vi.stubGlobal('localStorage', store());
    vi.stubGlobal('sessionStorage', store());
  });
  afterEach(() => vi.unstubAllGlobals());
  it('only once a watch was used with this phone; not while a round of Rounds, a game or a pool runs', () => {
    localStorage.removeItem('golfos.watch.used');
    expect(endWatchIfIdle([])).toBe(false); // never a watch: nothing to tell
    localStorage.setItem('golfos.watch.used', '1');
    expect(endWatchIfIdle([{ id: 'g-round', finishedAt: null }])).toBe(false); // a game on the map runs
    expect(endWatchIfIdle([{ id: 'r1', finishedAt: '2026-11-09T20:00:00Z' }])).toBe(true);
    expect(endWatchIfIdle([])).toBe(true); // and again – the first may not have reached the watch
  });
  it("a game's round sent to the watch is not taken for gone (it is not in Rounds' list)", () => {
    localStorage.setItem('golfos.watch.round', 'g-round');
    expect(endWatchRoundIfGone([{ id: 'r9', finishedAt: null }, { id: 'g-round', finishedAt: null }])).toBe(false);
  });
});

describe("the watch's live place (Sascha 10.11.2026: Erik's dot on the road – the phone in the cart)", () => {
  const now = 1_000_000;
  it('the phone 55 m away in the cart: the watch is the player', () => {
    expect(watchPlaceWins({ pos: at(0, 0), accuracy: 5, t: now - 3000 }, { pos: at(55, 0), accuracy: 6 }, now)).toBe(true);
  });
  it('phone and watch together, or the watch quiet for 15 s: the phone as ever', () => {
    expect(watchPlaceWins({ pos: at(0, 0), accuracy: 5, t: now - 3000 }, { pos: at(8, 0), accuracy: 6 }, now)).toBe(false);
    expect(watchPlaceWins({ pos: at(0, 0), accuracy: 5, t: now - 20000 }, { pos: at(55, 0), accuracy: 6 }, now)).toBe(false);
  });
});

describe('a swing without a place of its own (night 10./11.11.2026: from hole 10 on nothing was recorded)', () => {
  it('takes the round\'s last place before it, however old – its accuracy says how far off it may be', async () => {
    const { lastFixBefore } = await import('./track');
    const track = [{ t: 1000, p: at(0, 0), acc: 4 }, { t: 61000, p: at(0, 100), acc: 5 }];
    expect(lastFixBefore(track, 121000)).toEqual({ pos: at(0, 100), accuracy: 60 });
    expect(lastFixBefore(track, 62000)?.accuracy).toBe(5);
    expect(lastFixBefore([], 1000)).toBeNull();
  });
});
