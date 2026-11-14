import { describe, expect, it } from 'vitest';
import { detectWithScore, rodeCart, type TrackPoint } from './track';
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
    expect(truth).toBe(11);
    // the shots the player set, within 15 m: 10 of 11 with the cart rules, 3 without (app-opens by the green and the
    // partners' balls by the cart path won)
    expect(withCart).toBe(10);
    expect(without).toBe(3);
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
});
