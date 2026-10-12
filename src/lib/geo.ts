import type { CourseGeometry, LngLat, Ring } from '../types';
import { parseHoleRef } from './loops';

// Geometry helpers for the hole map. Distances are ground distances in metres.
// Over a golf hole (< 700 m) a local flat projection is accurate to centimetres.

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass bearing from a to b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Local x/y in metres around an origin (x east, y north). */
function projector(origin: LngLat) {
  const kx = Math.cos(rad(origin[1])) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  return (p: LngLat): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky];
}

export function centroid(ring: Ring): LngLat {
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const s = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

export function pointInRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Course areas mapped twice in OSM (Son Antem: one area for both courses plus a multipolygon for parts of it):
 * a ring that lies (almost) entirely inside another one is no real boundary – its edges would cut through the
 * course as false out of bounds. Such rings are dropped.
 */
export function dropNestedRings(rings: Ring[]): Ring[] {
  return rings.filter((r, i) => {
    const pts = r.slice(0, -1);
    return !rings.some((o, j) => j !== i && o.length > 3 && pts.filter((p) => pointInRing(p, o)).length >= 0.9 * pts.length && ringAreaAbs(o) > ringAreaAbs(r));
  });
}

function ringAreaAbs(r: Ring): number {
  let a = 0;
  for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
  return Math.abs(a / 2);
}

/** Distance from point p to segment ab, in metres. */
function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const proj = projector(p);
  const [ax, ay] = proj(a);
  const [bx, by] = proj(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distToLine(p: LngLat, line: LngLat[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
  return best;
}

/**
 * Front and back of the green as seen from `from`: where the line from the player to the green
 * centre enters and leaves the green outline. Falls back to the nearest/farthest edge point.
 */
export function greenFrontBack(from: LngLat, green: Ring): { front: number; center: number; back: number } {
  const c = centroid(green);
  const center = distanceM(from, c);
  const proj = projector(from);
  const [cx, cy] = proj(c);
  const len = Math.hypot(cx, cy) || 1;
  const ux = cx / len;
  const uy = cy / len;
  const hits: number[] = [];
  const pts = green.map(proj);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const denom = ux * ey - uy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (x1 * ey - y1 * ex) / denom; // distance along the ray
    const s = (x1 * uy - y1 * ux) / denom; // position on the edge (0..1)
    if (t >= 0 && s >= 0 && s <= 1) hits.push(t);
  }
  if (hits.length >= 2) return { front: Math.min(...hits), center, back: Math.max(...hits) };
  if (hits.length === 1) return { front: 0, center, back: hits[0] }; // standing on the green
  const d = pts.map(([x, y]) => Math.hypot(x, y));
  return { front: Math.min(...d), center, back: Math.max(...d) };
}

/** Distance to reach a hazard and to carry it (nearest / farthest point of its outline). */
export function hazardToCarry(from: LngLat, ring: Ring): { to: number; carry: number } {
  let to = Infinity;
  for (let i = 1; i < ring.length; i++) to = Math.min(to, distToSegment(from, ring[i - 1], ring[i]));
  const carry = Math.max(...ring.map((p) => distanceM(from, p)));
  return { to, carry };
}

/** Is `p` in front of `from` when playing towards `target`? */
export function isAhead(from: LngLat, target: LngLat, p: LngLat): boolean {
  const proj = projector(from);
  const [tx, ty] = proj(target);
  const [px, py] = proj(p);
  return tx * px + ty * py > 0;
}

/** Length of a polyline in metres. */
export function lineLength(line: LngLat[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += distanceM(line[i - 1], line[i]);
  return s;
}

/** Position along the line (metres from its start) of the point on the line nearest to p. */
export function alongLine(line: LngLat[], p: LngLat): number {
  let best = Infinity;
  let bestS = 0;
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = distanceM(a, b);
    const proj = projector(a);
    const [bx, by] = proj(b);
    const [px, py] = proj(p);
    const t = seg === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / (seg * seg)));
    const d = Math.hypot(px - t * bx, py - t * by);
    if (d < best) {
      best = d;
      bestS = s + t * seg;
    }
    s += seg;
  }
  return bestS;
}

/** The point at `meters` from the start of the line (clamped to the line). */
export function pointAt(line: LngLat[], meters: number): LngLat {
  let left = Math.max(0, meters);
  for (let i = 1; i < line.length; i++) {
    const seg = distanceM(line[i - 1], line[i]);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    left -= seg;
  }
  return line[line.length - 1];
}

/**
 * Suggested next landing point along the hole's playing line: from the last planned point,
 * a full shot (default 220 m) or a bit more than half of what is left, whichever is shorter.
 */
export function suggestTarget(line: LngLat[], lastPoint: LngLat, fullShotM = 220): LngLat {
  const total = lineLength(line);
  const s = alongLine(line, lastPoint);
  const rest = total - s;
  return pointAt(line, s + Math.min(fullShotM, rest * 0.55));
}

export interface HoleMapData {
  line: LngLat[]; // tee → pin
  tee: LngLat;
  green: Ring | null;
  greenCenter: LngLat;
  bunkers: Ring[];
  water: Ring[];
  fairways: Ring[];
  tees: Ring[]; // tee boxes at the start of the hole
}

/** Picks the geometry that belongs to one hole: its line, green, and hazards along the corridor. */
/**
 * Island greens (feature 025): OSM often maps a pond as one plain area right over its island green (Maioris 4).
 * Each green lying completely inside a water area is cut out with a keyhole outline – a zero-width bridge from
 * the shore to the island – so point-in-polygon tests and the map treat the green as dry land.
 */
