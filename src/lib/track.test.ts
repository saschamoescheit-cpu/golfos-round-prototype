import { describe, expect, it } from 'vitest';
import { clubForLength, detectHoleShots, detectWithScore, markWaterPenalties, findStops, splitRound, teeSpot, trackForHole, type TrackPoint } from './track';
import { distanceM, holeMapData, lineLength, pointAt } from './geo';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import type { LngLat } from '../types';

// Simulated rounds: the player walks at 1.3 m/s, one GPS fix every 5 s with ±2 m noise.
const geo = SEED_GEOMETRY['osm:relation/1654444'];
const hole1 = holeMapData(geo, 'Main', 1)!;
const hole2 = holeMapData(geo, 'Main', 2)!;
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const shift = (p: LngLat, east: number, north: number): LngLat => [p[0] + east / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + north / 111320];
const noisy = (p: LngLat, m = 2): LngLat => shift(p, (rnd() - 0.5) * 2 * m, (rnd() - 0.5) * 2 * m);

class Walker {
  t = 0;
  pts: TrackPoint[] = [];
  constructor(public at: LngLat) {}
  stand(s: number) {
    for (let k = 0; k <= s; k += 5) this.fix(this.at);
  }
  walk(to: LngLat) {
    const d = distanceM(this.at, to);
    const steps = Math.max(1, Math.round(d / 1.3 / 5));
    const from = this.at;
    for (let k = 1; k <= steps; k++) this.fix([from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps]);
    this.at = to;
  }
  private fix(p: LngLat, acc = 5) {
    this.t += 5000;
    this.pts.push({ t: this.t, p: noisy(p), acc });
  }
}

