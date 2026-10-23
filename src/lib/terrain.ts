import type { LngLat, Ring } from '../types';
import { distanceM } from './geo';
import { sideOf } from './dispersion';
import { sideWord, tr } from './i18n';

// What a caddie knows about the ground (feature 015): out of bounds next to the landing spot and fairways
// that hang to one side. Rules of thumb – to be confirmed by Chris.

export type Samples = [number, number, number?][]; // [m from tee, cross slope %, height m]

export const TERRAIN = {
  slopeMinPct: 2, // below: no remark
  aimPerPct: 1.5, // metres to aim up the slope per % cross slope (conservative – Chris to confirm)
  aimMaxM: 10,
  steepPct: 8, // above: no exact number, just "favour the high side"
  obWithinM: 30, // remark when the course boundary is this close to the target
};

/** Cross slope at `along` metres from the tee (nearest sample within 15 m); + = right side higher. */
export function crossSlopeAt(samples: Samples | undefined, along: number): number | null {
  if (!samples?.length) return null;
  const best = samples.reduce((a, b) => (Math.abs(b[0] - along) < Math.abs(a[0] - along) ? b : a));
  return Math.abs(best[0] - along) <= 15 ? best[1] : null;
}

/** Ground height at `along` metres from the tee (linear between samples), from the terrain model. */
export function heightAt(samples: Samples | undefined, along: number): number | null {
  const pts = (samples ?? []).filter((x) => x[2] != null) as [number, number, number][];
  if (!pts.length || along < pts[0][0] - 15 || along > pts[pts.length - 1][0] + 15) return null;
  for (let k = 1; k < pts.length; k++) {
    if (along <= pts[k][0]) {
      const [a0, , h0] = pts[k - 1];
      const [a1, , h1] = pts[k];
      return h0 + ((h1 - h0) * (along - a0)) / (a1 - a0 || 1);
    }
  }
  return along < pts[0][0] ? pts[0][2] : pts[pts.length - 1][2];
}

/** "Fairway falls from right to left (4 %) – the ball rolls left", aim metres (+ = right). */
export function slopeAdvice(pct: number | null): { text: string; aimM: number } | null {
  if (pct == null || Math.abs(pct) < TERRAIN.slopeMinPct) return null;
  const high = sideWord(pct > 0 ? 'right' : 'left');
  const low = sideWord(pct > 0 ? 'left' : 'right');
  const sign = pct > 0 ? 1 : -1;
  if (Math.abs(pct) > TERRAIN.steepPct)
    return {
      text: tr(
        `Strong side slope (${Math.round(Math.abs(pct))} %) – balls run ${low}, favour the ${high} half`,
        `Starker Seithang (${Math.round(Math.abs(pct))} %) – Bälle laufen nach ${low}, spiel die ${pct > 0 ? 'rechte' : 'linke'} Hälfte`,
      ),
      aimM: sign * TERRAIN.aimMaxM,
    };
  const aim = Math.min(TERRAIN.aimMaxM, Math.max(3, Math.round(Math.abs(pct) * TERRAIN.aimPerPct)));
  return {
    text: tr(
      `Fairway falls from ${high} to ${low} (${Math.abs(pct).toFixed(0)} %) – the ball rolls ${low}`,
      `Fairway hängt von ${high} nach ${low} (${Math.abs(pct).toFixed(0)} %) – der Ball rollt nach ${low}`,
    ),
    aimM: sign * aim,
  };
}

export function nearestOnSegment(p: LngLat, a: LngLat, b: LngLat): LngLat {
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
  const parts = (Object.keys(near) as (keyof typeof near)[]).filter((k) => near[k] < Infinity).map((k) => `${Math.round(near[k])} m ${sideWord(k)}`);
  return parts.length ? { text: `${tr('Out of bounds', 'Aus')} ${parts.join(', ')}`, left: near.left, right: near.right } : null;
}

/**
 * The stance a shot was played from, read off the terrain model along the hole (Sascha 22.10.2026, round check: "Stand"
 * suggested from the heights where there are any): uphill / downhill in the shot's direction, or the ball above / below
 * the feet from the side slope – a right-hander stands left of the line to the target, a left-hander right of it.
 * Flat under 2 %, a suggestion from 4 % (the stronger of the two), nothing in between or off the hole's profile.
 */
export function stanceAt(samples: Samples | undefined, along: number, alongTo: number | null, leftHanded: boolean): 'flat' | 'up' | 'down' | 'above' | 'below' | null {
  const dir = alongTo == null || alongTo >= along ? 1 : -1; // played towards the green, or back towards the tee
  const h0 = heightAt(samples, along - 5 * dir);
  const h1 = heightAt(samples, along + 5 * dir);
  const grade = h0 != null && h1 != null ? ((h1 - h0) / 10) * 100 : null;
  const crossRaw = crossSlopeAt(samples, along);
  if (grade == null && crossRaw == null) return null;
  // seen in the shot's direction: + = the right side higher
  const cross = crossRaw == null ? 0 : crossRaw * dir;
  const g = grade ?? 0;
  if (Math.abs(g) < 2 && Math.abs(cross) < 2) return 'flat';
  if (Math.max(Math.abs(g), Math.abs(cross)) < 4) return null;
  if (Math.abs(g) >= Math.abs(cross)) return g > 0 ? 'up' : 'down';
  // right side higher: a right-hander's ball lies higher than his feet, a left-hander's lower
  return (cross > 0) !== leftHanded ? 'above' : 'below';
}
