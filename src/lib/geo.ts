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

/** Centre of an area (a green's "middle"): the area centroid – the mean of the outline points leans towards the side
 *  mapped with more points (up to 2.7 m on the bundled greens). Degenerate outlines: the mean of the points. */
export function centroid(ring: Ring): LngLat {
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const s = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  const mean: LngLat = [s[0] / pts.length, s[1] / pts.length];
  if (pts.length < 3) return mean;
  const kx = Math.cos((mean[1] * Math.PI) / 180);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const x1 = (p[0] - mean[0]) * kx;
    const y1 = p[1] - mean[1];
    const x2 = (q[0] - mean[0]) * kx;
    const y2 = q[1] - mean[1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-14) return mean;
  return [mean[0] + cx / (3 * a) / kx, mean[1] + cy / (3 * a)];
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

/** Start and end of a hazard as seen from `from` playing towards `target`: the nearest and the farthest point of its
 *  outline, each with a dashed line out to the side away from the line of play – `out` lies `gap` metres beyond the
 *  hazard's outer edge, level with the point (Sascha 17.10.2026). side 1 = right of the line, −1 = left. */
export function hazardTicks(from: LngLat, target: LngLat, ring: Ring, gap = 10): { side: 1 | -1; front: { at: LngLat; out: LngLat; dist: number }; back: { at: LngLat; out: LngLat; dist: number } } {
  const proj = projector(from);
  const kx = Math.cos(rad(from[1])) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  const back2 = (x: number, y: number): LngLat => [from[0] + x / kx, from[1] + y / ky];
  const [tx, ty] = proj(target);
  const tl = Math.hypot(tx, ty) || 1;
  const u: [number, number] = [tx / tl, ty / tl]; // along the line of play
  const v: [number, number] = [u[1], -u[0]]; // to the right of it
  // the outline every metre, so start and end are found on the edges too
  const pts: [number, number][] = [];
  const xy = ring.map(proj);
  for (let i = 1; i < xy.length; i++) {
    const [a, b] = [xy[i - 1], xy[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (pts.length === 0) pts.push(...xy);
  const lat = (p: [number, number]) => p[0] * v[0] + p[1] * v[1];
  const along = (p: [number, number]) => p[0] * u[0] + p[1] * u[1];
  const meanLat = pts.reduce((s, p) => s + lat(p), 0) / pts.length;
  const side: 1 | -1 = meanLat >= 0 ? 1 : -1;
  const edge = side > 0 ? Math.max(...pts.map(lat)) : Math.min(...pts.map(lat));
  const outLat = edge + side * gap;
  const dist = (p: [number, number]) => Math.hypot(p[0], p[1]);
  let near = pts[0];
  let far = pts[0];
  for (const p of pts) {
    if (dist(p) < dist(near)) near = p;
    if (dist(p) > dist(far)) far = p;
  }
  const tick = (p: [number, number]) => {
    const a = along(p);
    return { at: back2(p[0], p[1]), out: back2(a * u[0] + outLat * v[0], a * u[1] + outLat * v[1]), dist: dist(p) };
  };
  return { side, front: tick(near), back: tick(far) };
}

/** Hazards close together as one (Sascha 17.10.2026: "still very cluttered"): rings less than `gapM` apart are joined
 *  into their convex outline – a bunker complex gets one start and one end. */
export function groupHazards(rings: Ring[], gapM = 12): Ring[] {
  const parent = rings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++) {
      if (find(i) === find(j)) continue;
      if (rings[i].some((a) => rings[j].some((b) => distanceM(a, b) < gapM))) parent[find(i)] = find(j);
    }
  const groups = new Map<number, Ring[]>();
  rings.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]));
  return [...groups.values()].map((g) => (g.length === 1 ? g[0] : hull(g.flat())));
}

