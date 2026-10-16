import type { LngLat } from '../types';
import { distToLine, pointInRing } from './geo';

// The drawn hole at BeBrassie quality (Sascha 16.10.2026: "this quality is the least I want in the 2D view"):
// soft outlines instead of the jagged OSM polygons, the hole's own dark rough as one smooth shape around fairway,
// green, tees and bunkers on a light ground, and trees as single drawn crowns instead of dark woodland areas.

type Ring = LngLat[];
type XY = [number, number];

const M_PER_DEG = 111320;

/** A flat metre grid around a point – fine for one golf hole. */
function grid(origin: LngLat) {
  const kx = M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180);
  return {
    to: (p: LngLat): XY => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * M_PER_DEG],
    from: (q: XY): LngLat => [origin[0] + q[0] / kx, origin[1] + q[1] / M_PER_DEG],
  };
}

/** Chaikin's corner cutting on a closed ring: every pass rounds the corners a little more (2 passes ≈ soft). */
export function smoothRing(ring: Ring, passes = 2): Ring {
  let pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  if (pts.length < 3) return ring;
  for (let k = 0; k < passes; k++) {
    const next: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = next;
  }
  return [...pts, pts[0]];
}

/** Chaikin on an open line (ends kept). */
export function smoothLine(line: LngLat[], passes = 2): LngLat[] {
  let pts = line.slice();
  if (pts.length < 3) return pts;
  for (let k = 0; k < passes; k++) {
    const next: LngLat[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** Station along the polyline and signed offset (left of the playing direction +) of a point, in metres. */
function station(line: XY[], cum: number[], p: XY): { s: number; o: number } {
  let best = { s: 0, o: 0, d: Infinity };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    // unclamped at the ends, so a point behind the tee or beyond the green gets a station outside 0…L
    const tRaw = ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2;
    const t = Math.min(i === line.length - 2 ? Infinity : 1, Math.max(i === 0 ? -Infinity : 0, tRaw));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best.d) {
      const len = Math.sqrt(len2);
      const cross = (dx * (p[1] - ay) - dy * (p[0] - ax)) / len;
      best = { s: cum[i] + t * len, o: cross, d };
    }
  }
  return best;
}

/** A point on the polyline at station s (extended straight beyond both ends) and the left normal there. */
function along(line: XY[], cum: number[], s: number): { p: XY; n: XY } {
  const L = cum[cum.length - 1];
  const at = (u: number): XY => {
    const v = Math.max(0, Math.min(L, u));
    let i = 0;
    while (i < line.length - 2 && cum[i + 1] < v) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const t = (v - cum[i]) / seg;
    const base: XY = [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])];
    // beyond an end: straight on in the end segment's direction
    const over = u < 0 ? u : u > L ? u - L : 0;
    if (!over) return base;
    const j = u < 0 ? 0 : line.length - 2;
    const dx = line[j + 1][0] - line[j][0];
    const dy = line[j + 1][1] - line[j][1];
    const len = Math.hypot(dx, dy) || 1;
    return [base[0] + (over * dx) / len, base[1] + (over * dy) / len];
  };
  // the direction over ±15 m, so a dogleg's corner turns smoothly
  const a = at(s - 15);
  const b = at(s + 15);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: at(s), n: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] };
}

/**
 * The hole's own rough as one smooth shape (the dark green band of BeBrassie): along the hole line, as wide as the
 * fairway, green, tees and bunkers reach on each side plus a margin, at least `minHalf` metres; rounded at both ends.
 */
