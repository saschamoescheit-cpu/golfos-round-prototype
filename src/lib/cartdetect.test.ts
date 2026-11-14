import { describe, expect, it } from 'vitest';
import { detectWithScore, rodeCart, shortOfFull, type TrackPoint } from './track';
import { onGreenAt } from './shots';
import { distanceM, holeMapData, pointAt, type HoleMapData } from './geo';
import { holeForTee } from './teeline';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import type { LngLat } from '../types';
import fixture from './cartrounds.fixture.json';

// Shot detection in a cart (Sascha 14.11.2026): a few holes of his two checked cart rounds – Orange Lake Reserve
// 13.11.2026 and Stonegate Oaks 12.11.2026 – with the shots he set himself after the round (see CART_PLACES).

interface FxHole {
  round: string;
  courseId: string;
  loop: string;
  number: number;
  label: string;
  tee: string;
  par: number;
  score: { strokes: number; putts: number; penalties: number };
  truth: [number, number][];
  track: number[][];
}
const holes = (fixture as unknown as { holes: FxHole[] }).holes;
const T0 = 1794589078273; // the Reserve round started then
const trackOf = (h: FxHole, start = T0): TrackPoint[] =>
  h.track.map(([s, lng, lat, acc, open]) => ({ t: start + Math.round(s * 1000), p: [lng, lat] as LngLat, acc, ...(open ? { open: true } : {}) }));
const mapOf = (h: FxHole): HoleMapData => {
  const geo = SEED_GEOMETRY[h.courseId];
  // the Reserve was played from Blue (Sascha 14.11.2026), the round stored as White
  return holeForTee(holeMapData(geo, h.loop, h.number), h.courseId, h.label, h.round === 'Reserve' ? 'Blue' : h.tee, geo.tee)!;
};
/** The player's shots (after the tee shot) with a detected shot within 15 m – each detected shot used once. */
function within15(got: LngLat[], want: LngLat[]): number {
  const used = new Set<number>();
  let n = 0;
  for (const w of want) {
    let best = -1;
    got.forEach((g, k) => {
      if (!used.has(k) && distanceM(g, w) <= 15 && (best < 0 || distanceM(g, w) < distanceM(got[best], w))) best = k;
    });
    if (best >= 0) {
      used.add(best);
      n++;
    }
  }
  return n;
}
const detect = (h: FxHole, cart: boolean) => {
  const d = detectWithScore(trackOf(h), mapOf(h), h.par, undefined, h.score, { cart });
  return (d?.shots ?? []).slice(1).map((s) => s.pos!);
};

describe('shot detection in a cart (checked rounds 12./13.11.2026)', () => {
  it('the rounds were played from a cart', () => {
    for (const round of ['Reserve', 'Oaks']) {
      let start = T0;
      const all: TrackPoint[] = [];
      for (const h of holes.filter((x) => x.round === round)) {
        const pts = trackOf(h, start);
        all.push(...pts);
        start = pts[pts.length - 1].t + 60000;
      }
      expect(rodeCart(all)).toBe(true);
    }
  });

  it('finds the own balls where the cart stopped at the partners’ too', () => {
    let withCart = 0;
    let without = 0;
    let truth = 0;
    for (const h of holes) {
      const want = h.truth as LngLat[];
      const got = detect(h, true);
      // as many swings as the score says (score − putts − penalties, the tee shot included)
      expect(got.length + 1).toBe(h.score.strokes - h.score.putts - h.score.penalties);
      withCart += within15(got, want);
      without += within15(detect(h, false), want);
      truth += want.length;
    }
    expect(truth).toBe(21);
    // the shots the player set, within 15 m: 16 of 21 with the cart rules (15 before CART_RULES and the green rule),
    // 8 without (app-opens by the green and the partners' balls by the cart path won). Oaks 13 is lost since then: his
    // topped drive of 78 m is taken for a partner's ball (CART_RULES.short) – on both whole rounds the new rules gain
    // 7 shots within 15 m (scripts/replay.ts).
    expect(withCart).toBe(16);
    expect(without).toBe(8);
  });

  it('Oaks 9 and 1: the chip from the fringe, the GPS inside the green – not one place with the putts after it', () => {
    for (const label of ['9', '1']) {
      const h = holes.find((x) => x.round === 'Oaks' && x.label === label)!;
      const got = detect(h, true);
      const chip = h.truth[h.truth.length - 1] as LngLat;
      expect(distanceM(got[got.length - 1], chip)).toBeLessThan(5);
    }
  });

  it('Reserve 15: the second shot from his drive, not from the partner’s 95 m off the tee', () => {
    const h = holes.find((x) => x.round === 'Reserve' && x.label === '15')!;
    const [second] = detect(h, true);
    expect(distanceM(second, h.truth[0] as LngLat)).toBeLessThan(15);
  });

  it('Reserve 1: the second shot where the cart stood by the ball, not where the app was opened by the green', () => {
    const h = holes.find((x) => x.round === 'Reserve' && x.label === '1')!;
    const [ball] = detect(h, true);
    expect(distanceM(ball, h.truth[0] as LngLat)).toBeLessThan(8);
  });
});

