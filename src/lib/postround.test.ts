import { describe, expect, it } from 'vitest';
import type { DetailEntry, HoleEntry, LngLat, Round, Shot } from '../types';
import { fromDrop, playedAgain } from './shotfacts';
import { shotChecks } from './reviewchecks';
import { calmLength, clubReports, corridorText, learnFrom } from './clubstats';
import { roundReport } from './roundreport';
import { bestTeeClub, holeHistory } from './holehistory';
import { approachBands, puttMiss, puttMisses } from './approachstats';
import type { HoleMapData } from './geo';

// The round check (Sascha 22.10.2026): what the app notices by itself, what it learns per club, the report.

const O: LngLat = [9.69, 48.78];
/** A point `east` / `north` metres from O. */
const at = (east: number, north: number): LngLat => [O[0] + east / (111320 * Math.cos((O[1] * Math.PI) / 180)), O[1] + north / 111320];
const shot = (p: LngLat, extra: Partial<Shot> = {}): Shot => ({ pos: p, lie: 'fairway', club: '7i', penalty: false, kind: 'full', ...extra });
const square = (e: number, n: number, r: number) => [at(e - r, n - r), at(e + r, n - r), at(e + r, n + r), at(e - r, n + r), at(e - r, n - r)];
const map = (water: LngLat[][] = []): HoleMapData => ({ line: [at(0, 0), at(0, 400)], tee: at(0, 0), green: square(0, 400, 15), greenCenter: at(0, 400), bunkers: [], water, fairways: [], tees: [] });
const detail = (shots: Shot[], onGreen: LngLat | null = at(0, 395), pin: LngLat = at(0, 400)): DetailEntry => ({ shots, onGreen, pin, holedOut: false });

function round(holes: { par: number; strokes: number; putts?: number; detail?: DetailEntry; weather?: HoleEntry['weather'] }[], id = 'r1', createdAt = '2026-10-20T10:00:00Z'): Round {
  return {
    id, createdAt, finishedAt: createdAt, courseId: 'c1', courseName: 'Test', loopOrder: [], mode: 'detail', currentHole: 0,
    holes: holes.map((h, i) => ({ number: i + 1, label: String(i + 1), par: h.par, strokeIndex: i + 1 })) as Round['holes'],
    players: [{ id: 'me', name: 'Ich', playingHandicap: 10, isMe: true }],
    entries: { me: holes.map((h) => ({ strokes: h.strokes, pickedUp: false, putts: h.putts ?? 2, fairway: null, penalties: 0, greensideBunker: false, upAndDown: null, detail: h.detail, weather: h.weather })) },
  } as Round;
}

describe('what a shot tells', () => {
  it('out of bounds and a lost ball are always played again; water only when chosen', () => {
    expect(playedAgain(shot(O, { penalty: true, penaltyKind: 'lost' }))).toBe(true);
    expect(playedAgain(shot(O, { penalty: true, penaltyKind: 'water' }))).toBe(false);
    expect(playedAgain(shot(O, { penalty: true, penaltyKind: 'water', replay: true }))).toBe(true);
  });
  it('the shot after a water penalty without replay is played from a drop', () => {
    const s = [shot(at(0, 0), { penalty: true, penaltyKind: 'water' }), shot(at(0, 150))];
    expect(fromDrop(s, 1)).toBe(true);
    expect(fromDrop([shot(at(0, 0), { penalty: true, penaltyKind: 'ob' }), shot(at(0, 0))], 1)).toBe(false);
  });
});

describe('the round check notices', () => {
  const pond = square(0, 200, 20);
  it('a ball that ends in the water without a penalty', () => {
    const d = detail([shot(at(0, 0)), shot(at(0, 205)), shot(at(0, 300))]);
    expect(shotChecks(d, map([pond])).map((c) => [c.shot, c.kind])).toEqual([[0, 'water']]);
  });
  it('a drop at the edge after flying over the water', () => {
    const d = detail([shot(at(0, 0)), shot(at(0, 224)), shot(at(0, 300))]);
    expect(shotChecks(d, map([pond]))[0]?.kind).toBe('water');
  });
  it('a ball over the water and well beyond: no question', () => {
    const d = detail([shot(at(0, 0)), shot(at(0, 260)), shot(at(0, 330))]);
    expect(shotChecks(d, map([pond]))).toEqual([]);
  });
  it('out of bounds outside the course outline', () => {
    const d = detail([shot(at(0, 0)), shot(at(80, 200)), shot(at(0, 300))]);
    expect(shotChecks(d, map(), [square(0, 200, 60)])[0]?.kind).toBe('ob');
  });
  it('a second ball from the same spot – lost, out of bounds or one point twice?', () => {
    const d = detail([shot(at(0, 0)), shot(at(1, 2)), shot(at(0, 220))]);
    expect(shotChecks(d, map())[0]).toMatchObject({ shot: 0, kind: 'same' });
  });
  it('a water penalty where the map has no water near', () => {
    const d = detail([shot(at(0, 0), { penalty: true, penaltyKind: 'water', missPos: at(0, 120) }), shot(at(0, 130))]);
    expect(shotChecks(d, map([pond]))[0]?.kind).toBe('dry');
  });
});

