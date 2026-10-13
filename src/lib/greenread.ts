import type { LngLat, Ring } from '../types';
import { bearingDeg, distanceM, pointInRing } from './geo';
import { GREEN_CHARTS } from '../data/greenCharts';
import { dec, sideWord, tr } from './i18n';

// Reading the green like a tour caddie (feature 024): heights of each green (LiDAR, 1 m grid, cm) let the app
// roll a putt the way a ball rolls – slope pulls it, the green slows it (the chosen green speed, medium = Stimp 9.5). From that: where to aim,
// how much up or down, and for the approach shot where the ball should finish (below the hole).

export interface GreenGrid {
  corners: [LngLat, LngLat, LngLat, LngLat]; // top-left, top-right, bottom-right, bottom-left (north up)
  size: number; // cells per side
  cell?: number; // metres per cell (default 1; Hetzenhof 0.5 from the 25 cm terrain model)
  base: number; // metres above sea level of value 0
  cm: number[]; // row 0 = north, cm above base
}

/** Putt physics (rules of thumb, Chris to confirm): Stimp 9.5 ≈ ball rolls 2.9 m from 1.83 m/s on the flat (medium greens). */
export const PUTT = { decel: (1.83 * 1.83) / (2 * 9.5 * 0.3048), slopeFactor: (5 / 7) * 9.81, holeR: 0.054, pastM: 0.4, dt: 0.01 };

/** Green speed the player chose (club greens in Germany in autumn ≈ Stimp 8.5–9.5, fast resort greens 11). */
export const STIMP = { slow: 8.5, medium: 9.5, fast: 11 } as const;
export function setGreenSpeed(speed: keyof typeof STIMP): void {
  PUTT.decel = (1.83 * 1.83) / (2 * STIMP[speed] * 0.3048);
}

const cache = new Map<string, Promise<Record<string, GreenGrid> | null>>();

