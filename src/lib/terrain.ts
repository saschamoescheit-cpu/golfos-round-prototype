import type { LngLat, Ring } from '../types';
import { distanceM } from './geo';
import { sideOf } from './dispersion';

// What a caddie knows about the ground (feature 015): out of bounds next to the landing spot and fairways
// that hang to one side. Rules of thumb – to be confirmed by Chris.

export const TERRAIN = {
  slopeMinPct: 2, // below: no remark
  aimPerPct: 2.5, // metres to aim up the slope per % cross slope (ball rolls ~20 m after landing)
  aimMaxM: 15,
  steepPct: 12, // above: probably a bank – no exact number
  obWithinM: 30, // remark when the course boundary is this close to the target
};

/** Cross slope at `along` metres from the tee (nearest sample within 15 m); + = right side higher. */
export function crossSlopeAt(samples: [number, number][] | undefined, along: number): number | null {
  if (!samples?.length) return null;
  const best = samples.reduce((a, b) => (Math.abs(b[0] - along) < Math.abs(a[0] - along) ? b : a));
  return Math.abs(best[0] - along) <= 15 ? best[1] : null;
}

/** "Fairway falls from right to left (4 %) – the ball rolls left", aim metres (+ = right). */
export function slopeAdvice(pct: number | null): { text: string; aimM: number } | null {
  if (pct == null || Math.abs(pct) < TERRAIN.slopeMinPct) return null;
  const high = pct > 0 ? 'right' : 'left';
  const low = pct > 0 ? 'left' : 'right';
  const sign = pct > 0 ? 1 : -1;
  if (Math.abs(pct) > TERRAIN.steepPct)
    return { text: `Steep side slope (${Math.round(Math.abs(pct))} %) – balls run ${low}, favour the ${high} edge`, aimM: sign * TERRAIN.aimMaxM };
  const aim = Math.min(TERRAIN.aimMaxM, Math.max(3, Math.round(Math.abs(pct) * TERRAIN.aimPerPct)));
  return { text: `Fairway falls from ${high} to ${low} (${Math.abs(pct).toFixed(0)} %) – the ball rolls ${low}`, aimM: sign * aim };
}

function nearestOnSegment(p: LngLat, a: LngLat, b: LngLat): LngLat {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Course boundary near the target (likely out of bounds): closest distance left and right of the shot line,
 * and long (beyond the target). Only remarks within `obWithinM`.
 */
export function obAdvice(boundary: Ring[] | undefined, from: LngLat, target: LngLat): { text: string; left: number; right: number } | null {
  if (!boundary?.length) return null;
  const near: Record<'left' | 'right' | 'long', number> = { left: Infinity, right: Infinity, long: Infinity };
  const dirLen = distanceM(from, target);
  for (const ring of boundary) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const q = nearestOnSegment(target, ring[i], ring[i + 1]);
      const d = distanceM(target, q);
      if (d > TERRAIN.obWithinM) continue;
      const s = sideOf(from, target, q);
      const past = distanceM(from, q) > dirLen + 5 && Math.abs(s) < d * 0.7;
      const key = past ? 'long' : s > 0 ? 'right' : 'left';
      near[key] = Math.min(near[key], d);
    }
  }
  const parts = (Object.keys(near) as (keyof typeof near)[]).filter((k) => near[k] < Infinity).map((k) => `${k} ${Math.round(near[k])} m`);
  return parts.length ? { text: `Out of bounds (likely) ${parts.join(', ')} from your target`, left: near.left, right: near.right } : null;
}
