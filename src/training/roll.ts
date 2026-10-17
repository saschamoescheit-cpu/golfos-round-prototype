import type { P, Sketch, SketchItem } from './types';

// The ball in motion on the top views (Sascha 17.10.2026: "animated rather than still pictures"): every drawn ball
// path that starts at a ball – a putt, a chip's flight and roll, a curve – is played: the ball rolls (slowing down
// like a putt) or flies (lifted from its shadow). Paths that continue where another ended belong to the same ball.

export interface RollSeg {
  pts: P[];
  flight: boolean;
  start: number; // seconds
  dur: number;
  /** the ball stops here (its last path) */
  stop?: boolean;
}
export interface RollPlan {
  segs: RollSeg[];
  /** the balls the paths start at and when they start – from then on the still ball is not drawn */
  starts: { at: P; t: number }[];
  total: number;
}

const near = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.15;
const segLen = (pts: P[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

export function rollPlan(s: Sketch): RollPlan | null {
  if (s.view !== 'top') return null;
  const balls = s.items.filter((x): x is Extract<SketchItem, { k: 'ball' }> => x.k === 'ball').map((b) => b.at);
  const segs: RollSeg[] = [];
  const starts: { at: P; t: number }[] = [];
  let t = 0;
  let end: P | null = null;
  for (const it of s.items) {
    if (it.k !== 'path' || it.style === 'aim' || it.style === 'club' || it.pts.length < 2) continue;
    const from = it.pts[0];
    const ball = balls.find((b) => near(b, from));
    if (ball) {
      if (segs.length) {
        segs[segs.length - 1].stop = true;
        t += 0.45; // a short rest between two balls
      }
      starts.push({ at: ball, t });
    } else if (!end || !near(end, from)) continue; // not a ball's path (an arrow between boxes)
    const len = segLen(it.pts);
    const flight = it.style === 'flight';
    const dur = Math.min(2.2, Math.max(0.7, (flight ? 0.45 : 0.6) + len * (flight ? 0.025 : 0.17)));
    segs.push({ pts: it.pts, flight, start: t, dur });
    t += dur;
    end = it.pts[it.pts.length - 1];
  }
  if (segs.length) segs[segs.length - 1].stop = true;
  return segs.length ? { segs, starts, total: t + 0.6 } : null;
}

/** a point along the path: a smooth curve through three points, else the straight pieces */
function along(pts: P[], u: number): P {
  if (pts.length === 3) {
    const [a, b, c] = pts;
    const v = 1 - u;
    return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]];
  }
  const total = segLen(pts);
  let d = u * total;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= l || i === pts.length - 1) {
      const f = l ? Math.min(1, d / l) : 1;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
    }
    d -= l;
  }
  return pts[pts.length - 1];
}

/** The balls at a time of the run: those that have stopped, and the one moving with how high it flies (0–1). */
export function ballsAt(plan: RollPlan, time: number): { at: P; lift: number }[] {
  const out: { at: P; lift: number }[] = [];
  let last: RollSeg | null = null;
  for (const s of plan.segs) {
    if (time < s.start) break;
    if (time <= s.start + s.dur) {
      const u = (time - s.start) / s.dur;
      // a putt slows down; a flight is even, highest in the middle
      const e = s.flight ? u : 1 - (1 - u) * (1 - u);
      out.push({ at: along(s.pts, e), lift: s.flight ? Math.sin(Math.PI * u) : 0 });
      return out;
    }
    last = s;
    if (s.stop) out.push({ at: s.pts[s.pts.length - 1], lift: 0 });
  }
  // between two paths of one ball (landed, about to roll): it waits where it is
  if (last && !last.stop) out.push({ at: last.pts[last.pts.length - 1], lift: 0 });
  return out;
}