/** Convex outline of points (monotone chain), closed. */
function hull(pts: LngLat[]): Ring {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: LngLat[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: LngLat[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...h, h[0]];
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
  /** Metres of the mapped hole line before this line's start (a forward tee: +, a tee behind it: −). The terrain
   *  profiles (heights, side slopes) are measured along the mapped line, from its first point. */
  along0?: number;
}

/** Position along the mapped hole line – the scale of the terrain profiles – whichever tee the line starts at. */
export function profileAlong(d: HoleMapData, p: LngLat): number {
  return alongLine(d.line, p) + (d.along0 ?? 0);
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

/**
 * A hole mapped as an area – its closed outline – instead of a line from the tee to the green (night check 22.10.2026:
 * Freiburger Golfclub, "middle 32 m" on a par 5 – tee and green were the same point): the playing line from the tee
 * box farthest from the green inside the outline (else the outline's farthest point) to that green. A line stays as it is.
 */
export function holeLineOf(raw: LngLat[], geo: Pick<CourseGeometry, 'green' | 'tee'>): LngLat[] {
  const closed = raw.length >= 4 && distanceM(raw[0], raw[raw.length - 1]) < 3;
  if (!closed) return raw;
  const inside = (r: Ring) => r.length >= 3 && pointInRing(centroid(r), raw);
  const greens = geo.green.filter(inside).map(centroid);
  const tees = geo.tee.filter(inside).map(centroid);
  let best: [LngLat, LngLat] | null = null;
  let far = -1;
  const pair = (from: LngLat[], to: LngLat[]) => {
    for (const a of from)
      for (const b of to) {
        const d = distanceM(a, b);
        if (d > far) {
          far = d;
          best = [a, b];
        }
      }
  };
  if (greens.length) pair(tees.length ? tees : raw, greens);
  else if (tees.length) pair(tees, raw);
  return best ?? raw;
}

/** Every hole of the course as a playing line (see holeLineOf). */
export function holesAsLines(geo: CourseGeometry): CourseGeometry {
  if (!geo.holes.some((h) => h.line.length >= 4 && distanceM(h.line[0], h.line[h.line.length - 1]) < 3)) return geo;
  return { ...geo, holes: geo.holes.map((h) => ({ ...h, line: holeLineOf(h.line, geo) })) };
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
  // only when that end really is at a green (27.10.2026, Hawks Landing 18: its island green is not in the map – the nearest
  // mapped green lay a little nearer the tee, and the hole was turned round)
  const toStart = nearestGreen(raw[0]);
  const line = toStart < nearestGreen(raw[raw.length - 1]) && toStart < 60 ? raw.slice().reverse() : raw;
  const end = line[line.length - 1];
  const green =
    geo.green.find((g) => pointInRing(end, g)) ??
    geo.green
      .map((g) => ({ g, d: distanceM(end, centroid(g)) }))
      .filter((x) => x.d < 60)
      .sort((a, b) => a.d - b.d)[0]?.g ??
    null;
  const near = (ring: Ring) => ring.some((p) => distToLine(p, line) <= corridorM) || (green != null && ring.some((p) => distanceM(p, centroid(green)) < 40));
  // Hazards of this hole only (Sascha 15.10.2026: "the pond beside 8A does not belong to the hole"):
  // - bunkers up to 45 m from the line; fairway bunkers up to 60 m, up to 65 m when no other hole's line is nearer
  //   to them (14.10.: "some fairway bunkers are missing"), never the greenside bunkers of another hole;
  // - water up to 30 m from the line or right at the green; up to 45 m when no other hole is nearer.
  const ownGreen = green ? centroid(green) : end;
  const otherGreens = geo.green.filter((g) => g !== green).map(centroid);
  const otherLines = geo.holes.filter((h) => h !== hole && h.line.length >= 2).map((h) => h.line);
  const mine = (ring: Ring) => {
    const c = centroid(ring);
    const d = distToLine(c, line);
    return otherLines.every((o) => distToLine(c, o) > d);
  };
  const edge = (ring: Ring) => Math.min(...ring.map((p) => distToLine(p, line)));
  const ownBunker = (ring: Ring) => {
    const c = centroid(ring);
    const atOtherGreen = otherGreens.some((g) => distanceM(c, g) < 40) && distanceM(c, ownGreen) > 40;
    // up to 60 m even when it lies on a neighbouring fairway: a big miss reaches it, and it is on the map (Sascha
    // 17.10.2026: "3C has three bunkers right, two are shown" – the third sits by the line of 4C)
    return !atOtherGreen && edge(ring) <= 65 && (mine(ring) || edge(ring) <= 60);
  };
  const ownWater = (ring: Ring) => {
    const e = edge(ring);
    const byGreen = green != null && ring.some((p) => distanceM(p, centroid(green)) < 35);
    return e <= 30 || byGreen || (e <= 45 && mine(ring));
  };
  // The forward tees too (Sascha 28.10.2026, 4B Hetzenhof: "no tee drawn" – the line starts at the back tee, yellow lies
  // 105 m ahead beside it, red 176 m): on the first part of the hole, by its line, no other hole's line nearer.
  const length = line.slice(1).reduce((s, p, i) => s + distanceM(line[i], p), 0);
  const forwardTee = (ring: Ring) => edge(ring) <= 30 && alongLine(line, centroid(ring)) <= Math.min(220, length * 0.45) && mine(ring);
  return {
    line,
    tee: line[0],
    green,
    greenCenter: green ? centroid(green) : end,
    bunkers: geo.bunker.filter((r) => near(r) || ownBunker(r)),
    water: islandsCut(geo.water.filter(ownWater), geo.green),
    fairways: geo.fairway.filter((r) => r.some((p) => distToLine(p, line) <= 20)),
    tees: geo.tee.filter((r) => r.some((p) => distanceM(p, line[0]) <= 60) || forwardTee(r)),
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
  const NEXT_TEE_M = 80; // around a tee: on the way there or still close by
  const CLEARLY_M = 20; // nearer to a later hole's line than to the current one by this much
  const OFF_CUR_M = 50; // and this far off the current hole's line – a wide shot into the neighbouring hole stays on its own hole
  const cur = holes[current];
  const next = holes[current + 1];
  const ahead: number[] = [];
  for (let k = current + 1; k <= current + 3 && k < holes.length; k++) if (holes[k]) ahead.push(k);
  // Holes are played in order: a later hole only when the player is clearly away from the current and the next tee
  // (night run 15./16.10.2026, Son Térmens: the 18th tee lies next to the 16th, the 18th fairway between the 15th
  // green and the 16th tee – the app jumped from 15 to 18 and stayed there).
  const nearNextTee = next != null && distanceM(pos, next.tee) <= NEXT_TEE_M;
  const nearCurTee = cur != null && distanceM(pos, cur.tee) <= NEXT_TEE_M;
  const mayJump = !nearNextTee && !nearCurTee;
  const allowed = (k: number) => k === current + 1 || mayJump;
  const inReach = ahead.filter((k) => allowed(k) && distanceM(pos, holes[k]!.tee) <= TEE_M).sort((a, b) => distanceM(pos, holes[a]!.tee) - distanceM(pos, holes[b]!.tee));
  const onTee = inReach.includes(current + 1) ? current + 1 : inReach[0];
  if (cur) {
    // standing on the current tee: stay
    const onCurTee = distanceM(pos, cur.tee) <= TEE_M && (onTee == null || distanceM(pos, cur.tee) <= distanceM(pos, holes[onTee]!.tee));
    // Next tee right behind the current green: switch only once the player has left the green.
    if (onTee != null && !onCurTee && distanceM(pos, cur.greenCenter) > 25) return onTee;
    if (distToLine(pos, cur.line) <= ON_HOLE_M) return null;
  } else if (onTee != null) return onTee;
  // on a later hole's fairway only when well off the current hole and clearly nearer to the other – holes side by side
  // (Hetzenhof 4A and 5A, Sascha 24.10.2026: his ball 36–43 m beside 4A lay 23–28 m from 5A's line, and the app jumped to
  // 5A in the middle of 4A; his GPS track replayed: no wrong jump left). The next tee still switches at once (above).
  const curLine = cur ? distToLine(pos, cur.line) : Infinity;
  return ahead.find((k) => allowed(k) && distToLine(pos, holes[k]!.line) <= ON_HOLE_M && curLine > OFF_CUR_M && distToLine(pos, holes[k]!.line) + CLEARLY_M <= curLine) ?? null;
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
  let along0 = d.along0 ?? 0;
  if (delta > 0) {
    const total = lineLength(d.line);
    const start = Math.min(delta, total - 30);
    along0 += start;
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
    along0 -= m;
    const p0 = d.line[0];
    line = [[p0[0] + (m * Math.sin(r)) / (111320 * Math.cos((p0[1] * Math.PI) / 180)), p0[1] + (m * Math.cos(r)) / 111320], ...d.line];
  }
  return { ...d, line, tee: line[0], along0 };
}

/** Shift for the chosen tee: the line starts at the tee whose length is closest to the line's length. */
export function teeDelta(lengths: (number | null)[] | undefined, teeIndex: number, lineM: number): number {
  const want = lengths?.[teeIndex];
  if (!lengths || want == null) return 0;
  const ref = lengths.reduce<number | null>((best, l) => (l != null && (best == null || Math.abs(l - lineM) < Math.abs(best - lineM)) ? l : best), null);
  return ref == null ? 0 : ref - want;
}

/**
 * Where the green is played from: the point on the hole line 100 m before the green (the tee on short holes).
 * "Front", "back", "left" and "right" of a green – on a pin sheet and for the slope of the green – are seen from here,
 * not from the tee: on a dogleg the tee looks at the green from the side.
 */
export function approachFrom(d: { line: LngLat[]; tee: LngLat }): LngLat {
  const L = lineLength(d.line);
  return L > 100 ? pointAt(d.line, L - 100) : d.tee;
}

/** Area of a ring in m² (small rings, flat earth). */
export function ringArea(r: Ring): number {
  if (r.length < 3) return 0;
  const k = 111320 * Math.cos((r[0][1] * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * k * (r[i + 1][1] * 110540) - r[i + 1][0] * k * (r[i][1] * 110540);
  return Math.abs(a) / 2;
}

/** The woods the caddie plays around (Sascha's Hetzenhof notes, 15.10.2026: the woods at 4A/5A swallow balls but are
 *  hardly mapped in OSM): the mapped woods plus every tree-crown area from the aerial image of 1000 m² or more. */
export function woodsOf(g: { trees?: Ring[]; canopy?: Ring[] }): Ring[] {
  return [...(g.trees ?? []), ...(g.canopy ?? []).filter((r) => ringArea(r) >= 1000)];
}

/** Trees the player can aim at: OSM single trees and single crowns from the aerial image (15–600 m²). */
export function landmarksOf(g: { treePoints?: LngLat[]; canopy?: Ring[] }): LngLat[] {
  return [...(g.treePoints ?? []), ...(g.canopy ?? []).filter((r) => { const a = ringArea(r); return a >= 15 && a <= 600; }).map((r) => centroid(r))];
}

/**
 * The flag stays on the green (Sascha 16.10.2026: "Fahne sollte sich nur auf dem Grün verschieben lassen"): a point
 * off the green – or closer than `inset` metres to its edge – moves to the nearest spot `inset` metres inside the
 * edge. Without a mapped green: within 25 m of its centre.
 */
export function keepOnGreen(p: LngLat, green: Ring | null, center: LngLat, inset = 1): LngLat {
  if (!green || green.length < 3) {
    const d = distanceM(center, p);
    if (d <= 25) return p;
    const k = 25 / d;
    return [center[0] + (p[0] - center[0]) * k, center[1] + (p[1] - center[1]) * k];
  }
  if (pointInRing(p, green) && distToLine(p, green) >= inset) return p;
  // nearest point on the outline (flat metres around the point)
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110540;
  const to = (q: LngLat): [number, number] => [(q[0] - p[0]) * kx, (q[1] - p[1]) * ky];
  let best: [number, number] = [0, 0];
  let bestD = Infinity;
  for (let i = 1; i < green.length; i++) {
    const [ax, ay] = to(green[i - 1]);
    const [bx, by] = to(green[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const q: [number, number] = [ax + t * dx, ay + t * dy];
    const d = Math.hypot(q[0], q[1]);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  // then `inset` metres towards the centre of the green
  const [cx, cy] = to(center);
  const len = Math.hypot(cx - best[0], cy - best[1]) || 1;
  const s = Math.min(inset, len);
  const x = best[0] + ((cx - best[0]) / len) * s;
  const y = best[1] + ((cy - best[1]) / len) * s;
  return [p[0] + x / kx, p[1] + y / ky];
}
