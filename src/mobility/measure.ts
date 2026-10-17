import { L, type L as Text } from '../training/types';
import type { Grade, MetricKind, Side } from './types';

// What the camera measures in each test – pure functions over the 33 body points of the pose model (MediaPipe
// BlazePose: x, y in 0..1 of the picture, v = visibility). Nothing here knows about React or the camera, so every
// analyser runs in the unit tests with synthetic bodies (synth.ts).
//
// The phone stands still, the player moves: angles come straight from the picture (side view) or from how much
// shorter a line between two points gets when the body turns (front view: a shoulder line seen at 45° is cos 45° =
// 0.71 of its width face-on). The limits follow the published screen values; all are REVIEW(golf) for Chris.

export interface Lm {
  x: number;
  y: number;
  z?: number;
  v?: number;
}

/** One picture: the points, the picture size in px (to keep angles true) and the time in ms. */
export interface Frame {
  lm: Lm[];
  w: number;
  h: number;
  t: number;
}

export type Cue = 'go' | 'hold' | 'eyes' | 'done';

export interface Live {
  /** the value now (smoothed) */
  value: number | null;
  /** the best value so far */
  best: number | null;
  phase: 'calibrate' | 'move' | 'hold' | 'done';
  /** 0..1 of a hold (balance, bridge) */
  hold?: number;
  /** a cue to say once (the screen speaks it) */
  cue?: Cue;
}

export interface Outcome {
  value: number;
  grade: Grade;
  notes: Text[];
}

export interface Analyzer {
  readonly kind: MetricKind;
  readonly unit: '°' | 's' | 'cm';
  push(f: Frame): Live;
  /** the result – null when the movement was never seen */
  finish(): Outcome | null;
  /** the lines to draw stronger on the skeleton (pairs of point indices) */
  focus(): [number, number][];
}

/** Point indices of the pose model. */
export const P = {
  nose: 0,
  lEar: 7,
  rEar: 8,
  lMouth: 9,
  rMouth: 10,
  lSh: 11,
  rSh: 12,
  lEl: 13,
  rEl: 14,
  lWr: 15,
  rWr: 16,
  lIdx: 19,
  rIdx: 20,
  lHip: 23,
  rHip: 24,
  lKn: 25,
  rKn: 26,
  lAn: 27,
  rAn: 28,
  lHeel: 29,
  rHeel: 30,
  lToe: 31,
  rToe: 32,
} as const;

/** The skeleton lines drawn over the video. */
export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32], [7, 0], [8, 0], [15, 19], [16, 20],
];

// ---------- limits (REVIEW(golf): Chris) ----------
export const LIMITS = {
  /** seated trunk rotation per side: ≥ 45° pass (published value), ≥ 35° limited */
  trunk: { pass: 45, limited: 35 },
  /** pelvic rotation with the chest still: hips ≥ 30° pass, ≥ 20° limited */
  pelvis: { pass: 30, limited: 20 },
  /** lower quarter rotation on one leg: ≥ 60° per direction pass (published value), ≥ 45° limited */
  lowerQuarter: { pass: 60, limited: 45 },
  /** head turn per side: ≥ 70° pass, ≥ 55° limited */
  neck: { pass: 70, limited: 55 },
  /** single-leg balance, eyes closed: seconds */
  balance: { pass: 20, limited: 10 },
  /** bridge with one leg out: hold 10 s, the pelvis may sink ≤ 10° (pass) or ≤ 20° (limited) */
  bridge: { hold: 10, drop: 10, dropLimited: 20 },
  /** lat test, wall sit, arms overhead: > 169° = the arms reach the wall, ≥ 120° = at least to the nose (published) */
  lat: { pass: 170, limited: 120 },
  /** 90/90: the forearm parallel to the spine in golf posture = pass (≤ 10° off), ≤ 25° limited */
  shoulder: { pass: 10, limited: 25 },
  /** overhead deep squat: thighs at least parallel (0°), heels down, arms in line with the trunk (≤ 30°) */
  squat: { depth: 0, depthFail: -20, heel: 0.2, arms: 30 },
  /** toe touch: fingers reach the toes (≤ 2 cm above), ≤ 10 cm limited; knees straight (≥ 160°) */
  toeTouch: { pass: 2, limited: 10, knee: 160 },
};