describe('per club', () => {
  it('into the wind the same swing flies further in calm air', () => {
    // wind from the north (0°), the shot goes north: head wind 20 km/h, 20 °C
    const calm = calmLength(150, at(0, 0), at(0, 150), { tempC: 20, windKmh: 20, windFromDeg: 0 });
    expect(calm).toBeGreaterThan(165);
    expect(calmLength(150, at(0, 0), at(0, 150), undefined)).toBe(150);
  });
  it('learns from good strikes once there are three, else leaves out the mishits', () => {
    expect(learnFrom([{ strike: 'good' }, { strike: 'fat' }, { strike: undefined }]).length).toBe(2);
    expect(learnFrom([{ strike: 'good' }, { strike: 'good' }, { strike: 'good' }, { strike: 'slice' }]).length).toBe(3);
  });
  it('the bag distance from good strikes, the misses and the corridor', () => {
    const holes = [-15, -8, -2, 0, 3, 5, 6].map((side, k) => ({
      par: 3,
      strokes: 3,
      detail: detail([shot(at(0, 0), { club: '7i', strike: k < 3 ? 'good' : k === 6 ? 'fat' : 'good' }), shot(at(side, 140 + k))], null),
    }));
    // the last shot of each hole ends on the green: use onGreen as the end
    holes.forEach((h) => (h.detail!.onGreen = h.detail!.shots[1].pos));
    holes.forEach((h) => (h.detail!.shots = [h.detail!.shots[0]]));
    const rep = clubReports([round(holes)]).find((c) => c.club === '7i')!;
    expect(rep.shots).toBe(7);
    expect(rep.basis).toBe('good');
    expect(rep.misses.fat).toBe(1);
    expect(rep.corridor).not.toBeNull();
    expect(rep.corridor!.lo).toBeLessThan(0);
    expect(rep.corridor!.hi).toBeGreaterThan(0);
    expect(corridorText({ lo: -15, hi: 5 }, (_e, d) => d)).toBe('15 m links bis 5 m rechts');
    expect(corridorText({ lo: 5, hi: 25 }, (_e, d) => d)).toBe('5 bis 25 m rechts');
  });
});

describe('the round report', () => {
  it('names the most expensive holes and why', () => {
    const r = round([
      { par: 4, strokes: 6, putts: 2, detail: detail([shot(at(0, 0), { club: 'Dr', lie: 'tee', penalty: true, penaltyKind: 'water', missPos: at(0, 200) }), shot(at(0, 190), { lie: 'rough' }), shot(at(0, 330))]) },
      { par: 3, strokes: 5, putts: 3, detail: detail([shot(at(0, 0), { lie: 'tee' }), shot(at(0, 140))]) },
      { par: 4, strokes: 4, putts: 2, detail: detail([shot(at(0, 0), { club: 'Dr', lie: 'tee' }), shot(at(0, 250))]) },
    ]);
    const rep = roundReport(r)!;
    expect(rep.costly.map((c) => c.hole)).toEqual(['1', '2']);
    expect(rep.costly[0].cause).toMatch(/Abschlag – Wasser|tee shot – water/);
    expect(rep.costly[1].cause).toMatch(/3 Putts|3 putts/);
    expect(rep.areas).toHaveLength(5);
  });
});

describe('a hole over all rounds', () => {
  const mk = (id: string, club: 'Dr' | '4i', strokes: number) => round([{ par: 4, strokes, detail: detail([shot(at(0, 0), { club, lie: 'tee' }), shot(at(0, 200))]) }], id);
  it('the tee club that served best', () => {
    const rs = [mk('a', 'Dr', 6), mk('b', 'Dr', 5), mk('c', '4i', 4), mk('d', '4i', 5)];
    const h = holeHistory(rs, 'c1', '1', () => ({}));
    expect(h.rounds).toBe(4);
    expect(h.byTeeClub[0]).toMatchObject({ club: '4i', rounds: 2, avgToPar: 0.5 });
    expect(bestTeeClub(h)?.club).toBe('4i');
  });
});

describe('approaches and putts', () => {
  it('a putt past the hole and right of the line', () => {
    expect(puttMiss(at(0, -6), at(0, 0), at(0.5, 1))).toEqual({ length: 'long', line: 'right' });
    expect(puttMiss(at(0, -6), at(0, 0), at(-0.1, -1))).toEqual({ length: 'short', line: null });
  });
  it('placed putts and the told first putt count', () => {
    const r = round([{ par: 3, strokes: 4, putts: 3 }, { par: 4, strokes: 5, putts: 2 }]);
    r.entries.me[0].puttsAt = { pin: at(0, 0), balls: [at(0, -6), at(0, 1), at(0.4, 0.2)] };
    r.entries.me[1].firstPuttMiss = { length: 'short', line: 'left' };
    expect(puttMisses([r])).toEqual({ missed: 3, short: 2, long: 1, left: 2, right: 0 });
  });
  it('approaches by distance; a layup is no approach', () => {
    const r = round([
      { par: 4, strokes: 4, detail: detail([shot(at(0, 0), { club: 'Dr', lie: 'tee' }), shot(at(0, 280))], at(0, 394)) },
      { par: 5, strokes: 5, detail: detail([shot(at(0, 0), { club: 'Dr', lie: 'tee' }), shot(at(0, 160), { intent: 'layup' }), shot(at(0, 310))], at(0, 380)) },
    ]);
    const bands = approachBands([r]);
    expect(bands.find((b) => b.label === '100–150 m')).toMatchObject({ shots: 1, greens: 1, avgProximity: 6 });
    expect(bands.find((b) => b.label === '200+ m')!.shots).toBe(0);
  });
});
