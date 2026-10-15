import type { Club, LngLat, Ring } from '../types';
import { alongLine, bearingDeg, distanceM, distToLine, lineLength, pointAt, pointInRing, type HoleMapData } from './geo';
import { expectedStrokes } from './sg';
import { clubName, playsLike, type CarryBag, type Conditions } from './caddie';
import { fairwayWidth } from './holeplan';
import type { HoleNote } from './holenotes';
import { clubCode, sideWord, tr } from './i18n';

// Hole strategy off the tee (feature 017, Sascha 13.10.2026: "more golf knowledge – the plan for the hole"):
// which club and which side of the fairway give this player the fewest strokes for the hole – the way modern course
// strategy thinks (DECADE, "Every Shot Counts"). Every club of 140 m and more, seven aim points across the fairway;
// for each, 160 tee shots with the player's spread; every landing costs the strokes still needed from there (tour
// baseline + what an amateur loses in sand and rough; water = penalty + from the rough before it; out of bounds =
// penalty + the whole hole again from the tee; trees = punch out). A club shorter than the driver must save 0.1
// strokes (one stroke in ten rounds) to be recommended.

export interface TeePlan {
  club: Club;
  carry: number;
  side: number; // metres across the hole line at the landing (+ right)
  expected: number; // strokes for the hole after the tee shot (average)
  saved: number; // against the driver at the middle
  text: string | null; // one sentence for the caddie card; null = nothing special
}

const N = 100; // the same 100 shots for every option: their comparison is steadier than the number suggests
const SAMPLES: [number, number][] = (() => {
  let s = 20261014;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    out.push([r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]);
  }
  return out;
})();

export const TEE_STRATEGY = { minCarry: 140, offsets: [-15, -10, -5, 0, 5, 10, 15], shorterMustSave: 0.1 };