describe('shot detection from the GPS track', () => {
  const ball2 = shift(pointAt(hole1.line, 225), 8, 0); // drive 225 m, a bit right
  const onGreen = shift(hole1.greenCenter, 2, -4);

  it('finds the stops of a walk', () => {
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(ball2);
    w.stand(30);
    expect(findStops(w.pts).length).toBe(2);
  });

  it('par 4: tee shot and approach, ball on the green; waiting and a detour are ignored', () => {
    const w = new Walker(shift(hole1.tee, -15, -10));
    w.stand(200); // waiting next to the tee for the group in front
    w.walk(hole1.tee);
    w.stand(35); // tee shot
    w.walk(shift(ball2, -90, 0)); // detour to the cart path, 90 m off the hole
    w.stand(60);
    w.walk(ball2);
    w.stand(25); // practice swing next to the ball
    w.walk(shift(ball2, 4, 3));
    w.stand(20); // the approach
    w.walk(onGreen);
    w.stand(90); // putting
    const d = detectHoleShots(w.pts, hole1, 4)!;
    expect(d.shots.length).toBe(2);
    expect(distanceM(d.shots[0].pos!, hole1.tee)).toBeLessThan(6);
    expect(distanceM(d.shots[1].pos!, ball2)).toBeLessThan(8);
    expect(d.shots[0].lie).toBe('tee');
    expect(d.shots[0].club).toBe('Dr');
    expect(d.shots.every((s) => s.review)).toBe(true);
    expect(distanceM(d.onGreen!, onGreen)).toBeLessThan(6);
  });

  it('ignores fixes with poor accuracy', () => {
    const w = new Walker(hole1.tee);
    w.stand(30);
    const bad = w.pts.length;
    w.walk(ball2);
    w.stand(30);
    const pts = w.pts.map((x, k) => (k >= bad ? { ...x, acc: 40 } : x));
    expect(findStops(pts).length).toBe(1);
  });

  it('cuts the round track into holes at the next tee', () => {
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(onGreen);
    w.stand(60);
    w.walk(hole2.tee);
    w.stand(30);
    const part = trackForHole(w.pts, hole1, hole2);
    expect(part.length).toBeGreaterThan(10);
    expect(distanceM(part[part.length - 1].p, hole2.tee)).toBeGreaterThan(20);
  });

  it('walking slowly with noisy GPS (fix every 2.5 s, ±4 m) is no stop', () => {
    const pts: TrackPoint[] = [];
    for (let k = 0; k < 80; k++) pts.push({ t: k * 2500, p: noisy(pointAt(hole1.line, 20 + k * 3), 4), acc: 6 });
    expect(findStops(pts).length).toBe(0);
  });

  it('waiting by a partner ball on the way is not taken for a shot', () => {
    const w = new Walker(hole1.tee);
    w.stand(30); // tee shot
    w.walk(shift(pointAt(hole1.line, 120), -22, 0)); // partner's ball, left of the line
    w.stand(25);
    w.walk(ball2);
    w.stand(30); // own ball: the approach
    w.walk(onGreen);
    w.stand(90);
    const d = detectHoleShots(w.pts, hole1, 4)!;
    expect(d.shots.length).toBe(2);
    expect(distanceM(d.shots[1].pos!, ball2)).toBeLessThan(8);
  });

  it('phone in the pocket between shots, opened at the ball: the shots are found', () => {
    const pts: TrackPoint[] = [];
    let t = 0;
    const at = (p: LngLat, s: number, open = false) => {
      for (let k = 0; k < s; k += 5) {
        pts.push({ t, p: noisy(p), acc: 6, ...(open && k === 0 ? { open: true } : {}) });
        t += 5000;
      }
    };
    at(hole1.tee, 30, true);
    t += 150000; // walking, phone locked
    at(ball2, 30, true);
    t += 120000;
    at(onGreen, 90, true);
    const d = detectHoleShots(pts, hole1, 4)!;
    expect(d.shots.length).toBe(2);
    expect(distanceM(d.shots[1].pos!, ball2)).toBeLessThan(8);
    expect(distanceM(d.onGreen!, onGreen)).toBeLessThan(8);
  });

  it('score and putts from the course decide a doubtful chip', () => {
    const chip = shift(hole1.greenCenter, 0, -22); // just off the green, short
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(ball2);
    w.stand(30);
    w.walk(chip);
    w.stand(15); // a quick chip
    w.walk(onGreen);
    w.stand(90);
    const withCount = detectHoleShots(w.pts, hole1, 4, undefined, { shots: 3 })!;
    expect(withCount.shots.length).toBe(3);
    expect(distanceM(withCount.shots[2].pos!, chip)).toBeLessThan(8);
    const told2 = detectHoleShots(w.pts, hole1, 4, undefined, { shots: 2 })!;
    expect(told2.shots.length).toBe(2);
  });

  it('a chip without any GPS fix (phone stayed in the pocket) is suggested at the green edge', () => {
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(ball2);
    w.stand(30);
    w.walk(onGreen); // past the chip spot without stopping
    w.stand(90);
    const found = detectHoleShots(w.pts, hole1, 4, undefined, { shots: 3 })!;
    expect(found.shots.length).toBe(3);
    const chip = found.shots[2];
    expect(chip.review).toBe(true);
    expect(distanceM(chip.pos!, hole1.greenCenter)).toBeLessThan(35);
    expect(distanceM(chip.pos!, hole1.greenCenter)).toBeGreaterThan(5);
    // without the score nothing is invented
    expect(detectHoleShots(w.pts, hole1, 4)!.shots.length).toBe(2);
  });

  it('splits a round in playing order', () => {
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(onGreen);
    w.stand(60);
    w.walk(hole2.tee);
    w.stand(30);
    w.walk(hole2.greenCenter);
    w.stand(60);
    const [a, b] = splitRound(w.pts, [hole1, hole2]);
    expect(a.length).toBeGreaterThan(5);
    expect(b.length).toBeGreaterThan(5);
    expect(a[a.length - 1].t).toBeLessThan(b[0].t + 1);
  });

  it('the next tee right next to the green still ends the hole (Hetzenhof 4A → 5A)', () => {
    const near = { ...hole2, tee: shift(hole1.greenCenter, 30, 0) }; // next tee 30 m from this green's centre
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(onGreen);
    w.stand(60);
    w.walk(near.tee);
    w.stand(40);
    w.walk(shift(near.tee, 0, 150));
    w.stand(30);
    const [a, b] = splitRound(w.pts, [hole1, near]);
    expect(b.length).toBeGreaterThan(5);
    expect(a.every((x) => distanceM(x.p, near.tee) > 5 || distanceM(x.p, hole1.greenCenter) < distanceM(x.p, near.tee))).toBe(true);
  });

  it('club from the shot length', () => {
    expect(clubForLength(228, true)).toBe('Dr');
    expect(clubForLength(228, false)).toBe('3W');
    expect(clubForLength(131, false)).toBe('7i');
  });
});