export function holeOutline(line: LngLat[], parts: Ring[], opts: { margin?: number; minHalf?: number; behindTee?: number; beyondGreen?: number } = {}): Ring | null {
  if (line.length < 2) return null;
  const margin = opts.margin ?? 9;
  const minHalf = opts.minHalf ?? 16;
  const g = grid(line[0]);
  const xy = line.map(g.to);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L < 20) return null;
  // the parts' stations: the outline runs from behind the rearmost tee to behind the green's back edge
  const st = parts
    .flat()
    .map(g.to)
    .map((q) => station(xy, cum, q))
    .filter(({ s, o }) => s > -60 && s < L + 60 && Math.abs(o) <= 55); // not a stray part of a neighbouring hole
  const s0 = Math.min(0, ...st.map((x) => x.s)) - (opts.behindTee ?? 10);
  const s1 = Math.max(L, ...st.map((x) => x.s)) + (opts.beyondGreen ?? 12);
  const n = Math.ceil((s1 - s0) / 6) + 1;
  const STEP = (s1 - s0) / (n - 1); // the last station exactly at the end
  const left = new Array<number>(n).fill(0);
  const right = new Array<number>(n).fill(0);
  for (const { s, o } of st) {
    const k = Math.max(0, Math.min(n - 1, Math.round((s - s0) / STEP)));
    if (o >= 0) left[k] = Math.max(left[k], o);
    else right[k] = Math.max(right[k], -o);
  }
  // a part's width counts a little before and after it (a vertex every few metres only), then a soft running mean
  const spread = (w: number[]) => w.map((_, k) => Math.max(...w.slice(Math.max(0, k - 2), k + 3)));
  const mean = (w: number[]) => w.map((_, k) => {
    const win = w.slice(Math.max(0, k - 3), k + 4);
    return win.reduce((t, x) => t + x, 0) / win.length;
  });
  const lw = mean(spread(left)).map((w) => Math.min(55, Math.max(minHalf, w + margin)));
  const rw = mean(spread(right)).map((w) => Math.min(55, Math.max(minHalf, w + margin)));
  // narrower towards the very ends: a rounded cap instead of a square one
  const cap = (k: number, w: number) => {
    const s = s0 + k * STEP;
    const d = Math.max(0, Math.min(s - s0, s1 - s));
    return d >= 18 ? w : w * Math.max(0.35, Math.sqrt(d / 18));
  };
  const L_: XY[] = [];
  const R_: XY[] = [];
  for (let k = 0; k < n; k++) {
    const { p, n: nn } = along(xy, cum, s0 + k * STEP);
    const wl = cap(k, lw[k]);
    const wr = cap(k, rw[k]);
    L_.push([p[0] + nn[0] * wl, p[1] + nn[1] * wl]);
    R_.push([p[0] - nn[0] * wr, p[1] - nn[1] * wr]);
  }
  const ring = [...L_, ...R_.reverse()].map(g.from);
  return smoothRing([...ring, ring[0]], 3);
}

/** A stable pseudo-random number in [0, 1) for a position – the same trees on every visit. */
function hash(x: number, y: number, k = 0): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export interface TreeSpot {
  pos: LngLat;
  /** size factor (≈ 0.75–1.3) */
  s: number;
  /** look: 0–2 (three slightly different crowns) */
  v: number;
}

/**
 * Single drawn trees for the hole (BeBrassie draws crowns, not woodland areas): mapped single trees, a tree every
 * ~6 m along tree rows and hedges, and woods filled with crowns – densely along their edge, looser inside – all
 * within `corridor` metres of the hole line, at most `max`.
 */
export function treeSpots(line: LngLat[], woods: Ring[], rows: LngLat[][], singles: LngLat[], corridor = 60, max = 900): TreeSpot[] {
  if (line.length < 2) return [];
  const g = grid(line[0]);
  const near = (p: LngLat) => distToLine(p, line) <= corridor;
  const out: TreeSpot[] = [];
  const taken: XY[] = [];
  const add = (p: LngLat, spacing: number, big = 1) => {
    if (out.length >= max || !near(p)) return;
    const q = g.to(p);
    if (taken.some((t) => Math.abs(t[0] - q[0]) < spacing && Math.abs(t[1] - q[1]) < spacing && Math.hypot(t[0] - q[0], t[1] - q[1]) < spacing)) return;
    taken.push(q);
    const h = hash(q[0], q[1]);
    out.push({ pos: p, s: big * (0.8 + 0.45 * h), v: Math.floor(hash(q[0], q[1], 1) * 3) });
  };
  for (const p of singles) add(p, 3, 1.15);
  const walk = (pts: LngLat[], every: number, spacing: number) => {
    for (let i = 1; i < pts.length; i++) {
      const a = g.to(pts[i - 1]);
      const b = g.to(pts[i]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d < len; d += every) {
        const t = d / (len || 1);
        const j = (hash(a[0] + d, a[1], 2) - 0.5) * every * 0.5;
        add(g.from([a[0] + t * (b[0] - a[0]) + j, a[1] + t * (b[1] - a[1]) - j]), spacing);
      }
    }
  };
  for (const r of rows) walk(r, 6, 4.5);
  for (const w of woods) {
    walk(w, 5.5, 4.5); // the edge first – it is what the player sees from the fairway
  }
  for (const w of woods) {
    // inside: a jittered 8 m grid
    const xs = w.map((p) => g.to(p));
    const [minX, maxX] = [Math.min(...xs.map((q) => q[0])), Math.max(...xs.map((q) => q[0]))];
    const [minY, maxY] = [Math.min(...xs.map((q) => q[1])), Math.max(...xs.map((q) => q[1]))];
    for (let x = minX; x <= maxX; x += 8) {
      for (let y = minY; y <= maxY; y += 8) {
        const jx = (hash(x, y, 3) - 0.5) * 5;
        const jy = (hash(x, y, 4) - 0.5) * 5;
        const p = g.from([x + jx, y + jy]);
        if (pointInRing(p, w)) add(p, 6.5);
      }
    }
  }
  return out;
}