export function islandsCut(water: Ring[], greens: Ring[]): Ring[] {
  return water.map((w) => {
    let ring = w;
    for (const g of greens) {
      if (!g.every((p) => pointInRing(p, ring))) continue;
      const open = (r: Ring) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r.slice());
      const outer = open(ring);
      const island = open(g).reverse(); // opposite direction to the shore
      let best = { i: 0, j: 0, d: Infinity };
      outer.forEach((p, i) => island.forEach((q, j) => {
        const d = distanceM(p, q);
        if (d < best.d) best = { i, j, d };
      }));
      const rot = [...island.slice(best.j), ...island.slice(0, best.j), island[best.j]];
      const cut = [...outer.slice(0, best.i + 1), ...rot, ...outer.slice(best.i)];
      ring = [...cut, cut[0]];
    }
    return ring;
  });
}

export function holeMapData(geo: CourseGeometry, loop: string, number: number, corridorM = 45): HoleMapData | null {
  const hole = geo.holes.find((h) => {
    const p = parseHoleRef(h.ref);
    return p && p.loop === loop && p.number === number;
  });
  if (!hole || hole.line.length < 2) return null;
  // OSM mappers sometimes draw the hole from pin to tee. The end nearer to a green is the pin.
  const nearestGreen = (p: LngLat) => Math.min(...geo.green.map((g) => (pointInRing(p, g) ? 0 : distanceM(p, centroid(g)))));
  const raw = hole.line;
  const line = nearestGreen(raw[0]) < nearestGreen(raw[raw.length - 1]) ? raw.slice().reverse() : raw;
  const end = line[line.length - 1];
  const green =
    geo.green.find((g) => pointInRing(end, g)) ??
    geo.green
      .map((g) => ({ g, d: distanceM(end, centroid(g)) }))
      .filter((x) => x.d < 60)
      .sort((a, b) => a.d - b.d)[0]?.g ??
    null;
  const near = (ring: Ring) => ring.some((p) => distToLine(p, line) <= corridorM) || (green != null && ring.some((p) => distanceM(p, centroid(green)) < 40));
  return {
    line,
    tee: line[0],
    green,
    greenCenter: green ? centroid(green) : end,
    bunkers: geo.bunker.filter(near),
    water: islandsCut(geo.water.filter((r) => r.some((p) => distToLine(p, line) <= corridorM * 1.5)), geo.green),
    fairways: geo.fairway.filter((r) => r.some((p) => distToLine(p, line) <= 20)),
    tees: geo.tee.filter((r) => r.some((p) => distanceM(p, line[0]) <= 60)),
  };
}

/**
 * Which hole is the player on? Used when the app is opened again after the phone was in the pocket.
 * Only looks forward (the next 3 holes), so walking past an earlier hole never jumps back.
 * Returns the index of the hole to switch to, or null to stay on the current hole.
 */
export function detectHole(pos: LngLat, holes: (HoleMapData | null)[], current: number): number | null {
  const TEE_M = 25; // standing on a tee
  const ON_HOLE_M = 30; // inside the hole's corridor
  const cur = holes[current];
  const ahead: number[] = [];
  for (let k = current + 1; k <= current + 3 && k < holes.length; k++) if (holes[k]) ahead.push(k);
  const onTee = ahead.find((k) => distanceM(pos, holes[k]!.tee) <= TEE_M);
  if (cur) {
    // Next tee right behind the current green: switch only once the player has left the green.
    if (onTee != null && distanceM(pos, cur.greenCenter) > 25) return onTee;
    if (distToLine(pos, cur.line) <= ON_HOLE_M) return null;
  } else if (onTee != null) return onTee;
  return ahead.find((k) => distToLine(pos, holes[k]!.line) <= ON_HOLE_M) ?? null;
}

export type Unit = 'm' | 'yd';
export function formatDistance(m: number, unit: Unit): string {
  return String(Math.round(unit === 'yd' ? m * 1.09361 : m));
}

/**
 * The hole from another tee: `delta` metres further forward (> 0) or back (< 0) than where the line starts.
 * Forward cuts the line; back extends it straight behind the tee.
 */
export function shiftTee(d: HoleMapData, delta: number): HoleMapData {
  if (Math.abs(delta) < 2) return d;
  let line: LngLat[];
  if (delta > 0) {
    const total = lineLength(d.line);
    const start = Math.min(delta, total - 30);
    const rest: LngLat[] = [pointAt(d.line, start)];
    let acc = 0;
    for (let k = 0; k + 1 < d.line.length; k++) {
      acc += distanceM(d.line[k], d.line[k + 1]);
      if (acc > start) rest.push(d.line[k + 1]);
    }
    line = rest;
  } else {
    const b = bearingDeg(d.line[1], d.line[0]); // backwards from the tee
    const r = (b * Math.PI) / 180;
    const m = -delta;
    const p0 = d.line[0];
    line = [[p0[0] + (m * Math.sin(r)) / (111320 * Math.cos((p0[1] * Math.PI) / 180)), p0[1] + (m * Math.cos(r)) / 111320], ...d.line];
  }
  return { ...d, line, tee: line[0] };
}

/** Shift for the chosen tee: the line starts at the tee whose length is closest to the line's length. */
export function teeDelta(lengths: (number | null)[] | undefined, teeIndex: number, lineM: number): number {
  const want = lengths?.[teeIndex];
  if (!lengths || want == null) return 0;
  const ref = lengths.reduce<number | null>((best, l) => (l != null && (best == null || Math.abs(l - lineM) < Math.abs(best - lineM)) ? l : best), null);
  return ref == null ? 0 : ref - want;
}