// ---------- geometry ----------
type V = [number, number];
const px = (f: Frame, i: number): V => [f.lm[i].x * f.w, f.lm[i].y * f.h];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const len = (a: V) => Math.hypot(a[0], a[1]);
const dist = (a: V, b: V) => len(sub(a, b));
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
/** angle between two vectors, 0..180° */
export const angleBetween = (a: V, b: V): number => {
  const d = len(a) * len(b);
  if (!d) return 0;
  return deg(Math.acos(clamp((a[0] * b[0] + a[1] * b[1]) / d, -1, 1)));
};
/** angle at b in the chain a–b–c */
const jointAngle = (a: V, b: V, c: V) => angleBetween(sub(a, b), sub(c, b));
const vis = (f: Frame, i: number) => f.lm[i]?.v ?? 1;
/** horizontal distance in px – what is left of a line across the body when the body turns */
const width = (f: Frame, a: number, b: number) => Math.abs(f.lm[a].x - f.lm[b].x) * f.w;
/** the rotation from how much shorter a line got: cos(angle) = width / width face-on */
const turned = (w: number, w0: number) => (w0 > 0 ? deg(Math.acos(clamp(w / w0))) : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** the side of the body that faces the camera in a side view (the points it sees best) */
export function nearSide(f: Frame): Side {
  const sum = (ix: number[]) => ix.reduce((s, i) => s + vis(f, i), 0);
  return sum([P.lSh, P.lHip, P.lKn, P.lAn, P.lEl]) >= sum([P.rSh, P.rHip, P.rKn, P.rAn, P.rEl]) ? 'left' : 'right';
}
const S = (side: Side) =>
  side === 'left'
    ? { sh: P.lSh, el: P.lEl, wr: P.lWr, idx: P.lIdx, hip: P.lHip, kn: P.lKn, an: P.lAn, heel: P.lHeel, toe: P.lToe }
    : { sh: P.rSh, el: P.rEl, wr: P.rWr, idx: P.rIdx, hip: P.rHip, kn: P.rKn, an: P.rAn, heel: P.rHeel, toe: P.rToe };
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

/** Smoothing over the last few pictures (a median: one wrong point does not count). */
class Roll {
  private xs: number[] = [];
  constructor(private n = 5) {}
  push(x: number): number {
    this.xs.push(x);
    if (this.xs.length > this.n) this.xs.shift();
    return median(this.xs);
  }
  get full() {
    return this.xs.length >= this.n;
  }
}

// ---------- framing: is everything the test needs in the picture? ----------
const FRONT_NEED: Partial<Record<MetricKind, number[]>> = {
  trunkRotation: [P.lSh, P.rSh, P.nose],
  pelvicRotation: [P.lSh, P.rSh, P.lHip, P.rHip, P.lAn, P.rAn],
  lowerQuarter: [P.lSh, P.rSh, P.lHip, P.rHip, P.lAn, P.rAn],
  balance: [P.lHip, P.rHip, P.lKn, P.rKn, P.lAn, P.rAn],
  neck: [P.nose, P.lEar, P.rEar, P.lSh, P.rSh],
};
const SIDE_NEED: Partial<Record<MetricKind, (keyof ReturnType<typeof S>)[]>> = {
  squat: ['sh', 'wr', 'hip', 'kn', 'an', 'heel', 'toe'],
  toeTouch: ['hip', 'kn', 'an', 'toe'],
  bridge: ['sh', 'hip', 'kn', 'an'],
  lat: ['sh', 'el', 'wr', 'hip'],
  shoulder9090: ['sh', 'el', 'wr', 'hip'],
};
const inFrame = (f: Frame, i: number) => {
  const l = f.lm[i];
  return !!l && vis(f, i) >= 0.5 && l.x > 0.005 && l.x < 0.995 && l.y > 0.005 && l.y < 0.995;
};
/** The points the test needs that are missing (empty = framed). */
export function missingPoints(kind: MetricKind, f: Frame): number[] {
  const front = FRONT_NEED[kind];
  if (front) return front.filter((i) => !inFrame(f, i));
  const keys = SIDE_NEED[kind] ?? [];
  const miss = (s: Side) => keys.map((k) => S(s)[k]).filter((i) => !inFrame(f, i));
  const a = miss('left');
  const b = miss('right');
  return a.length <= b.length ? a : b;
}

// ---------- the analysers ----------
const CAL_FRAMES = 10;

/** A turn measured in the front view: the width of a line face-on first, then how far it turns. */
class TurnAnalyzer implements Analyzer {
  readonly unit = '°' as const;
  private cal: number[] = [];
  private calHip: number[] = [];
  private w0 = 0;
  private h0 = 0;
  private roll = new Roll(5);
  private hipRoll = new Roll(5);
  private best = 0;
  private bestHip = 0;
  private hipAtBest = 0;
  private t0 = -1;
  private tBest = 0;
  private done = false;
  constructor(readonly kind: MetricKind, private line: [number, number], private hips: [number, number] | null, private maxMs = 15000) {}
  focus(): [number, number][] {
    return this.hips ? [this.line, this.hips] : [this.line];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push(width(f, ...this.line));
      if (this.hips) this.calHip.push(width(f, ...this.hips));
      if (this.cal.length === CAL_FRAMES) {
        this.w0 = median(this.cal);
        this.h0 = median(this.calHip);
        this.t0 = f.t;
        this.tBest = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const v = this.roll.push(turned(width(f, ...this.line), this.w0));
    const hip = this.hips ? this.hipRoll.push(turned(width(f, ...this.hips), this.h0)) : 0;
    if (v > this.best + 0.5) {
      this.best = v;
      this.hipAtBest = hip;
      this.tBest = f.t;
    }
    this.bestHip = Math.max(this.bestHip, hip);
    // finished: turned back to the middle, no further for 3 s, or the time is up
    const back = this.best >= 15 && v < this.best * 0.5;
    const still = this.best >= 15 && f.t - this.tBest > 3000;
    if (back || still || f.t - this.t0 > this.maxMs) {
      this.done = true;
      return { value: v, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.cal.length < CAL_FRAMES || this.best < 3) return null;
    const notes: Text[] = [];
    const lim = LIMITS.trunk;
    let grade: Grade = this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail';
    // seated, the hips should stay where they are
    if (this.hips && this.hipAtBest > 15) {
      notes.push(L('The hips turn along', 'Die Hüfte dreht mit'));
      if (grade === 'pass') grade = 'limited';
    }
    return { value: Math.round(this.best), grade, notes };
  }
}

/** Pelvic rotation: the hips turn both ways, the chest stays still. */
class PelvisAnalyzer implements Analyzer {
  readonly kind = 'pelvicRotation' as const;
  readonly unit = '°' as const;
  private calH: number[] = [];
  private calS: number[] = [];
  private h0 = 0;
  private s0 = 0;
  private hRoll = new Roll(5);
  private sRoll = new Roll(5);
  private best = 0;
  private shAtBest = 0;
  private t0 = -1;
  private done = false;
  constructor(private ms = 10000) {}
  focus(): [number, number][] {
    return [[P.lHip, P.rHip], [P.lSh, P.rSh]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    if (this.calH.length < CAL_FRAMES) {
      this.calH.push(width(f, P.lHip, P.rHip));
      this.calS.push(width(f, P.lSh, P.rSh));
      if (this.calH.length === CAL_FRAMES) {
        this.h0 = median(this.calH);
        this.s0 = median(this.calS);
        this.t0 = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const h = this.hRoll.push(turned(width(f, P.lHip, P.rHip), this.h0));
    const s = this.sRoll.push(turned(width(f, P.lSh, P.rSh), this.s0));
    if (h > this.best + 0.5) {
      this.best = h;
      this.shAtBest = s;
    }
    if (f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: h, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: h, best: this.best, phase: 'move', hold: (f.t - this.t0) / this.ms };
  }
  finish(): Outcome | null {
    if (this.calH.length < CAL_FRAMES || this.best < 3) return null;
    const lim = LIMITS.pelvis;
    const follows = this.shAtBest > this.best * 0.6 + 5;
    const notes: Text[] = follows ? [L('The chest turns along – the hips do not move on their own', 'Die Brust dreht mit – die Hüfte bewegt sich nicht allein')] : [];
    let grade: Grade = this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail';
    if (follows && grade === 'pass') grade = 'limited';
    return { value: Math.round(this.best), grade, notes };
  }
}

/** Lower quarter rotation: on one leg, hands on the hips, the pelvis turns in both directions (≥ 60° each). The
 *  direction comes from the head: it turns with the body, the nose moves to the side the player turns to. */
class LowerQuarterAnalyzer implements Analyzer {
  readonly kind = 'lowerQuarter' as const;
  readonly unit = '°' as const;
  private cal: number[] = [];
  private calNose: number[] = [];
  private h0 = 0;
  private n0 = 0;
  private roll = new Roll(5);
  private maxPos = 0;
  private maxNeg = 0;
  private t0 = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    return [[P.lHip, P.rHip]];
  }
  private nose(f: Frame) {
    return (f.lm[P.nose].x - (f.lm[P.lHip].x + f.lm[P.rHip].x) / 2) * f.w;
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best(), phase: 'done' };
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push(width(f, P.lHip, P.rHip));
      this.calNose.push(this.nose(f));
      if (this.cal.length === CAL_FRAMES) {
        this.h0 = median(this.cal);
        this.n0 = median(this.calNose);
        this.t0 = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const v = this.roll.push(turned(width(f, P.lHip, P.rHip), this.h0));
    const dir = this.nose(f) - this.n0;
    if (Math.abs(dir) > this.h0 * 0.05) {
      if (dir > 0) this.maxPos = Math.max(this.maxPos, v);
      else this.maxNeg = Math.max(this.maxNeg, v);
    }
    if (f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: v, best: this.best(), phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best(), phase: 'move', hold: (f.t - this.t0) / this.ms };
  }
  private best() {
    // the weaker direction counts – both have to reach the goal
    return this.maxPos >= 10 && this.maxNeg >= 10 ? Math.min(this.maxPos, this.maxNeg) : Math.max(this.maxPos, this.maxNeg);
  }
  finish(): Outcome | null {
    const b = this.best();
    if (this.cal.length < CAL_FRAMES || b < 3) return null;
    const lim = LIMITS.lowerQuarter;
    const notes: Text[] = [];
    if (!(this.maxPos >= 10 && this.maxNeg >= 10)) notes.push(L('Only one direction was seen', 'Nur eine Richtung wurde gemessen'));
    else if (Math.abs(this.maxPos - this.maxNeg) >= 15) notes.push(L(`One direction ${Math.round(Math.abs(this.maxPos - this.maxNeg))}° shorter`, `Eine Richtung ${Math.round(Math.abs(this.maxPos - this.maxNeg))}° kürzer`));
    return { value: Math.round(b), grade: b >= lim.pass ? 'pass' : b >= lim.limited ? 'limited' : 'fail', notes };
  }
}

/** Head turn: the nose moves sideways in front of the neck and the ears come together (both measured, averaged). */
export const NOSE_DEPTH = 0.8; // nose tip in front of the turning axis, in ear widths (≈ 11.5 cm of 14.5 cm)
class NeckAnalyzer implements Analyzer {
  readonly kind = 'neck' as const;
  readonly unit = '°' as const;
  private calE: number[] = [];
  private calN: number[] = [];
  private e0 = 0;
  private n0 = 0;
  private roll = new Roll(5);
  private best = 0;
  private t0 = -1;
  private tBest = 0;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    return [[P.lEar, P.rEar]];
  }
  private noseOff(f: Frame) {
    return (f.lm[P.nose].x - (f.lm[P.lSh].x + f.lm[P.rSh].x) / 2) * f.w;
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    if (this.calE.length < CAL_FRAMES) {
      this.calE.push(width(f, P.lEar, P.rEar));
      this.calN.push(this.noseOff(f));
      if (this.calE.length === CAL_FRAMES) {
        this.e0 = median(this.calE);
        this.n0 = median(this.calN);
        this.t0 = f.t;
        this.tBest = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const off = Math.abs(this.noseOff(f) - this.n0);
    const bySide = deg(Math.asin(clamp(off / (NOSE_DEPTH * this.e0))));
    const earsSeen = vis(f, P.lEar) >= 0.5 && vis(f, P.rEar) >= 0.5;
    const byEars = turned(width(f, P.lEar, P.rEar), this.e0);
    const v = this.roll.push(earsSeen ? (bySide + byEars) / 2 : bySide);
    if (v > this.best + 0.5) {
      this.best = v;
      this.tBest = f.t;
    }
    const back = this.best >= 15 && v < this.best * 0.5;
    const still = this.best >= 15 && f.t - this.tBest > 3000;
    if (back || still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: v, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.calE.length < CAL_FRAMES || this.best < 3) return null;
    const lim = LIMITS.neck;
    return { value: Math.round(this.best), grade: this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail', notes: [] };
  }
}

/** Overhead deep squat from the side: depth of the thighs, heels, arms in line with the trunk. */
class SquatAnalyzer implements Analyzer {
  readonly kind = 'squat' as const;
  readonly unit = '°' as const;
  private side: Side | null = null;
  private cal: { hipY: number; thigh: number; heelY: number; foot: number }[] = [];
  private base = { hipY: 0, thigh: 1, heelY: 0, foot: 1 };
  private roll = new Roll(5);
  private best = -90;
  private armsAtBest = 0;
  private heelRise = 0;
  private started = false;
  private t0 = -1;
  private done = false;
  constructor(private ms = 15000) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return [[s.hip, s.kn], [s.sh, s.wr]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    this.side ??= nearSide(f);
    const s = S(this.side);
    const hip = px(f, s.hip);
    const kn = px(f, s.kn);
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push({ hipY: hip[1], thigh: dist(hip, kn), heelY: px(f, s.heel)[1], foot: dist(px(f, s.heel), px(f, s.toe)) });
      if (this.cal.length === CAL_FRAMES) {
        this.base = { hipY: median(this.cal.map((c) => c.hipY)), thigh: median(this.cal.map((c) => c.thigh)), heelY: median(this.cal.map((c) => c.heelY)), foot: median(this.cal.map((c) => c.foot)) };
        this.t0 = f.t;
        return { value: null, best: null, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    // thigh angle to the horizontal: + = the hip is below the knee (y grows downwards in the picture)
    const depth = this.roll.push(deg(Math.atan2(hip[1] - kn[1], Math.abs(hip[0] - kn[0]))));
    const down = hip[1] - this.base.hipY;
    if (down > 0.25 * this.base.thigh) this.started = true;
    if (this.started) {
      this.heelRise = Math.max(this.heelRise, (this.base.heelY - px(f, s.heel)[1]) / this.base.foot);
      if (depth > this.best) {
        this.best = depth;
        // the arms overhead should stay in line with the trunk (shoulder→wrist against hip→shoulder)
        this.armsAtBest = angleBetween(sub(px(f, s.wr), px(f, s.sh)), sub(px(f, s.sh), hip));
      }
      if (down < 0.15 * this.base.thigh && this.best > -60) {
        this.done = true;
        return { value: depth, best: this.best, phase: 'done', cue: 'done' };
      }
    }
    if (f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: depth, best: this.started ? this.best : null, phase: 'done', cue: 'done' };
    }
    return { value: this.started ? depth : null, best: this.started ? this.best : null, phase: 'move' };
  }
  finish(): Outcome | null {
    if (!this.started) return null;
    const lim = LIMITS.squat;
    const notes: Text[] = [];
    if (this.best < lim.depth) notes.push(L('The hips stay above the knees', 'Die Hüfte bleibt über Kniehöhe'));
    if (this.heelRise > lim.heel) notes.push(L('The heels come up', 'Die Fersen heben ab'));
    if (this.armsAtBest > lim.arms) notes.push(L('The arms tip forward', 'Die Arme kippen nach vorn'));
    const grade: Grade = !notes.length ? 'pass' : this.best < lim.depthFail || notes.length >= 2 ? 'fail' : 'limited';
    return { value: Math.round(this.best), grade, notes };
  }
}

/** Toe touch from the side: how far the fingertips stay above the toes, with straight knees. */
export const LEG_CM = 85; // hip joint to ankle of a 1.75 m player – turns picture px into cm
class ToeTouchAnalyzer implements Analyzer {
  readonly kind = 'toeTouch' as const;
  readonly unit = 'cm' as const;
  private side: Side | null = null;
  private cal: number[] = [];
  private leg = 1;
  private roll = new Roll(5);
  private best = Infinity;
  private kneeAtBest = 180;
  private started = false;
  private t0 = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return [[s.wr, s.idx], [s.hip, s.kn], [s.kn, s.an]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    this.side ??= nearSide(f);
    const s = S(this.side);
    const hip = px(f, s.hip);
    const an = px(f, s.an);
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push(dist(hip, an));
      if (this.cal.length === CAL_FRAMES) {
        this.leg = median(this.cal);
        this.t0 = f.t;
        return { value: null, best: null, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const finger = px(f, s.idx);
    const kn = px(f, s.kn);
    if (finger[1] > kn[1]) this.started = true;
    // + = the fingertips are above the toes (y grows downwards)
    const gap = this.roll.push(((px(f, s.toe)[1] - finger[1]) / this.leg) * LEG_CM);
    if (this.started && gap < this.best) {
      this.best = gap;
      this.kneeAtBest = jointAngle(hip, kn, an);
    }
    // finished when the hands are back above the knees (standing up again)
    if ((this.started && finger[1] < kn[1] - 0.1 * this.leg) || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: gap, best: this.started ? this.best : null, phase: 'done', cue: 'done' };
    }
    return { value: this.started ? gap : null, best: this.started ? this.best : null, phase: 'move' };
  }
  finish(): Outcome | null {
    if (!this.started) return null;
    const lim = LIMITS.toeTouch;
    const notes: Text[] = [];
    const knees = this.kneeAtBest < lim.knee;
    if (knees) notes.push(L('The knees bend', 'Die Knie beugen sich'));
    let grade: Grade = this.best <= lim.pass ? 'pass' : this.best <= lim.limited ? 'limited' : 'fail';
    if (knees && grade === 'pass') grade = 'limited';
    return { value: Math.max(0, Math.round(this.best)), grade, notes };
  }
}

/** Single-leg balance, eyes closed (front view): seconds until the lifted foot comes down or the standing foot moves. */
class BalanceAnalyzer implements Analyzer {
  readonly kind = 'balance' as const;
  readonly unit = 's' as const;
  private leg = 1;
  private cal: number[] = [];
  private upSince = -1;
  private t1 = -1; // the clock starts (eyes closed)
  private downSince = -1;
  private standX = 0;
  private held = 0;
  private done = false;
  private startT = -1;
  constructor(private stand: Side, private ms = 30000) {}
  focus(): [number, number][] {
    const a = S(this.stand);
    const b = S(other(this.stand));
    return [[a.hip, a.kn], [a.kn, a.an], [b.hip, b.kn], [b.kn, b.an]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: this.held, best: this.held, phase: 'done' };
    const a = S(this.stand);
    const b = S(other(this.stand));
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push(dist(px(f, a.hip), px(f, a.an)));
      if (this.cal.length === CAL_FRAMES) {
        this.leg = median(this.cal);
        this.startT = f.t;
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const standY = px(f, a.an)[1];
    const liftY = px(f, b.an)[1];
    const lifted = liftY < standY - 0.1 * this.leg;
    const goal = LIMITS.balance.pass;
    if (this.t1 < 0) {
      if (lifted) {
        if (this.upSince < 0) this.upSince = f.t;
        if (f.t - this.upSince > 500) {
          // eyes shut now; the clock starts 1.5 s later (time to close them)
          this.t1 = f.t + 1500;
          this.standX = px(f, a.an)[0];
          return { value: 0, best: 0, phase: 'hold', hold: 0, cue: 'eyes' };
        }
      } else this.upSince = -1;
      if (f.t - this.startT > this.ms) {
        this.done = true;
        return { value: null, best: null, phase: 'done', cue: 'done' };
      }
      return { value: null, best: null, phase: 'move' };
    }
    this.held = Math.max(0, (f.t - this.t1) / 1000);
    const footDown = liftY > standY - 0.04 * this.leg;
    if (footDown) {
      if (this.downSince < 0) this.downSince = f.t;
    } else this.downSince = -1;
    const hopped = Math.abs(px(f, a.an)[0] - this.standX) > 0.15 * this.leg;
    if ((this.downSince >= 0 && f.t - this.downSince > 300) || hopped || this.held >= goal) {
      if (this.downSince >= 0) this.held = Math.max(0, (this.downSince - this.t1) / 1000);
      this.held = Math.min(goal, this.held);
      this.done = true;
      return { value: this.held, best: this.held, phase: 'done', hold: this.held / goal, cue: 'done' };
    }
    return { value: this.held, best: this.held, phase: 'hold', hold: this.held / goal };
  }
  finish(): Outcome | null {
    if (this.t1 < 0) return null;
    const lim = LIMITS.balance;
    const s = Math.round(this.held * 10) / 10;
    return { value: s, grade: s >= lim.pass ? 'pass' : s >= lim.limited ? 'limited' : 'fail', notes: [] };
  }
}

/** Bridge with one leg out (side view, lying): hold 10 s, the pelvis must not sink. `ext` = the leg stretched out. */
class BridgeAnalyzer implements Analyzer {
  readonly kind = 'bridge' as const;
  readonly unit = 's' as const;
  private cal: number[] = [];
  private leg = 1;
  private readySince = -1;
  private t1 = -1;
  private a0s: number[] = [];
  private a0 = 0;
  private roll = new Roll(5);
  private minAngle = Infinity;
  private held = 0;
  private done = false;
  private startT = -1;
  constructor(private ext: Side, private ms = 25000) {}
  focus(): [number, number][] {
    const sup = S(other(this.ext));
    const e = S(this.ext);
    return [[sup.sh, sup.hip], [sup.hip, sup.kn], [e.hip, e.kn], [e.kn, e.an]];
  }
  /** the line shoulder–hip–knee of the supporting leg: 180° = straight, more = the hips above the line, less = they sag */
  private hipAngle(f: Frame) {
    const sup = S(other(this.ext));
    const sh = px(f, S(nearSide(f)).sh);
    const hip = px(f, sup.hip);
    const kn = px(f, sup.kn);
    const a = jointAngle(sh, hip, kn);
    // above or below the straight line from the shoulder to the knee (y grows downwards in the picture)
    const k = kn[0] !== sh[0] ? (hip[0] - sh[0]) / (kn[0] - sh[0]) : 0.5;
    const lineY = sh[1] + (kn[1] - sh[1]) * k;
    return hip[1] < lineY ? 360 - a : a;
  }
  push(f: Frame): Live {
    if (this.done) return { value: this.held, best: this.held, phase: 'done' };
    const sup = S(other(this.ext));
    const e = S(this.ext);
    if (this.cal.length < CAL_FRAMES) {
      this.cal.push(dist(px(f, sup.hip), px(f, sup.kn)) + dist(px(f, sup.kn), px(f, sup.an)));
      if (this.cal.length === CAL_FRAMES) {
        this.leg = median(this.cal);
        this.startT = f.t;
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const angle = this.roll.push(this.hipAngle(f));
    const extStraight = jointAngle(px(f, e.hip), px(f, e.kn), px(f, e.an)) >= 150;
    const extUp = px(f, e.an)[1] < px(f, sup.an)[1] - 0.15 * this.leg;
    const goal = LIMITS.bridge.hold;
    if (this.t1 < 0) {
      if (angle >= 150 && extStraight && extUp) {
        if (this.readySince < 0) this.readySince = f.t;
        if (f.t - this.readySince > 300) {
          this.t1 = f.t;
          return { value: 0, best: 0, phase: 'hold', hold: 0, cue: 'hold' };
        }
      } else this.readySince = -1;
      if (f.t - this.startT > this.ms) {
        this.done = true;
        return { value: null, best: null, phase: 'done', cue: 'done' };
      }
      return { value: null, best: null, phase: 'move' };
    }
    this.held = (f.t - this.t1) / 1000;
    if (this.held < 0.5) this.a0s.push(angle);
    else {
      if (!this.a0) this.a0 = median(this.a0s.length ? this.a0s : [angle]);
      this.minAngle = Math.min(this.minAngle, angle);
    }
    const drop = this.drop();
    const legDown = px(f, e.an)[1] > px(f, sup.an)[1] - 0.05 * this.leg;
    if (drop > 25 || legDown || this.held >= goal) {
      this.held = Math.min(goal, this.held);
      this.done = true;
      return { value: this.held, best: this.held, phase: 'done', hold: this.held / goal, cue: 'done' };
    }
    return { value: this.held, best: this.held, phase: 'hold', hold: this.held / goal };
  }
  /** how far the pelvis sank during the hold (°) */
  drop() {
    return this.a0 && Number.isFinite(this.minAngle) ? Math.max(0, this.a0 - this.minAngle) : 0;
  }
  finish(): Outcome | null {
    if (this.t1 < 0) return null;
    const lim = LIMITS.bridge;
    const drop = Math.round(this.drop());
    const held = Math.round(this.held * 10) / 10;
    const notes: Text[] = [];
    if (drop > lim.drop) notes.push(L(`The pelvis sinks by ${drop}°`, `Das Becken sinkt um ${drop}°`));
    if (held < lim.hold) notes.push(L(`Held for ${held} s`, `${held} s gehalten`));
    const grade: Grade = held >= lim.hold && drop <= lim.drop ? 'pass' : (held >= lim.hold && drop <= lim.dropLimited) || (held >= 6 && drop <= lim.drop) ? 'limited' : 'fail';
    return { value: held, grade, notes };
  }
}

/** Lat test (side view, wall sit): how far the straight arms go overhead – shoulder flexion, 180° = up along the wall. */
class LatAnalyzer implements Analyzer {
  readonly kind = 'lat' as const;
  readonly unit = '°' as const;
  private side: Side | null = null;
  private roll = new Roll(5);
  private best = 0;
  private elbowAtBest = 180;
  private tBest = 0;
  private t0 = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return [[s.sh, s.el], [s.el, s.wr], [s.sh, s.hip]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    this.side ??= nearSide(f);
    const s = S(this.side);
    if (this.t0 < 0) {
      this.t0 = f.t;
      this.tBest = f.t;
      return { value: null, best: null, phase: 'move', cue: 'go' };
    }
    const sh = px(f, s.sh);
    const flex = this.roll.push(angleBetween(sub(px(f, s.hip), sh), sub(px(f, s.wr), sh)));
    if (flex > this.best + 0.5) {
      this.best = flex;
      this.tBest = f.t;
      this.elbowAtBest = jointAngle(sh, px(f, s.el), px(f, s.wr));
    }
    const down = this.best >= 100 && flex < this.best - 40;
    const still = this.best >= 100 && f.t - this.tBest > 2500;
    if (down || still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: flex, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: flex, best: this.best, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.best < 60) return null;
    const lim = LIMITS.lat;
    const notes: Text[] = [];
    let grade: Grade = this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail';
    if (this.elbowAtBest < 150) {
      notes.push(L('The elbows bend', 'Die Ellbogen beugen sich'));
      if (grade === 'pass') grade = 'limited';
    }
    return { value: Math.round(Math.min(180, this.best)), grade, notes };
  }
}

/** 90/90 (side view, golf posture): the forearm turns back until it is parallel to the spine. Value = degrees still
 *  missing to parallel (0 = parallel = pass). `arm` = the arm towards the camera. */
class ShoulderAnalyzer implements Analyzer {
  readonly kind = 'shoulder9090' as const;
  readonly unit = '°' as const;
  private roll = new Roll(5);
  private best = 180;
  private tBest = 0;
  private t0 = -1;
  private done = false;
  constructor(private arm: Side, private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.arm);
    return [[s.el, s.wr], [s.hip, s.sh]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    const s = S(this.arm);
    if (this.t0 < 0) {
      this.t0 = f.t;
      this.tBest = f.t;
      return { value: null, best: null, phase: 'move', cue: 'go' };
    }
    const off = this.roll.push(angleBetween(sub(px(f, s.wr), px(f, s.el)), sub(px(f, s.sh), px(f, s.hip))));
    if (off < this.best - 0.5) {
      this.best = off;
      this.tBest = f.t;
    }
    const still = this.best <= 60 && f.t - this.tBest > 2500;
    if (still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: off, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: off, best: this.best <= 90 ? this.best : null, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.best > 90) return null;
    const lim = LIMITS.shoulder;
    return { value: Math.round(this.best), grade: this.best <= lim.pass ? 'pass' : this.best <= lim.limited ? 'limited' : 'fail', notes: [] };
  }
}

/**
 * The analyser of a test. `side`: the direction to turn (trunk, neck), the standing leg (balance, lower quarter),
 * the stretched leg (bridge) or the arm towards the camera (90/90).
 */
export function makeAnalyzer(kind: MetricKind, side: Side = 'left'): Analyzer {
  switch (kind) {
    case 'trunkRotation':
      return new TurnAnalyzer('trunkRotation', [P.lSh, P.rSh], null);
    case 'pelvicRotation':
      return new PelvisAnalyzer();
    case 'lowerQuarter':
      return new LowerQuarterAnalyzer();
    case 'neck':
      return new NeckAnalyzer();
    case 'squat':
      return new SquatAnalyzer();
    case 'toeTouch':
      return new ToeTouchAnalyzer();
    case 'balance':
      return new BalanceAnalyzer(side);
    case 'bridge':
      return new BridgeAnalyzer(side);
    case 'lat':
      return new LatAnalyzer();
    case 'shoulder9090':
      return new ShoulderAnalyzer(side);
  }
}

/** The value in words for the result, e.g. "48°", "12 s", "4 cm above the toes". */
export function valueText(kind: MetricKind, v: number | null, tr: (en: string, de: string) => string): string {
  if (v == null) return '–';
  const n = (x: number) => String(x).replace('.', tr('.', ','));
  switch (kind) {
    case 'squat':
      return v >= 0 ? tr(`thighs ${v}° below parallel`, `Oberschenkel ${v}° unter waagrecht`) : tr(`thighs ${-v}° above parallel`, `Oberschenkel ${-v}° über waagrecht`);
    case 'toeTouch':
      return v <= LIMITS.toeTouch.pass ? tr('reaches the toes', 'erreicht die Zehen') : tr(`${v} cm above the toes`, `${v} cm über den Zehen`);
    case 'balance':
    case 'bridge':
      return `${n(v)} s`;
    case 'shoulder9090':
      return v <= LIMITS.shoulder.pass ? tr('parallel to the spine', 'parallel zur Wirbelsäule') : tr(`${v}° short of the spine line`, `${v}° vor der Rückenlinie`);
    default:
      return `${v}°`;
  }
}

// ---------- several people in the picture ----------
/** The centre of the visible points of a person (for following the same person from picture to picture). */
export function personCenter(lm: Lm[] | null): { x: number; y: number } | null {
  if (!lm) return null;
  const v = lm.filter((p) => (p.v ?? 1) > 0.3);
  if (!v.length) return null;
  const xs = v.map((p) => p.x);
  const ys = v.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * The player when several people are in the picture (a partner holding the phone, a child walking past): the largest,
 * most central person, and the one seen before stays the player (as in the Coach prototype).
 */
export function pickMainPerson(people: Lm[][], prev?: { x: number; y: number } | null): number {
  if (people.length <= 1) return 0;
  let best = 0;
  let bestScore = -Infinity;
  people.forEach((lm, i) => {
    const v = lm.filter((p) => (p.v ?? 1) > 0.3);
    if (!v.length) return;
    const xs = v.map((p) => p.x);
    const ys = v.map((p) => p.y);
    const h = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    let score = h * (1 - Math.min(1, Math.abs(cx - 0.5)));
    if (prev) score -= 2 * Math.hypot(cx - prev.x, cy - prev.y);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
