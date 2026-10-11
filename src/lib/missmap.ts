import type { LngLat } from '../types';
import { distanceM, pointInRing, type HoleMapData } from './geo';
import { expectedStrokes } from './sg';
import { lieAt, onGreenAt } from './shots';

// "Where not to miss" (feature 008): around the pin (and the planned landing spot) every point gets the
// strokes a good player still needs from there – by distance and lie (green, fairway, rough, bunker,
// water = penalty stroke + drop). Cheap misses are green, expensive ones red.

export interface MissPoint {
  pos: LngLat;
  strokes: number; // expected strokes to hole out from here
  cost: number; // extra strokes against the best spot of the area, capped at 1 (0 = best … 1 = a stroke or more)
}

const M_PER_DEG = 111320;

function grid(center: LngLat, radius: number, step: number): LngLat[] {
  const dLat = step / M_PER_DEG;
  const dLon = step / (M_PER_DEG * Math.cos((center[1] * Math.PI) / 180));
  const n = Math.floor(radius / step);
  const out: LngLat[] = [];
  for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) if (x * x + y * y <= n * n) out.push([center[0] + x * dLon, center[1] + y * dLat]);
  return out;
}

export function strokesFrom(p: LngLat, pin: LngLat, data: HoleMapData): number {
  const d = distanceM(p, pin);
  if (onGreenAt(p, data)) return expectedStrokes(d, 'green');
  if (data.water.some((r) => pointInRing(p, r))) return 1 + expectedStrokes(d + 10, 'rough'); // penalty, drop behind
  return expectedStrokes(d, lieAt(p, data, false));
}

/**
 * What a miss to this spot costs because of the lie (not the distance): extra strokes against the fairway at
 * the same distance, scaled so that ~0.6 strokes is full red. On the green 0; bunkers at least 0.5 (amateurs lose
 * more there than the tour baseline says); water 1.
 */
export function missCost(p: LngLat, pin: LngLat, data: HoleMapData, strokes = strokesFrom(p, pin, data)): number {
  if (onGreenAt(p, data)) return 0;
  if (data.water.some((r) => pointInRing(p, r))) return 1;
  const extra = (strokes - expectedStrokes(distanceM(p, pin), 'fairway')) / 0.6;
  const bunker = data.bunkers.some((r) => pointInRing(p, r));
  return Math.max(bunker ? 0.5 : 0.05, Math.min(1, extra));
}

/** Points around the pin (radius 35 m) and around the landing target (radius 30 m), with the extra strokes per spot. */
export function missMap(data: HoleMapData, pin: LngLat, target: LngLat | null): MissPoint[] {
  const areas: LngLat[][] = [grid(pin, 35, 5)];
  if (target && distanceM(target, pin) > 50) areas.push(grid(target, 30, 6));
  return areas.flat().map((pos) => {
    const strokes = strokesFrom(pos, pin, data);
    return { pos, strokes, cost: missCost(pos, pin, data, strokes) };
  });
}