/**
 * The fairway as BeBrassie draws it: one calm shape instead of the frayed areas read from the aerial image (holes and
 * notches inside are filled). Measured across the hole every 5 m – from the outermost fairway point on the left to the
 * one on the right – smoothed, with rounded ends. A real gap (a stream, rough before the green) of more than 15 m
 * stays a gap.
 */
export function fairwayShapes(line: LngLat[], fairways: Ring[]): Ring[] {
  if (line.length < 2 || !fairways.length) return [];
  const g = grid(line[0]);
  const xy = line.map(g.to);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const L = cum[cum.length - 1];
  const rings = fairways.map((r) => r.map(g.to));
  const inside = (q: XY) => rings.some((r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (r[i][1] > q[1] !== r[j][1] > q[1] && q[0] < ((r[j][0] - r[i][0]) * (q[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  });
  const STEP = 5;
  const bins: ({ lo: number; hi: number } | null)[] = [];
  for (let s = 0; s <= L; s += STEP) {
    const { p, n } = along(xy, cum, s);
    let lo = Infinity;
    let hi = -Infinity;
    for (let o = -60; o <= 60; o += 2) {
      if (inside([p[0] + n[0] * o, p[1] + n[1] * o])) {
        lo = Math.min(lo, o);
        hi = Math.max(hi, o);
      }
    }
    bins.push(hi >= lo ? { lo: lo - 1, hi: hi + 1 } : null);
  }
  // bridge small gaps (≤ 15 m), then each run of fairway is one shape
  for (let k = 0; k < bins.length; k++) {
    if (bins[k]) continue;
    let e = k;
    while (e < bins.length && !bins[e]) e++;
    if (k > 0 && e < bins.length && e - k <= 3) {
      const a = bins[k - 1]!;
      const b = bins[e]!;
      for (let j = k; j < e; j++) {
        const t = (j - k + 1) / (e - k + 1);
        bins[j] = { lo: a.lo + t * (b.lo - a.lo), hi: a.hi + t * (b.hi - a.hi) };
      }
    }
    k = e;
  }
  const out: Ring[] = [];
  for (let k = 0; k < bins.length; k++) {
    if (!bins[k]) continue;
    let e = k;
    while (e < bins.length && bins[e]) e++;
    if (e - k >= 3) {
      const run = bins.slice(k, e) as { lo: number; hi: number }[];
      const avg = (f: (b: { lo: number; hi: number }) => number) => run.map((_, j) => {
        const w = run.slice(Math.max(0, j - 2), j + 3);
        return w.reduce((t, b) => t + f(b), 0) / w.length;
      });
      const lo = avg((b) => b.lo);
      const hi = avg((b) => b.hi);
      const left: XY[] = [];
      const right: XY[] = [];
      run.forEach((_, j) => {
        const { p, n } = along(xy, cum, (k + j) * STEP);
        // rounded ends: the first and last 10 m narrow towards their middle
        const d = Math.min(j, run.length - 1 - j) * STEP;
        const f = d >= 10 ? 1 : 0.55 + 0.45 * Math.sqrt(d / 10);
        const mid = (lo[j] + hi[j]) / 2;
        const a = mid + (hi[j] - mid) * f;
        const b = mid + (lo[j] - mid) * f;
        left.push([p[0] + n[0] * a, p[1] + n[1] * a]);
        right.push([p[0] + n[0] * b, p[1] + n[1] * b]);
      });
      const ring = [...left, ...right.reverse()].map(g.from);
      out.push(smoothRing([...ring, ring[0]], 3));
    }
    k = e;
  }
  return out;
}
