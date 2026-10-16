import type { LngLat, Ring } from '../types';
import { bearingDeg, centroid, distanceM, pointInRing, type HoleMapData } from './geo';
import { strokesFrom } from './missmap';
import { bestLeave, heightAt, type GreenGrid } from './greenread';
import { onGreenAt } from './shots';
import { dec, hazardWord, tr } from './i18n';
import { clampHcp, spreadFactor } from './hcp';

// Pin strategy (feature 015): where to aim an approach – at the flag, towards the middle of the green, or short of the
// flag for an uphill putt. For every candidate aim the shot is played 240 times with the player's spread (from the
// distance and the playing handicap); every finish costs the strokes still needed from there (tour baseline, plus what
// a bunker costs an amateur on top, and a downhill putt is harder than an uphill one). The aim with the fewest strokes
// wins – the caddie names it and says what it saves.

export type PinPlanKind = 'pin' | 'centre' | 'between' | 'below';
export interface PinPlan {
  aim: LngLat;
  kind: PinPlanKind;
  saved: number; // strokes saved against aiming at the flag (0 for the flag)
  text: string | null;
  expected: number; // strokes still needed after this shot, on average (for the lay-up comparison)
}

const N = 240;
// Fixed standard-normal pairs: the same advice on every redraw for the same spot.
const SAMPLES: [number, number][] = (() => {
  let s = 20261013;
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

const move = (p: LngLat, bearing: number, m: number): LngLat => {
  const r = (bearing * Math.PI) / 180;
  return [p[0] + (m * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (m * Math.cos(r)) / 111320];
};

/** Spread of an approach (1 standard deviation, metres): grows with the distance and the playing handicap. */
export function spread(distM: number, playing: number | null, style: 'safe' | 'normal' | 'aggressive' = 'normal'): { long: number; side: number } {
  const k = spreadFactor(playing) * (style === 'safe' ? 1.15 : style === 'aggressive' ? 0.85 : 1);
  return { long: (distM * 0.055 + 3) * k, side: (distM * 0.045 + 2) * k };
}

const cache = new Map<string, PinPlan | null>();

export function pinStrategy(o: {
  from: LngLat;
  pin: LngLat;
  data: HoleMapData;
  distM: number; // plays-like distance to the pin
  playing: number | null;
  style?: 'safe' | 'normal' | 'aggressive';
  grid?: GreenGrid | null;
}): PinPlan | null {
  const green = o.data.green;
  if (!green || o.distM < 40 || o.distM > 230) return null;
  const key = [o.from.map((v) => v.toFixed(5)), o.pin.map((v) => v.toFixed(6)), Math.round(o.distM), o.playing, o.style, !!o.grid, o.data.greenCenter.join()].join('|');
  if (cache.has(key)) return cache.get(key)!;

  const sd = spread(o.distM, o.playing, o.style);
  const hPin = o.grid ? heightAt(o.grid, o.pin) : null;
  // What an amateur loses on top of the tour baseline grows with the handicap: from a greenside bunker about 0.5 strokes
  // at handicap 12 (≈ 3 strokes to hole out instead of 2.5), a chip from the rough next to the green about 0.17.
  const ph = clampHcp(o.playing);
  const sandExtra = 0.2 + ph * 0.025;
  const roughExtra = 0.05 + ph * 0.01;
  const cost = (p: LngLat): number => {
    let e = strokesFrom(p, o.pin, o.data);
    if (o.data.bunkers.some((r) => pointInRing(p, r))) e += sandExtra;
    else if (!onGreenAt(p, o.data) && distanceM(p, o.data.greenCenter) < 40) {
      e += roughExtra;
      // off the green and well below it (Sascha 15.10.2026, 4A: "right of the green it drops steeply – a blind pitch
      // up to a green 15 m higher"): every metre below the pin costs, from 1.5 m on
      if (o.grid && hPin != null) {
        const h = heightAt(o.grid, p);
        if (h != null && hPin - h > 1.5) e += Math.min(0.45, 0.1 + (hPin - h - 1.5) * 0.08);
      }
    }
    if (o.grid && hPin != null && onGreenAt(p, o.data)) {
      const hp = heightAt(o.grid, p);
      if (hp != null) {
        const rise = hPin - hp; // + = putt uphill
        e += rise < 0 ? 0.08 * Math.min(1, -rise / 0.3) : -0.03 * Math.min(1, rise / 0.3);
      }
    }
    return e;
  };
  const expected = (aim: LngLat): number => {
    const b = bearingDeg(o.from, aim);
    let sum = 0;
    for (const [a, c] of SAMPLES) sum += cost(move(move(aim, b, a * sd.long), b + 90, c * sd.side));
    return sum / N;
  };

  const centre = o.data.greenCenter;
  const between = (t: number): LngLat => [o.pin[0] + (centre[0] - o.pin[0]) * t, o.pin[1] + (centre[1] - o.pin[1]) * t];
  const cands: { kind: PinPlanKind; aim: LngLat }[] = [{ kind: 'pin', aim: o.pin }];
  if (distanceM(o.pin, centre) > 4) cands.push({ kind: 'centre', aim: centre }, { kind: 'between', aim: between(1 / 3) }, { kind: 'between', aim: between(2 / 3) });
  const leave = o.grid ? bestLeave(o.grid, o.pin, o.from, green) : null;
  if (leave && pointInRing(leave.pos, green)) cands.push({ kind: 'below', aim: leave.pos });
  const short = move(o.pin, bearingDeg(o.pin, o.from), 5);
  if (pointInRing(short, green)) cands.push({ kind: 'below', aim: short });

  const scored = cands.map((c) => ({ ...c, e: expected(c.aim) }));
  const atPin = scored[0].e;
  const best = scored.reduce((b, c) => (c.e < b.e - 1e-9 ? c : b));
  const saved = Math.round((atPin - best.e) * 100) / 100;
  let plan: PinPlan;
  // under 0.08 strokes the difference is not worth a change of plan (and would read "saves 0.0")
  if (best.kind === 'pin' || saved < 0.08) {
    plan = { aim: o.pin, kind: 'pin', saved: 0, text: distanceM(o.pin, centre) > 6 ? tr('Pin is accessible – go for it.', 'Fahne ist frei – geh drauf.') : null, expected: atPin };
  } else if (best.kind === 'below') {
    const d = Math.round(distanceM(best.aim, o.pin));
    plan = { aim: best.aim, kind: 'below', saved, text: tr(`Aim ${d} m short of the pin – uphill putt (saves about ${dec(saved.toFixed(1))}).`, `Ziel ${d} m vor die Fahne – Putt bergauf (spart etwa ${dec(saved.toFixed(1))} Schläge).`), expected: best.e };
  } else {
    const h = hazardNearPin(o.pin, o.from, o.data, best.aim);
    const why = h ? tr(`Pin close to the ${hazardWord(h.kind).toLowerCase()} ${h.where}`, `Fahne nah am ${hazardWord(h.kind)} ${h.where}`) : tr('Pin on the edge of the green', 'Fahne am Grünrand');
    plan = { aim: best.aim, kind: best.kind, saved, text: tr(`${why} – play towards the middle of the green (saves about ${dec(saved.toFixed(1))}).`, `${why} – spiel Richtung Grünmitte (spart etwa ${dec(saved.toFixed(1))} Schläge).`), expected: best.e };
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, plan);
  return plan;
}

/**
 * Lay up instead of going for the green (feature 017, Sascha: "the plan for the hole"): from 170 m and more a shot
 * at the green brings water and sand into play; a lay-up to the favourite distance and a full wedge from there may
 * cost fewer strokes. Both are played with the player's spread; the lay-up wins only by 0.1 strokes or more.
 */
export function layupInstead(o: {
  from: LngLat;
  pin: LngLat;
  data: HoleMapData;
  distM: number; // plays-like to the pin
  favourite: number; // metres left after the lay-up
  playing: number | null;
  style?: 'safe' | 'normal' | 'aggressive';
}): { aim: LngLat; saved: number; text: string } | null {
  if (o.distM < 170 || !o.data.green) return null;
  const toPin = distanceM(o.from, o.pin);
  const lay = toPin - o.favourite;
  if (lay < 60) return null; // a lay-up of a few metres is no plan
  const ph = clampHcp(o.playing);
  const k = (0.6 + ph / 25) * (o.style === 'safe' ? 1.15 : o.style === 'aggressive' ? 0.85 : 1);
  const sandExtra = 0.2 + ph * 0.025;
  const roughExtra = 0.05 + ph * 0.01;
  const b = bearingDeg(o.from, o.pin);
  const cost = (p: LngLat): number => {
    let e = strokesFrom(p, o.pin, o.data);
    if (o.data.bunkers.some((r) => pointInRing(p, r))) e += sandExtra;
    else if (!onGreenAt(p, o.data) && !o.data.fairways.some((r) => pointInRing(p, r))) e += roughExtra;
    return e;
  };
  // A shot with a wood or hybrid from 170 m+: spread like a tee shot, and now and then a mishit (thin, topped) that
  // goes 50–70 % of the way – the main reason amateurs should lay up. The lay-up with an iron mishits rarely.
  const play = (dist: number, sdLong: number, sdSide: number, mishit: number): number => {
    const bad = Math.round(N * mishit);
    let sum = 0;
    SAMPLES.forEach(([a, c], n) => {
      const d = n < bad ? dist * (0.5 + 0.2 * ((n % 5) / 4)) : dist + a * sdLong;
      sum += cost(move(move(o.from, b, d), b + 90, c * sdSide));
    });
    return sum / N;
  };
  const goE = play(toPin, (toPin * 0.06 + 3) * k, (toPin * 0.065 + 2) * k, 0.05 + ph * 0.004);
  const sd = spread(lay, o.playing, o.style);
  // the lay-up's next shot (a full wedge) is not simulated: an amateur loses a little more there than the tour table
  const layE = play(lay, sd.long, sd.side, 0.02 + ph * 0.002) + (0.1 + ph * 0.01);
  const saved = Math.round((goE - layE) * 100) / 100;
  if (saved < 0.1) return null;
  const water = o.data.water.some((r) => r.some((q) => distanceM(q, o.data.greenCenter) < 40));
  const why = water ? tr('water near the green', 'Wasser am Grün') : tr('sand around the green', 'Sand ums Grün');
  return {
    aim: move(o.from, b, lay),
    saved,
    text: tr(
      `Lay up to ${o.favourite} m instead of going for the green – ${why} (saves about ${dec(saved.toFixed(1))}).`,
      `Vorlegen auf ${o.favourite} m statt aufs Grün – ${why} (spart etwa ${dec(saved.toFixed(1))} Schläge).`,
    ),
  };
}

/**
 * The bunker or water close to the pin (within 15 m) that the new aim moves away from, and where it lies, seen from
 * the player – water before bunkers.
 */
function hazardNearPin(pin: LngLat, from: LngLat, data: HoleMapData, aim: LngLat): { kind: 'bunker' | 'water'; where: string } | null {
  const away = bearingDeg(pin, aim);
  const opposite = (c: LngLat) => Math.abs(((bearingDeg(pin, c) - away + 540) % 360) - 180) > 90;
  const near = (rings: Ring[], kind: 'bunker' | 'water') =>
    rings.map((r) => ({ kind, r, d: Math.min(...r.map((q) => distanceM(q, pin))) })).filter((x) => x.d <= 15 && opposite(centroid(x.r)));
  const all = [...near(data.water, 'water'), ...near(data.bunkers, 'bunker')].sort((a, b) => (a.kind === b.kind ? a.d - b.d : a.kind === 'water' ? -1 : 1));
  if (!all.length) return null;
  const c = centroid(all[0].r);
  const shot = bearingDeg(from, pin);
  const rel = ((bearingDeg(pin, c) - shot + 540) % 360) - 180; // 0 = behind the pin, ±180 = in front
  const where =
    Math.abs(rel) <= 45 ? tr('long', 'hinten') : Math.abs(rel) >= 135 ? tr('short', 'vorne') : rel > 0 ? tr('right', 'rechts') : tr('left', 'links');
  return { kind: all[0].kind, where };
}