const move = (p: LngLat, bearing: number, m: number): LngLat => {
  const r = (bearing * Math.PI) / 180;
  return [p[0] + (m * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (m * Math.cos(r)) / 111320];
};

/** Spread of a tee shot (1 standard deviation, metres): grows with the length, the playing handicap and the driver. */
export function teeSpread(total: number, club: Club, playing: number | null, style: 'safe' | 'normal' | 'aggressive' = 'normal'): { long: number; side: number } {
  const k = (0.6 + Math.min(36, Math.max(0, playing ?? 18)) / 25) * (style === 'safe' ? 1.15 : style === 'aggressive' ? 0.85 : 1);
  return { long: (total * 0.06 + 3) * k, side: (total * 0.065 + 2) * k * (club === 'Dr' ? 1.15 : 1) };
}

type Miss = 'ob' | 'lost' | 'water' | 'trees' | 'bunker' | 'rough' | 'fairway';
/** Deeper than this into a wood the ball is mostly lost (Sascha 15.10.2026: "the balls are gone, you hit again from
 *  the tee") – at its edge it is found and punched out. */
export const LOST_IN_WOODS_M = 8;

const cache = new Map<string, TeePlan | null>();

export function teeStrategy(o: {
  data: HoleMapData;
  par: number;
  bag: CarryBag;
  playing: number | null;
  style?: 'safe' | 'normal' | 'aggressive';
  conditions: Conditions | null;
  boundary?: Ring[];
  trees?: Ring[];
  woods?: Ring[]; // where a ball is lost: OSM woods plus large crown areas (deeper than LOST_IN_WOODS_M)
  note?: HoleNote;
}): TeePlan | null {
  const { data } = o;
  if (o.par < 4 || !data.fairways.length) return null;
  const L = lineLength(data.line);
  const dir0 = bearingDeg(data.tee, pointAt(data.line, Math.min(200, L / 2)));
  const ratio = 100 / playsLike(100, dir0, o.conditions, null).playsLike;
  const shape = (rings: Ring[] | undefined) => (rings ?? []).map((r) => `${r.length}:${r[0]?.join()}`).join(';');
  const key = [data.tee.join(), data.greenCenter.join(), o.par, o.playing, o.style, ratio.toFixed(2), o.bag.map((b) => `${b.club}${b.carry}`).join(), o.note?.obLeft, o.note?.obRight, o.note?.lostLeft, o.note?.lostRight, shape(data.water), shape(data.bunkers), shape(data.fairways), shape(o.boundary), (o.trees ?? []).length, (o.woods ?? []).length].join('|');
  if (cache.has(key)) return cache.get(key)!;

  const ph = Math.min(36, Math.max(0, o.playing ?? 18));
  const sandExtra = 0.2 + ph * 0.025;
  const roughExtra = 0.05 + ph * 0.01;
  const pin = data.greenCenter;
  const near = (rings: Ring[] | undefined) => (rings ?? []).filter((r) => r.some((q) => distToLine(q, data.line) < 120));
  const water = near(data.water);
  const bunkers = near(data.bunkers);
  const trees = near(o.trees);
  const woods = near(o.woods ?? o.trees);
  const inWoods = (p: LngLat) => woods.some((r) => pointInRing(p, r) && distToLine(p, r) > LOST_IN_WOODS_M);
  const fairways = data.fairways;
  const bound = o.boundary ?? [];
  // point-in-polygon behind a bounding-box check: most samples are far from most woods and ponds (speed on the phone)
  const tester = (rings: Ring[]) => {
    const boxes = rings.map((r) => {
      let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
      for (const q of r) {
        if (q[0] < w) w = q[0];
        if (q[0] > e) e = q[0];
        if (q[1] < so) so = q[1];
        if (q[1] > n) n = q[1];
      }
      return [w, so, e, n] as const;
    });
    return (p: LngLat) => rings.some((r, k) => p[0] >= boxes[k][0] && p[0] <= boxes[k][2] && p[1] >= boxes[k][1] && p[1] <= boxes[k][3] && pointInRing(p, r));
  };
  const inAny = (p: LngLat, rings: Ring[]) => rings.some((r) => pointInRing(p, r));
  const inWater = tester(water);
  const inTrees = tester(trees);
  const inBunker = tester(bunkers);
  const inFairway = tester(fairways);
  const inBound = tester(bound);
  const teeInside = !bound.length || inAny(data.tee, bound);
  const fromTee = expectedStrokes(L, 'tee');
  /** Strokes still needed after the tee shot when the ball finishes at p – and what kind of spot it is. */
  const value = (p: LngLat, side: number): { v: number; miss: Miss } => {
    const d = distanceM(p, pin);
    if (bound.length && teeInside && !inBound(p)) return { v: 1 + fromTee, miss: 'ob' };
    // out of bounds the map does not know (hole notes): more than 25 m to that side
    if ((o.note?.obLeft && side < -25) || (o.note?.obRight && side > 25)) return { v: 1 + fromTee, miss: 'ob' };
    // woods the player knows to swallow balls (hole notes): more than 25 m to that side
    if ((o.note?.lostLeft && side < -25) || (o.note?.lostRight && side > 25)) return { v: 1 + fromTee, miss: 'lost' };
    if (inWater(p)) return { v: 1 + expectedStrokes(d + 10, 'rough') + roughExtra, miss: 'water' };
    // deep in the woods the ball is lost – stroke and distance; at the edge: punch out
    if (inWoods(p)) return { v: 1 + fromTee, miss: 'lost' };
    if (inTrees(p)) return { v: expectedStrokes(d, 'recovery'), miss: 'trees' };
    if (inBunker(p)) return { v: expectedStrokes(d, 'bunker') + sandExtra, miss: 'bunker' };
    if (inFairway(p)) return { v: expectedStrokes(d, 'fairway'), miss: 'fairway' };
    return { v: expectedStrokes(d, 'rough') + roughExtra, miss: 'rough' };
  };

  const clubs = o.bag.filter((b) => !b.swing && b.carry >= TEE_STRATEGY.minCarry).sort((a, b) => b.carry - a.carry);
  if (!clubs.length) return null;
  interface Cand {
    club: Club;
    carry: number;
    total: number;
    side: number;
    e: number;
    misses: Record<Miss, number>;
    missSide: number; // average side of the expensive misses (+ right)
  }
  const cands: Cand[] = [];
  for (const b of clubs) {
    // rated where the caddie aims (the carry, plays-like) – the roll is a bonus on top, not part of the plan
    const total = b.carry * ratio;
    if (total > L - 25) continue; // would run onto the green or past it – not a tee club here
    const c = pointAt(data.line, total);
    const dir = bearingDeg(pointAt(data.line, Math.max(0, total - 20)), c);
    const sd = teeSpread(total, b.club, o.playing, o.style);
    for (const off of TEE_STRATEGY.offsets) {
      const aim = move(c, dir + 90, off);
      // aim at the fairway (the caddie's safety check would pull an aim in the rough back anyway)
      if (off !== 0 && !inFairway(aim)) continue;
      let sum = 0;
      const misses: Record<Miss, number> = { ob: 0, lost: 0, water: 0, trees: 0, bunker: 0, rough: 0, fairway: 0 };
      let badSide = 0;
      let bad = 0;
      for (const [zl, zs] of SAMPLES) {
        const side = off + zs * sd.side;
        const p = move(move(aim, dir, zl * sd.long), dir + 90, zs * sd.side);
        const r = value(p, side);
        sum += r.v;
        misses[r.miss]++;
        if (r.miss === 'ob' || r.miss === 'lost' || r.miss === 'water' || r.miss === 'trees') {
          badSide += side;
          bad++;
        }
      }
      cands.push({ club: b.club, carry: b.carry, total, side: off, e: sum / N, misses, missSide: bad ? badSide / bad : 0 });
    }
  }
  if (!cands.length) {
    cache.set(key, null);
    return null;
  }
  const best = cands.reduce((a, b) => (b.e < a.e ? b : a));
  // the reference: the longest club that makes sense here (on a short par 4 the driver may run onto the green)
  const top = cands[0].club;
  const drivers = cands.filter((c) => c.club === top);
  const longBest = drivers.reduce((a, b) => (b.e < a.e ? b : a));
  const longMid = drivers.find((c) => c.side === 0) ?? longBest;
  let pick = best.club !== top && longBest.e - best.e < TEE_STRATEGY.shorterMustSave ? longBest : best;
  // a side for a few hundredths of a stroke is noise: then the middle (the dogleg rule may still pick a side)
  if (pick.club === top && longMid.e - pick.e < 0.04) pick = longMid;

  // ---- the sentence ----
  const fmt = (m: number) => Math.round(m);
  const missWord = (m: Miss) => ({ ob: tr('out of bounds', 'Aus'), lost: tr('woods (ball mostly lost)', 'Wald (Ball meist weg)'), water: tr('water', 'Wasser'), trees: tr('trees', 'Bäume'), bunker: tr('bunker', 'Bunker'), rough: tr('rough', 'Rough'), fairway: '' })[m];
  const worstMiss = (c: Cand): Miss | null => {
    const order: Miss[] = ['ob', 'lost', 'water', 'trees', 'bunker'];
    const m = order.map((x) => [x, c.misses[x]] as const).sort((a, b) => b[1] - a[1])[0];
    return m[1] >= N * 0.06 ? m[0] : null; // at least 6 % of the drives
  };
  let text: string | null = null;
  const saved = Math.round((longMid.e - pick.e) * 100) / 100;
  if (pick.club !== top) {
    const wLong = fairwayWidth(data, longBest.total);
    const wPick = fairwayWidth(data, pick.total);
    const miss = worstMiss(longMid);
    const where = miss && Math.abs(longMid.missSide) >= 5 ? ` ${sideWord(longMid.missSide > 0 ? 'right' : 'left')}` : '';
    const widths = wLong != null && wPick != null && wPick - wLong >= 5 ? tr(`at ${fmt(pick.total)} m the fairway is ${fmt(wPick)} m wide, at ${fmt(longBest.total)} m only ${fmt(wLong)} m`, `bei ${fmt(pick.total)} m ist das Fairway ${fmt(wPick)} m breit, bei ${fmt(longBest.total)} m nur ${fmt(wLong)} m`) : null;
    const hazard = miss ? tr(`${missWord(miss)}${where} in driver range`, `${missWord(miss)}${where} in Driver-Weite`) : null;
    const why = [widths, hazard].filter(Boolean).join(', ');
    text = tr(
      `${clubName(pick.club)} instead of the ${clubName(top)}${why ? `: ${why}` : ''} – saves about ${saved.toFixed(1)} strokes on average.`,
      `${clubName(pick.club)} statt ${clubName(top)}${why ? `: ${why}` : ''} – spart im Schnitt ${saved.toFixed(1).replace('.', ',')} Schläge.`,
    );
  } else if (Math.abs(pick.side) >= 5 && longMid.e - pick.e >= 0.04) {
    const miss = worstMiss(longMid);
    const away = pick.side > 0 ? 'right' : 'left';
    const from = miss && Math.abs(longMid.missSide) >= 5 ? `${sideWord(longMid.missSide > 0 ? 'right' : 'left')}: ${missWord(miss)}` : null;
    text = tr(
      `${clubName(pick.club)} to the ${away} side of the fairway${from ? ` – ${from}` : ''}.`,
      `${clubName(pick.club)} auf die ${away === 'right' ? 'rechte' : 'linke'} Fairwayseite${from ? ` – ${from}` : ''}.`,
    );
  }
  const plan: TeePlan = { club: pick.club, carry: pick.carry, side: pick.side, expected: Math.round(pick.e * 100) / 100, saved, text };
  cache.set(key, plan);
  return plan;
}

export const _teeTest = { clubCode, alongLine };