/** Height grids of a course (public/greens/<course>/heights.json), loaded once and kept for the session. */
export function loadGreenGrids(courseId: string): Promise<Record<string, GreenGrid> | null> {
  const charts = GREEN_CHARTS[courseId];
  const first = charts && Object.values(charts)[0];
  if (!first) return Promise.resolve(null);
  if (!cache.has(courseId)) {
    const url = first.file.replace(/[^/]+$/, 'heights.json');
    cache.set(
      courseId,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(courseId)!;
}

// ---- grid coordinates: x metres east of the top-left corner, y metres south of it ----
interface Frame {
  g: GreenGrid;
  toXY: (p: LngLat) => [number, number];
  toLngLat: (x: number, y: number) => LngLat;
}

function frame(g: GreenGrid): Frame {
  const [tl, tr_, , bl] = g.corners;
  const k = 111320 * Math.cos((tl[1] * Math.PI) / 180);
  const loc = (p: LngLat): [number, number] => [(p[0] - tl[0]) * k, (p[1] - tl[1]) * 111320];
  const a = loc(tr_); // along the top edge (east)
  const b = loc(bl); // down the left edge (south)
  const det = a[0] * b[1] - a[1] * b[0];
  return {
    g,
    toXY: (p) => {
      const q = loc(p);
      const u = (q[0] * b[1] - q[1] * b[0]) / det;
      const v = (a[0] * q[1] - a[1] * q[0]) / det;
      return [u * g.size * (g.cell ?? 1), v * g.size * (g.cell ?? 1)]; // metres from the top-left corner
    },
    toLngLat: (x, y) => {
      const u = x / (g.size * (g.cell ?? 1));
      const v = y / (g.size * (g.cell ?? 1));
      return [tl[0] + (u * a[0] + v * b[0]) / k, tl[1] + (u * a[1] + v * b[1]) / 111320];
    },
  };
}

/** Height (m above base) at a position in metres from the top-left corner, bilinear between cell centres; null outside. */
function h(g: GreenGrid, x: number, y: number): number | null {
  const cx = x / (g.cell ?? 1) - 0.5;
  const cy = y / (g.cell ?? 1) - 0.5;
  if (cx < 0 || cy < 0 || cx > g.size - 1 || cy > g.size - 1) return null;
  const i = Math.min(g.size - 2, Math.floor(cx));
  const j = Math.min(g.size - 2, Math.floor(cy));
  const fx = cx - i;
  const fy = cy - j;
  const at = (c: number, r: number) => g.cm[r * g.size + c] / 100;
  return at(i, j) * (1 - fx) * (1 - fy) + at(i + 1, j) * fx * (1 - fy) + at(i, j + 1) * (1 - fx) * fy + at(i + 1, j + 1) * fx * fy;
}

/** Downhill pull in grid coordinates (dh/dx, dh/dy) per metre. */
function grad(g: GreenGrid, x: number, y: number): [number, number] {
  const e = 0.3;
  const hx0 = h(g, x - e, y), hx1 = h(g, x + e, y), hy0 = h(g, x, y - e), hy1 = h(g, x, y + e);
  if (hx0 == null || hx1 == null || hy0 == null || hy1 == null) return [0, 0];
  return [(hx1 - hx0) / (2 * e), (hy1 - hy0) / (2 * e)];
}

export function heightAt(g: GreenGrid, p: LngLat): number | null {
  const [x, y] = frame(g).toXY(p);
  const v = h(g, x, y);
  return v == null ? null : v + g.base;
}

interface Roll {
  path: [number, number][];
  stop: [number, number];
  closest: number;
  holed: boolean;
}

/** Rolls a ball from (x, y) with speed v0 (m/s) in direction ang (radians, grid frame: 0 = east, π/2 = south). */
function roll(g: GreenGrid, x0: number, y0: number, ang: number, v0: number, hole: [number, number], keepPath = false): Roll {
  let x = x0, y = y0, vx = v0 * Math.cos(ang), vy = v0 * Math.sin(ang);
  let closest = Infinity;
  const path: [number, number][] = keepPath ? [[x, y]] : [];
  for (let t = 0; t < 25; t += PUTT.dt) {
    const sp = Math.hypot(vx, vy);
    const [gx, gy] = grad(g, x, y);
    const ax = -PUTT.slopeFactor * gx - (sp > 1e-6 ? (PUTT.decel * vx) / sp : 0);
    const ay = -PUTT.slopeFactor * gy - (sp > 1e-6 ? (PUTT.decel * vy) / sp : 0);
    vx += ax * PUTT.dt;
    vy += ay * PUTT.dt;
    x += vx * PUTT.dt;
    y += vy * PUTT.dt;
    const d = Math.hypot(x - hole[0], y - hole[1]);
    if (d < closest) closest = d;
    if (d < PUTT.holeR && Math.hypot(vx, vy) < 1.3) return { path: keepPath ? [...path, [x, y]] : path, stop: [x, y], closest: 0, holed: true };
    if (keepPath && Math.round(t / PUTT.dt) % 8 === 0) path.push([x, y]);
    // stopped: slow and the slope cannot move it any more
    if (Math.hypot(vx, vy) < 0.02 && PUTT.slopeFactor * Math.hypot(gx, gy) < PUTT.decel) break;
    if (h(g, x, y) == null) break; // off the grid
  }
  return { path, stop: [x, y], closest, holed: false };
}

export interface PuttRead {
  distance: number; // m
  rise: number; // m, + = uphill to the hole
  aimCm: number; // aim point next to the hole, cm, + = right of the hole (seen from the ball)
  path: LngLat[]; // the ball's line
  text: string;
}

/** The putt from the ball to the hole: where to aim and how much it goes up or down. */
export function readPutt(g: GreenGrid, ball: LngLat, hole: LngLat): PuttRead | null {
  const f = frame(g);
  const [bx, by] = f.toXY(ball);
  const H = f.toXY(hole);
  const hb = h(g, bx, by);
  const hh = h(g, H[0], H[1]);
  if (hb == null || hh == null) return null;
  const D = Math.hypot(H[0] - bx, H[1] - by);
  if (D < 0.5 || D > 40) return null;
  const dir = Math.atan2(H[1] - by, H[0] - bx);
  // speed for an angle: the ball should stop 40 cm past the hole (measured along the line to the hole)
  // first guess from the flat roll plus the height to climb (energy), then bisection in a narrow bracket
  const guess = Math.sqrt(Math.max(0.05, 2 * (PUTT.decel * (D + PUTT.pastM) + PUTT.slopeFactor * (hh - hb))));
  const speedFor = (ang: number): number => {
    let lo = guess * 0.55, hi = guess * 1.7;
    for (let k = 0; k < 9; k++) {
      const mid = (lo + hi) / 2;
      const r = roll(g, bx, by, ang, mid, H);
      const along = (r.stop[0] - bx) * Math.cos(dir) + (r.stop[1] - by) * Math.sin(dir);
      if (r.holed || along > D + PUTT.pastM) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const tryAng = (ang: number) => {
    const v = speedFor(ang);
    const r = roll(g, bx, by, ang, v, H);
    return { ang, v, miss: r.holed ? 0 : r.closest };
  };
  // coarse (3°), then finer around the best (0.5°, 0.1°)
  let best = tryAng(dir);
  for (const [span, step] of [[30, 3], [2.5, 0.5], [0.4, 0.1]] as const) {
    const centre = best.ang;
    for (let d = -span; d <= span + 1e-9; d += step) {
      if (Math.abs(d) < 1e-9) continue;
      const c = tryAng(centre + (d * Math.PI) / 180);
      if (c.miss < best.miss) best = c;
    }
  }
  const r = roll(g, bx, by, best.ang, best.v, H, true);
  // aim point at the hole's distance, sideways offset (grid frame: + = right of the line ball → hole)
  const off = Math.sin(best.ang - dir) * D;
  const aimCm = Math.round(off * 100);
  const rise = hh - hb;
  return { distance: D, rise, aimCm, path: r.path.map(([x, y]) => f.toLngLat(x, y)), text: puttText(D, rise, aimCm) };
}

function puttText(D: number, rise: number, aimCm: number): string {
  const m = dec(D.toFixed(1));
  const cm = Math.abs(Math.round(rise * 100));
  const updown = cm < 3 ? tr('flat', 'flach') : rise > 0 ? tr(`${cm} cm uphill`, `${cm} cm bergauf`) : tr(`${cm} cm downhill`, `${cm} cm bergab`);
  const side = sideWord(aimCm > 0 ? 'right' : 'left');
  const a = Math.abs(aimCm);
  const aim =
    a < 5
      ? tr('straight at the hole', 'gerade aufs Loch')
      : a >= 100
        ? tr(`aim ${dec((a / 100).toFixed(1))} m ${side} of the hole`, `ziele ${dec((a / 100).toFixed(1))} m ${side} vom Loch`)
        : tr(`aim ${a} cm ${side} of the hole`, `ziele ${a} cm ${side} vom Loch`);
  const pace = rise < -0.12 && D < 8 ? tr(' – gently, it runs', ' – nur antippen, er läuft') : rise > 0.25 ? tr(' – firm', ' – kräftig') : '';
  return `${tr('Putt', 'Putt')} ${m} m, ${updown} – ${aim}${pace}`;
}

/**
 * Where the approach should finish (a caddie's "leave it below the hole"): positions 3–5 m around the pin on the
 * green, the one with the easiest putt (uphill, little break). Returns a sentence, seen from the player.
 */
export function bestLeave(g: GreenGrid, pin: LngLat, from: LngLat, green: Ring | null): { text: string; pos: LngLat } | null {
  const f = frame(g);
  const P = f.toXY(pin);
  const hp = h(g, P[0], P[1]);
  if (hp == null) return null;
  const approach = bearingDeg(from, pin);
  const cands: { pos: LngLat; score: number; rel: number; rise: number }[] = [];
  for (let a = 0; a < 360; a += 30) {
    for (const r of [3, 5]) {
      const x = P[0] + r * Math.sin((a * Math.PI) / 180);
      const y = P[1] - r * Math.cos((a * Math.PI) / 180);
      const pos = f.toLngLat(x, y);
      if (green && !pointInRing(pos, green)) continue;
      const hc = h(g, x, y);
      if (hc == null) continue;
      const rise = hp - hc; // + = uphill putt
      // side break: slope across the putt line at the middle
      const [gx, gy] = grad(g, (x + P[0]) / 2, (y + P[1]) / 2);
      const ux = (P[0] - x) / r, uy = (P[1] - y) / r;
      const across = Math.abs(gx * -uy + gy * ux) * 100; // % across
      const score = (rise < 0 ? -rise * 300 : -rise * 40) + across * 6 + r * 2;
      const rel = ((bearingDeg(pin, pos) - approach + 540) % 360) - 180; // 180 = short (towards the player)
      cands.push({ pos, score, rel, rise });
    }
  }
  if (cands.length < 4) return null;
  cands.sort((p, q) => p.score - q.score);
  const best = cands[0];
  const worst = cands[cands.length - 1];
  // Only worth saying when the green is not the same from every side
  if (worst.score - best.score < 12) return null;
  const ar = Math.abs(best.rel);
  const where = ar >= 135 ? 'short' : ar <= 45 ? 'long' : null;
  const lr = ar > 22 && ar < 158 ? (best.rel > 0 ? 'right' : 'left') : null;
  const deDepth: Record<string, string> = { short: 'vor', long: 'hinter' };
  const enPos = [where, lr].filter(Boolean).join('-') || 'beside';
  const dePos = where ? `${lr ? sideWord(lr) + ' ' : ''}${deDepth[where]} der Fahne` : lr ? `${sideWord(lr)} neben der Fahne` : 'neben der Fahne';
  const how = best.rise > 0.03 ? tr('uphill putt', 'Putt bergauf') : tr('flattest putt', 'flachster Putt');
  return { pos: best.pos, text: tr(`Best leave: ${enPos} of the pin – ${how}`, `Beste Ablage: ${dePos} – ${how}`) };
}

/** Distance from the ball to the pin inside the grid, for deciding when to show a putt read. */
export const onThisGreen = (g: GreenGrid, p: LngLat): boolean => {
  const [x, y] = frame(g).toXY(p);
  return h(g, x, y) != null;
};

export const _test = { frame, roll, distanceM };