describe('cart rules on a made-up hole', () => {
  const h = holes.find((x) => x.round === 'Reserve' && x.label === '1')!;
  const map = mapOf(h);
  const shift = (p: LngLat, east: number): LngLat => [p[0] + east / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1]];
  const stand = (pts: TrackPoint[], p: LngLat, s: number) => {
    const t = pts.length ? pts[pts.length - 1].t + 20000 : 0;
    for (let k = 0; k <= s; k += 5) pts.push({ t: t + k * 1000, p, acc: 5 });
  };

  it('a stop on the hole line beats one well off it (the partner’s longer drive by the cart path)', () => {
    const own = pointAt(map.line, 200);
    const partner = shift(pointAt(map.line, 240), -40);
    const pts: TrackPoint[] = [];
    stand(pts, map.tee, 60);
    stand(pts, partner, 60);
    stand(pts, own, 60);
    stand(pts, map.greenCenter, 120);
    const score = { strokes: 4, putts: 2, penalties: 0 };
    const d = detectWithScore(pts, map, 4, undefined, score, { cart: true })!;
    expect(d.shots.length).toBe(2);
    expect(distanceM(d.shots[1].pos!, own)).toBeLessThan(3);
    // walking, the longer drive would have been taken
    expect(distanceM(detectWithScore(pts, map, 4, undefined, score)!.shots[1].pos!, partner)).toBeLessThan(3);
  });

  it('an app-open alone is no shot in a cart', () => {
    const glance = pointAt(map.line, 120);
    const ball = pointAt(map.line, 190);
    const pts: TrackPoint[] = [];
    stand(pts, map.tee, 60);
    pts.push({ t: pts[pts.length - 1].t + 30000, p: glance, acc: 5, open: true }); // picked up on the way
    stand(pts, ball, 60);
    stand(pts, map.greenCenter, 120);
    const score = { strokes: 5, putts: 2, penalties: 0 };
    const d = detectWithScore(pts, map, 4, undefined, score, { cart: true })!;
    expect(d.shots.every((s) => distanceM(s.pos!, glance) > 10)).toBe(true);
    // walking, the player opens the app by his ball: there it is a shot
    expect(detectWithScore(pts, map, 4, undefined, score)!.shots.some((s) => distanceM(s.pos!, glance) < 3)).toBe(true);
  });

  it('where the cart waited by the green while they putted is no ball (the chip is suggested at the edge)', () => {
    const ball = pointAt(map.line, 150);
    const park = pointAt(map.line, 235); // ~30 m short of the green's centre, 260 m from the tee
    expect(onGreenAt(park, map)).toBe(false);
    const pts: TrackPoint[] = [];
    stand(pts, map.tee, 60);
    stand(pts, ball, 60);
    stand(pts, park, 240); // the phone in the cart, no fix on the green
    const score = { strokes: 5, putts: 2, penalties: 0 };
    const d = detectWithScore(pts, map, 4, undefined, score, { cart: true })!;
    expect(d.shots.length).toBe(3);
    expect(distanceM(d.shots[1].pos!, ball)).toBeLessThan(3);
    expect(d.shots.every((s) => distanceM(s.pos!, park) > 10)).toBe(true);
    // walking, a long stop by the green is a ball waiting to be played
    expect(detectWithScore(pts, map, 4, undefined, score)!.shots.some((s) => distanceM(s.pos!, park) < 3)).toBe(true);
  });

  it('on the tee: the stop nearest to the tee of the round, not the last one by a forward tee', () => {
    const forward = pointAt(map.line, 20);
    const ball = pointAt(map.line, 200);
    const pts: TrackPoint[] = [];
    stand(pts, map.tee, 60);
    stand(pts, forward, 60); // the cart by the partner's tee
    stand(pts, ball, 60);
    stand(pts, map.greenCenter, 120);
    const score = { strokes: 4, putts: 2, penalties: 0 };
    expect(distanceM(detectWithScore(pts, map, 4, undefined, score, { cart: true })!.shots[0].pos!, map.tee)).toBeLessThan(3);
    // walking, the last stop on the tee is where he hit (waiting for the group in front comes first)
    expect(distanceM(detectWithScore(pts, map, 4, undefined, score)!.shots[0].pos!, forward)).toBeLessThan(3);
  });

  it('a full shot well short of what the player meant counts against a place (in a cart)', () => {
    expect(shortOfFull(200, 210)).toBe(0); // 95 % of the driver
    expect(shortOfFull(168, 210)).toBeCloseTo(0, 5); // 80 %
    expect(shortOfFull(95, 210)).toBeCloseTo(1.16, 2); // the partner's short drive at Reserve 15
    expect(shortOfFull(30, 80)).toBe(0); // a pitch – no full shot
  });
});