import { autoShot } from './track';
describe('automatic shot length', () => {
  const ball2 = shift(pointAt(hole1.line, 225), 8, 0);
  const ball3 = shift(pointAt(hole1.line, 330), -4, 0);
  it('app closed on the tee, opened at the ball: length from the tee', () => {
    const r = autoShot([], hole1, ball2)!;
    expect(r.fromTee).toBe(true);
    expect(Math.abs(r.length - 225)).toBeLessThan(5);
  });
  it('the tee shot is measured from where the player stood on the tee, not from the tee of the map', () => {
    const realTee = shift(hole1.tee, -12, 6); // the yellow box beside the mapped tee point
    const w = new Walker(realTee);
    w.stand(40);
    w.walk(ball2);
    expect(distanceM(teeSpot(w.pts, hole1)!, realTee)).toBeLessThan(4);
    const r = autoShot(w.pts, hole1, ball2)!;
    expect(r.fromTee).toBe(true);
    expect(Math.abs(r.length - distanceM(realTee, ball2))).toBeLessThan(4);
    // nothing recorded on the tee: the tee of the map
    expect(teeSpot([], hole1)).toBeNull();
  });
  it('app looked at by the ball, put away, opened at the next ball: length of that shot', () => {
    const w = new Walker(hole1.tee);
    w.stand(20);
    w.at = ball2; // walked with the phone in the pocket (no fixes)
    w.t += 120000;
    w.stand(10); // opened by the ball, checked the caddie
    w.t += 90000; // phone away, shot, walked
    const r = autoShot(w.pts, hole1, ball3)!;
    expect(r.fromTee).toBe(false);
    expect(Math.abs(r.length - distanceM(ball2, ball3))).toBeLessThan(5);
  });
  it('a stop before the tee of this hole (the green next door) does not start the shot', () => {
    const w = new Walker(shift(pointAt(hole1.line, 150), 30, 0)); // putting on a neighbouring green beside the fairway
    w.stand(90);
    w.walk(hole1.tee);
    w.stand(20); // tee shot, then the phone goes into the pocket
    w.t += 150000;
    const r = autoShot(w.pts, hole1, ball2)!;
    expect(r.fromTee).toBe(true);
  });
  it('the app opened by the ball counts as where the last shot came from', () => {
    const pts: TrackPoint[] = [
      { t: 0, p: hole1.tee, acc: 5 },
      { t: 200000, p: ball2, acc: 6, open: true }, // a quick look by the ball, then the shot
    ];
    const r = autoShot(pts, hole1, ball3)!;
    expect(r.fromTee).toBe(false);
    expect(Math.abs(r.length - distanceM(ball2, ball3))).toBeLessThan(2);
  });
  it('still on the tee: no shot', () => {
    expect(autoShot([], hole1, hole1.tee)).toBeNull();
  });
});

describe('penalties from the course', () => {
  it('the shot over water gets the water penalty and where the ball went in', () => {
    const M = 1 / 111320;
    const k = Math.cos((48.78 * Math.PI) / 180);
    const at = (e: number, n: number): LngLat => [9.69 + (e * M) / k, 48.78 + n * M];
    const pond = [at(-20, 150), at(20, 150), at(20, 180), at(-20, 180), at(-20, 150)];
    const hole = { line: [at(0, 0), at(0, 350)], tee: at(0, 0), green: null, greenCenter: at(0, 350), bunkers: [], water: [pond], fairways: [], tees: [] };
    const d = { shots: [{ pos: at(0, 0), lie: 'tee' as const, club: null, penalty: false }, { pos: at(40, 185), lie: 'rough' as const, club: null, penalty: false }, { pos: at(0, 300), lie: 'fairway' as const, club: null, penalty: false }], onGreen: at(0, 345), pin: null, holedOut: false };
    // the tee shot ends 20 m right of the pond, its flight does not cross it: no water
    expect(markWaterPenalties(d, hole, 1).shots.some((s) => s.penalty)).toBe(false);
    // lateral water: the next shot is played from a drop 7 m beside the pond
    const lateral = { ...d, shots: [d.shots[0], { ...d.shots[1], pos: at(25, 185) }, d.shots[2]] };
    const l = markWaterPenalties(lateral, hole, 1);
    expect(l.shots[0].penalty).toBe(true);
    expect(distanceM(l.shots[0].missPos!, at(20, 180))).toBeLessThan(3);
    // a tee shot straight over the pond to the drop behind it
    const d2 = { ...d, shots: [d.shots[0], { ...d.shots[1], pos: at(0, 190) }, d.shots[2]] };
    const m = markWaterPenalties(d2, hole, 1);
    expect(m.shots[0].penalty).toBe(true);
    expect(m.shots[0].penaltyKind).toBe('water');
    expect(distanceM(m.shots[0].missPos!, at(0, 150))).toBeLessThan(6);
    // no penalty entered: nothing changes
    expect(markWaterPenalties(d2, hole, 0)).toBe(d2);
  });
});

describe('detection with the score from the course', () => {
  const ball2 = shift(pointAt(hole1.line, 225), 8, 0);
  const onGreen = shift(hole1.greenCenter, 2, -4);
  it('out of bounds off the tee: the replay from the tee is no extra place – no chip is invented', () => {
    const w = new Walker(hole1.tee);
    w.stand(40); // tee shot out of bounds, the second ball from the same tee
    w.walk(ball2);
    w.stand(30);
    w.walk(onGreen);
    w.stand(90);
    // 3 swings (tee, tee again, approach) + 1 penalty + 2 putts
    const d = detectWithScore(w.pts, hole1, 4, undefined, { strokes: 6, putts: 2, penalties: 1 })!;
    expect(d.shots.length).toBe(2);
    expect(d.shots.every((s) => !s.penalty)).toBe(true); // the player marks it "out of bounds" in the check
    // without the penalty the same score would mean a missing chip
    expect(detectWithScore(w.pts, hole1, 4, undefined, { strokes: 5, putts: 2, penalties: 0 })!.shots.length).toBe(3);
  });
});

describe('chip from the fringe', () => {
  it('a short stop at the green edge followed by the ball on the green is the chip – with the score', () => {
    const ball2 = shift(pointAt(hole1.line, 225), 8, 0);
    const r = hole1.green ? Math.max(...hole1.green.map((q) => distanceM(q, hole1.greenCenter))) : 12;
    // just inside the green outline on the way in (GPS puts the fringe there), then the ball 9 m further on
    const edge = pointAt(hole1.line, lineLength(hole1.line) - Math.max(3, r - 2));
    const onGreen2 = shift(hole1.greenCenter, 2, 0);
    const w = new Walker(hole1.tee);
    w.stand(30);
    w.walk(ball2);
    w.stand(30);
    w.walk(edge);
    w.stand(20); // the chip
    w.walk(onGreen2);
    w.stand(90); // putting
    const d = detectHoleShots(w.pts, hole1, 4, undefined, { shots: 3 })!;
    expect(d.shots.length).toBe(3);
    expect(distanceM(d.shots[2].pos!, edge)).toBeLessThan(8);
    expect(distanceM(d.onGreen!, onGreen2)).toBeLessThan(8);
  });
});
