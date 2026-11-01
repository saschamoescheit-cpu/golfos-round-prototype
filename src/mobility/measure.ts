import { L, type L as Text } from '../training/types';
import type { Check, Grade, MetricKind, Side } from './types';

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

export type Cue = 'go' | 'hold' | 'eyes' | 'done' | 'otherLeg';

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
  /** the criteria of the test, each met or not */
  checks: Check[];
}

/** A criterion of a test (see Check). */
const check = (id: string, en: string, de: string, ok: boolean): Check => ({ id, label: L(en, de), ok });

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
  lPinky: 17,
  rPinky: 18,
  lIdx: 19,
  rIdx: 20,
  lThumb: 21,
  rThumb: 22,
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
  // the hand: wrist–pinky–index and wrist–thumb (the forearm and wrist tests, 01.11.2026)
  [15, 17], [16, 18], [17, 19], [18, 20], [15, 21], [16, 22],
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
  /** lat test, wall sit, arms overhead: > 169° = the arms reach the wall, ≥ 120° = at least to the nose (published) – on
   *  the picture 165° (31.10.2026, the TPI video: the physio's "touches the wall" measured 162–176° from an angle) */
  lat: { pass: 165, limited: 120, elbow: 140 },
  /** 90/90: the forearm parallel to the spine in golf posture = pass (≤ 10° off), ≤ 25° limited */
  shoulder: { pass: 10, limited: 25 },
  /** overhead deep squat: thighs at least parallel (0°), heels down, arms in line with the trunk (≤ 30°) */
  squat: { depth: 0, depthFail: -20, heel: 0.2, arms: 30 },
  /** toe touch: fingers reach the toes (≤ 2 cm above), ≤ 10 cm limited; knees straight (≥ 160°) */
  toeTouch: { pass: 2, limited: 10, knee: 160 },
  /** pelvic tilt (side view, golf posture): the hip angle (shoulder–hip–knee) opens and closes with the tilt – ≥ 5° each
   *  way = a clear tilt, ≥ 2.5° = a small one; the shoulders may move ≤ 12 % of the trunk length ("the chest stays still");
   *  shaking = the jitter of the hip angle (its bend from picture to picture) while flattening ≥ 2 × the jitter at rest,
   *  ≥ 1.8 × the jitter while hollowing and ≥ 2.5° (the pose model alone shakes the hip angle by 1–2° from picture to
   *  picture – σ 0.25 % of the picture, the unit tests). Not a pelvic angle: the
   *  pose model has no point on the pelvis (01.11.2026). REVIEW(golf) */
  pelvicTilt: { clear: 5, small: 2.5, chest: 0.12, shake: 2, shakeHollow: 1.8, shakeMin: 2.5 },
  /** forearm rotation (both hands, front view): the whole turn from palm down to palm up – TPI > 80° each way = 160°;
   *  ≥ 150° pass (the hand points of the pose model are coarse), ≥ 110° limited; one way < 55° (from a thumbs-up start) =
   *  clearly less. REVIEW(golf) */
  forearm: { pass: 150, limited: 110, oneWay: 55, elbow: 0.35 },
  /** wrist hinge (side view, fist thumb up): radial ≥ 20°, ulnar ≥ 30° (literature: radial 20–25°, ulnar 30–40°); half of
   *  it = clearly less. `gain`: the pose model's hand point follows a hinge only partly (01.11.2026, the TPI video: the
   *  physio's "normal both" measured about 20° radial and 17° ulnar on the picture). REVIEW(golf) */
  wristHinge: { radial: 20, ulnar: 30, gain: 1.5 },
  /** the start of a wrist test counts as "the hand in line" when it was still (spread ≤ 15°) and the hand line within 10°
   *  of the forearm (both on the picture, before the gain; a held first way read 15–20°) – only then each way is judged, else the whole range */
  wristStart: { spread: 15, off: 10 },
  /** wrist flexion/extension (side view, forearm level, palm down): ≥ 60° each way (TPI normal), ≥ 40° limited. `gain`: the
   *  hand point of the pose model follows a wrist bend only by about a third (01.11.2026, the TPI video: the physio's
   *  "normal, ≥ 60°" measured about 20° each way on the picture). REVIEW(golf) */
  wristFlex: { pass: 60, limited: 40, gain: 3 },
  /** reach, roll and lift (kneeling, chest on the thighs, side view): the straight arm lifts off the floor – ≥ 30° above
   *  where it lay = ear height (the sketch of the test: from 17° below level to 17° above), ≥ 10° limited (off the floor);
   *  the elbow stays straight (≥ 150°). Not checked on a video yet (01.11.2026). REVIEW(golf) */
  reachRollLift: { pass: 30, limited: 10, elbow: 150 },
};

// ---------- geometry ----------
export type V = [number, number];
export const px = (f: Frame, i: number): V => [f.lm[i].x * f.w, f.lm[i].y * f.h];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const len = (a: V) => Math.hypot(a[0], a[1]);
export const dist = (a: V, b: V) => len(sub(a, b));
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
/** angle between two vectors, 0..180° */
export const angleBetween = (a: V, b: V): number => {
  const d = len(a) * len(b);
  if (!d) return 0;
  return deg(Math.acos(clamp((a[0] * b[0] + a[1] * b[1]) / d, -1, 1)));
};
/** angle at b in the chain a–b–c */
export const jointAngle = (a: V, b: V, c: V) => angleBetween(sub(a, b), sub(c, b));
export const vis = (f: Frame, i: number) => f.lm[i]?.v ?? 1;
/** horizontal distance in px – what is left of a line across the body when the body turns */
export const width = (f: Frame, a: number, b: number) => Math.abs(f.lm[a].x - f.lm[b].x) * f.w;
/** the rotation from how much shorter a line got: cos(angle) = width / width face-on */
export const turned = (w: number, w0: number) => (w0 > 0 ? deg(Math.acos(clamp(w / w0))) : 0);
export const median = (xs: number[]) => {
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
export const S = (side: Side) =>
  side === 'left'
    ? { sh: P.lSh, el: P.lEl, wr: P.lWr, idx: P.lIdx, pinky: P.lPinky, thumb: P.lThumb, ear: P.lEar, hip: P.lHip, kn: P.lKn, an: P.lAn, heel: P.lHeel, toe: P.lToe }
    : { sh: P.rSh, el: P.rEl, wr: P.rWr, idx: P.rIdx, pinky: P.rPinky, thumb: P.rThumb, ear: P.rEar, hip: P.rHip, kn: P.rKn, an: P.rAn, heel: P.rHeel, toe: P.rToe };
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');
/** the arm the camera sees better (shoulder, elbow and wrist) */
const armSide = (f: Frame): Side => (vis(f, P.lSh) + vis(f, P.lEl) + vis(f, P.lWr) >= vis(f, P.rSh) + vis(f, P.rEl) + vis(f, P.rWr) ? 'left' : 'right');

/** an angle difference brought into -180..180° */
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** the direction of a picture vector, counter-clockwise from the right, image up = 90° */
const dirDeg = (d: V) => deg(Math.atan2(-d[1], d[0]));
const mid2 = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

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

/** A width in the picture (shoulders, hips, ears), the mean of the last three pictures: an angle comes from it by acos,
 * which turns a little shaking of the width into many degrees near 0° (19.10.2026: a pose model shakes – the stiff
 * pelvis measured 18° came out at 23–27°, the trunk turn ended early on the shaking) – the width is steadied before. */
class Steady {
  private xs: number[] = [];
  constructor(private n = 3) {}
  push(x: number): number {
    this.xs.push(x);
    if (this.xs.length > this.n) this.xs.shift();
    return this.xs.reduce((a, b) => a + b, 0) / this.xs.length;
  }
}

/** The value held for 0.3 s (the lowest of the last 0.3 s): the top of a test is a position held at the end of the
 * movement – a shaking or wild point lifts the highest single value, never the held one. */
class Held {
  private xs: { t: number; v: number }[] = [];
  constructor(private ms = 300) {}
  push(v: number, t: number): number {
    this.xs.push({ t, v });
    while (this.xs.length > 1 && t - this.xs[0].t > this.ms) this.xs.shift();
    return Math.min(...this.xs.map((x) => x.v));
  }
}

/** An angle that swings both ways (a forearm, a wrist, a pelvis): smoothed (median of 5, a turn past ±180° kept whole)
 *  and its highest and lowest position held for 0.3 s – one wild point never makes the range. */
class Swing {
  private roll = new Roll(5);
  private hiH = new Held(300);
  private loH = new Held(300);
  private last: number | null = null;
  hi = -Infinity;
  lo = Infinity;
  /** when the range grew last (ms) */
  tGrew = 0;
  /** unwrap = false: the angle stays in -180..180 (a point that runs round the wrong way must not add a whole turn) */
  constructor(private unwrap = true) {}
  push(a: number, t: number): number {
    const u = this.last == null || !this.unwrap ? a : this.last + wrap(a - this.last);
    const v = this.roll.push(u);
    this.last = v;
    const hi = this.hiH.push(v, t);
    const lo = -this.loH.push(-v, t);
    if (hi > this.hi + 1 || lo < this.lo - 1) this.tGrew = t;
    this.hi = Math.max(this.hi, hi);
    this.lo = Math.min(this.lo, lo);
    return v;
  }
  get range() {
    return Number.isFinite(this.hi) ? this.hi - this.lo : 0;
  }
}

// ---------- framing: is everything the test needs in the picture? ----------
const FRONT_NEED: Partial<Record<MetricKind, number[]>> = {
  trunkRotation: [P.lSh, P.rSh, P.nose],
  pelvicRotation: [P.lSh, P.rSh, P.lHip, P.rHip, P.lAn, P.rAn],
  lowerQuarter: [P.lSh, P.rSh, P.lHip, P.rHip, P.lAn, P.rAn],
  balance: [P.lHip, P.rHip, P.lKn, P.rKn, P.lAn, P.rAn],
  neck: [P.nose, P.lEar, P.rEar, P.lSh, P.rSh],
  // both forearms towards the phone: the shoulders, elbows and both hands (wrist, pinky, index, thumb)
  forearm: [P.lSh, P.rSh, P.lEl, P.rEl, P.lWr, P.rWr, P.lPinky, P.rPinky, P.lIdx, P.rIdx, P.lThumb, P.rThumb],
};
const SIDE_NEED: Partial<Record<MetricKind, (keyof ReturnType<typeof S>)[]>> = {
  squat: ['sh', 'wr', 'hip', 'kn', 'an', 'heel', 'toe'],
  toeTouch: ['hip', 'kn', 'an', 'toe'],
  bridge: ['sh', 'hip', 'kn', 'an'],
  lat: ['sh', 'el', 'wr', 'hip'],
  shoulder9090: ['sh', 'el', 'wr', 'hip'],
  pelvicTilt: ['sh', 'hip', 'kn', 'an'],
  // kneeling, the arm forward: the shoulder, the whole arm and the hip of the side towards the phone
  reachRollLift: ['sh', 'el', 'wr', 'hip', 'kn'],
  // the arm towards the phone and its hand (the hand line wrist → between pinky and index)
  wristHinge: ['el', 'wr', 'pinky', 'idx'],
  wristFlex: ['el', 'wr', 'pinky', 'idx'],
};
export const inFrame = (f: Frame, i: number) => {
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

/**
 * How the player stands to the phone (the trainer mode waits for the right one): front = the shoulders side by side
 * (their width at least half the trunk length), side = one behind the other (under a third), null = in between.
 */
export function facingOf(f: Frame): 'front' | 'side' | null {
  const need = [P.lSh, P.rSh, P.lHip, P.rHip];
  if (need.some((i) => (f.lm[i].v ?? 1) < 0.1)) return null;
  const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const sh = dist(px(f, P.lSh), px(f, P.rSh));
  const torso = dist(mid(px(f, P.lSh), px(f, P.rSh)), mid(px(f, P.lHip), px(f, P.rHip)));
  if (torso < 1) return null;
  const r = sh / torso;
  return r > 0.5 ? 'front' : r < 0.33 ? 'side' : null;
}

// ---------- the analysers ----------
/** A turn measured from the width of the shoulders comes out about 3° short on a real body (the shoulder points of the
 *  pose model move inside the outline when the body turns): the TPI video of 31.10.2026 measured 44° where the physio
 *  saw a good turn of 45° or more, the motion capture check of 23.10.2026 3–11° short. The grade allows for it. */
export const TURN_TOL = 3;
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
  private lineW = new Steady();
  private hipW = new Steady();
  // (0.15 s: a trunk turns back and forth and is seldom held – 31.10.2026, the TPI video)
  private held = new Held(150);
  private best = 0;
  private bestHip = 0;
  private hipAtBest = 0;
  private t0 = -1;
  private tBest = 0;
  private done = false;
  private heldFrom = -1;
  private turned = false;
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
    const v = this.roll.push(turned(this.lineW.push(width(f, ...this.line)), this.w0));
    const hip = this.hips ? this.hipRoll.push(turned(this.hipW.push(width(f, ...this.hips)), this.h0)) : 0;
    const top = this.held.push(v, f.t);
    if (top > this.best + 0.5) {
      this.best = top;
      this.hipAtBest = hip;
      this.tBest = f.t;
    }
    this.bestHip = Math.max(this.bestHip, hip);
    // finished: turned back to the middle, no further for 3 s, or the time is up
    // a turn is one held near its top for 0.3 s – a shaking point at rest (15–20° from a little noise) is never held, and
    // must not end the test as "back to the middle" before the player turned at all
    if (v >= this.best * 0.8 && this.best >= 15) {
      if (this.heldFrom < 0) this.heldFrom = f.t;
      if (f.t - this.heldFrom >= 300) this.turned = true;
    } else this.heldFrom = -1;
    const back = this.turned && v < this.best * 0.5;
    const still = this.turned && f.t - this.tBest > 3000;
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
    // a turn from the width of the shoulders comes out a few degrees short (TURN_TOL)
    const reached = this.best + TURN_TOL;
    let grade: Grade = reached >= lim.pass ? 'pass' : reached >= lim.limited ? 'limited' : 'fail';
    // seated, the hips should stay where they are
    if (this.hips && this.hipAtBest > 15) {
      notes.push(L('The hips turn along', 'Die Hüfte dreht mit'));
      if (grade === 'pass') grade = 'limited';
    }
    const checks = [check('turn', `The chest turns ${lim.pass}° or more`, `Die Brust dreht ${lim.pass}° oder mehr`, reached >= lim.pass)];
    if (this.hips) checks.push(check('hipsStill', 'The hips stay still', 'Die Hüfte bleibt ruhig', this.hipAtBest <= 15));
    return { value: Math.round(this.best), grade, notes, checks };
  }
}

/** Better with someone holding the shoulders? Then the hips can turn – what is missing is the control (the physio, 29.10.2026). */
export const NOTE_HELD = L('Try again while someone holds your shoulders: if it goes better, the hips can turn – what is missing is the control, practise it slowly in front of a mirror', 'Probier es noch einmal, während jemand deine Schultern festhält: Geht es dann besser, kann die Hüfte drehen – es fehlt die Ansteuerung, die übst du langsam vor dem Spiegel');

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
  // (the hips are narrow in the picture: their width shakes most – steadied and held longer)
  private hW = new Steady(5);
  private sW = new Steady();
  private held = new Held(500);
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
    const h = this.hRoll.push(turned(this.hW.push(width(f, P.lHip, P.rHip)), this.h0));
    const s = this.sRoll.push(turned(this.sW.push(width(f, P.lSh, P.rSh)), this.s0));
    const top = this.held.push(h, f.t);
    if (top > this.best + 0.5) {
      this.best = top;
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
    if (grade !== 'pass') notes.push(NOTE_HELD);
    const checks = [check('turn', `The pelvis turns ${lim.pass}° or more`, `Das Becken dreht ${lim.pass}° oder mehr`, this.best >= lim.pass), check('chestStill', 'The chest stays still', 'Die Brust bleibt ruhig', !follows)];
    return { value: Math.round(this.best), grade, notes, checks };
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
    const both = this.maxPos >= 10 && this.maxNeg >= 10;
    if (!both) notes.push(L('Only one direction was seen', 'Nur eine Richtung wurde gemessen'));
    else if (Math.abs(this.maxPos - this.maxNeg) >= 15) notes.push(L(`One direction ${Math.round(Math.abs(this.maxPos - this.maxNeg))}° shorter`, `Eine Richtung ${Math.round(Math.abs(this.maxPos - this.maxNeg))}° kürzer`));
    // the nose moves to the left of the picture when the player turns to their right (the picture is not mirrored)
    const right = this.maxNeg;
    const left = this.maxPos;
    const checks = [check('right', `Turns ${lim.pass}° or more to the right`, `Dreht ${lim.pass}° oder mehr nach rechts`, right >= lim.pass), check('left', `Turns ${lim.pass}° or more to the left`, `Dreht ${lim.pass}° oder mehr nach links`, left >= lim.pass)];
    // the goal is each direction: one direction alone is at most limited (02.11.2026, the TPI video: one turn of 85° and
    // none the other way had come out "pass")
    const grade: Grade = b >= lim.pass && both ? 'pass' : b >= lim.limited ? 'limited' : 'fail';
    return { value: Math.round(b), grade, notes, checks };
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
  private earW = new Steady();
  private noseX = new Steady();
  // (a head turns quickly and is seldom held: the top held for 0.15 s – still more than a shaking point or two)
  private held = new Held(150);
  private best = 0;
  private t0 = -1;
  private tBest = 0;
  private done = false;
  private heldFrom = -1;
  private turned = false;
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
    const off = Math.abs(this.noseX.push(this.noseOff(f)) - this.n0);
    const bySide = deg(Math.asin(clamp(off / (NOSE_DEPTH * this.e0))));
    const earsSeen = vis(f, P.lEar) >= 0.5 && vis(f, P.rEar) >= 0.5;
    const byEars = turned(this.earW.push(width(f, P.lEar, P.rEar)), this.e0);
    const v = this.roll.push(earsSeen ? (bySide + byEars) / 2 : bySide);
    const top = this.held.push(v, f.t);
    if (top > this.best + 0.5) {
      this.best = top;
      this.tBest = f.t;
    }
    // a turn is one held near its top for 0.3 s – a shaking point at rest (15–20° from a little noise) is never held, and
    // must not end the test as "back to the middle" before the player turned at all
    if (v >= this.best * 0.8 && this.best >= 15) {
      if (this.heldFrom < 0) this.heldFrom = f.t;
      if (f.t - this.heldFrom >= 300) this.turned = true;
    } else this.heldFrom = -1;
    const back = this.turned && v < this.best * 0.5;
    const still = this.turned && f.t - this.tBest > 3000;
    if (back || still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: v, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.calE.length < CAL_FRAMES || this.best < 3) return null;
    const lim = LIMITS.neck;
    const checks = [check('turn', `The chin turns ${lim.pass}° or more – to the middle of the collarbone`, `Das Kinn dreht ${lim.pass}° oder mehr – bis zur Mitte des Schlüsselbeins`, this.best >= lim.pass)];
    return { value: Math.round(this.best), grade: this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail', notes: [], checks };
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
  /** arms = false: the retest with the hands behind the head – only depth and heels count */
  constructor(private ms = 15000, private arms = true) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return this.arms ? [[s.hip, s.kn], [s.sh, s.wr]] : [[s.hip, s.kn]];
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
    // thigh angle to the horizontal: + = the hip is below the knee (y grows downwards in the picture) – from how high the
    // hip is against the knee and the thigh's length standing: knees out to the side make the thigh look short and steep
    // side-on (23.10.2026, real squats of motion capture: 23° below level came out 32° above); heights are the same seen
    // from any side
    // (both legs, where both are seen: a knee out to the side is nearer to the phone or further from it – the mean undoes
    // most of the perspective)
    const both = inFrame(f, P.lHip) && inFrame(f, P.rHip) && inFrame(f, P.lKn) && inFrame(f, P.rKn);
    const drop = both ? (px(f, P.lHip)[1] - px(f, P.lKn)[1] + px(f, P.rHip)[1] - px(f, P.rKn)[1]) / 2 : hip[1] - kn[1];
    const depth = this.roll.push(deg(Math.asin(clamp(drop / this.base.thigh, -1))));
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
    if (this.heelRise > lim.heel) notes.push(NOTE_HEELS);
    if (this.arms && this.armsAtBest > lim.arms) notes.push(L('The arms tip forward', 'Die Arme kippen nach vorn'));
    const grade: Grade = !notes.length ? 'pass' : this.best < lim.depthFail || notes.length >= 2 ? 'fail' : 'limited';
    const checks = [check('depth', 'The thighs reach level or below', 'Die Oberschenkel kommen bis waagrecht oder tiefer', this.best >= lim.depth), check('heels', 'The heels stay down', 'Die Fersen bleiben am Boden', this.heelRise <= lim.heel)];
    if (this.arms) checks.push(check('arms', 'The arms stay overhead, in line with the trunk', 'Die Arme bleiben über dem Kopf, in Linie mit dem Rumpf', this.armsAtBest <= lim.arms));
    return { value: Math.round(this.best), grade, notes, checks };
  }
}

/** Toe touch from the side: how far the fingertips stay above the toes, with straight knees. */
export const LEG_CM = 85; // hip joint to ankle of a 1.75 m player – turns picture px into cm
/** The hand point of the pose model sits at the base of the index finger, not at its tip (31.10.2026, the TPI video: the
 *  physio's "fingertips at the ankles" measured 27 cm above the toes) – the finger is about this long. */
export const FINGER_CM = 7;
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
    const gap = this.roll.push(((px(f, s.toe)[1] - finger[1]) / this.leg) * LEG_CM - FINGER_CM);
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
    const checks = [check('reach', 'The fingertips reach the toes', 'Die Fingerspitzen erreichen die Zehen', this.best <= lim.pass), check('knees', 'The knees stay straight', 'Die Knie bleiben gestreckt', !knees)];
    return { value: Math.max(0, Math.round(this.best)), grade, notes, checks };
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
  private wrongSince = -1;
  private told = false;
  private hopped = false;
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
      // the other foot is up: the player stands on the wrong leg (left and right are easily mixed up in a mirror)
      const wrong = standY < liftY - 0.1 * this.leg;
      if (wrong) {
        if (this.wrongSince < 0) this.wrongSince = f.t;
        if (!this.told && f.t - this.wrongSince > 1000) {
          this.told = true;
          return { value: null, best: null, phase: 'move', cue: 'otherLeg' };
        }
      } else this.wrongSince = -1;
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
    if (hopped) this.hopped = true;
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
    const checks = [check('hold', `Held ${lim.pass} s with the eyes closed`, `${lim.pass} s mit geschlossenen Augen gehalten`, s >= lim.pass), check('foot', 'The standing foot stays where it is', 'Der Standfuß bleibt, wo er steht', !this.hopped)];
    return { value: s, grade: s >= lim.pass ? 'pass' : s >= lim.limited ? 'limited' : 'fail', notes: [], checks };
  }
}

/** A cramp at the back of the thigh: the hamstrings do the work of the glutes (the physio, 29.10.2026). */
export const NOTE_CRAMP = L('A cramp at the back of the thigh means the hamstrings do the work of the glutes – that is what the drills train', 'Krampft es hinten im Oberschenkel, übernimmt er die Arbeit des Gesäßmuskels – genau das trainieren die Übungen');

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
    const goal = LIMITS.bridge.hold;
    if (this.t1 < 0) {
      // the stretched leg is the one that is up and straight – lying side-on the pose model may swap left and right
      const up = (x: Side) => {
        const a = S(x);
        const b = S(other(x));
        return jointAngle(px(f, a.hip), px(f, a.kn), px(f, a.an)) >= 150 && px(f, a.an)[1] < px(f, b.an)[1] - 0.15 * this.leg;
      };
      const which = up(this.ext) ? this.ext : up(other(this.ext)) ? other(this.ext) : null;
      if (which) this.ext = which;
      const angle = this.roll.push(this.hipAngle(f));
      if (which && angle >= 150) {
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
    const angle = this.roll.push(this.hipAngle(f));
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
    if (held < lim.hold) notes.push(L(`Held for ${held} s`, `${held} s gehalten`), NOTE_CRAMP);
    const grade: Grade = held >= lim.hold && drop <= lim.drop ? 'pass' : (held >= lim.hold && drop <= lim.dropLimited) || (held >= 6 && drop <= lim.drop) ? 'limited' : 'fail';
    const checks = [check('hold', `Held ${lim.hold} s with the leg stretched`, `${lim.hold} s mit gestrecktem Bein gehalten`, held >= lim.hold), check('pelvis', 'The pelvis stays up', 'Das Becken bleibt oben', drop <= lim.drop)];
    return { value: held, grade, notes, checks };
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
  // (the elbow of one picture shakes by 30–90° from an angle – 31.10.2026, the TPI video: the median of a few pictures)
  private elbowRoll = new Roll(7);
  private tBest = 0;
  private t0 = -1;
  private lowSince = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return [[s.sh, s.el], [s.el, s.wr], [s.sh, s.hip]];
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    // the arm towards the camera, picture by picture (from an angle the far arm is hidden and its points jump)
    this.side = armSide(f);
    const s = S(this.side);
    if (this.t0 < 0) {
      this.t0 = f.t;
      this.tBest = f.t;
      return { value: null, best: null, phase: 'move', cue: 'go' };
    }
    const sh = px(f, s.sh);
    const flex = this.roll.push(angleBetween(sub(px(f, s.hip), sh), sub(px(f, s.wr), sh)));
    const elbow = this.elbowRoll.push(jointAngle(sh, px(f, s.el), px(f, s.wr)));
    if (flex > this.best + 0.5) {
      this.best = flex;
      this.tBest = f.t;
      this.elbowAtBest = elbow;
    }
    // the arms down again – for 0.6 s: a hand of a helper over the arm or one wrong point is not the end
    if (this.best >= 100 && flex < this.best - 40) {
      if (this.lowSince < 0) this.lowSince = f.t;
    } else this.lowSince = -1;
    const down = this.lowSince >= 0 && f.t - this.lowSince >= 600;
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
    if (this.elbowAtBest < lim.elbow) {
      notes.push(L('The elbows bend', 'Die Ellbogen beugen sich'));
      if (grade === 'pass') grade = 'limited';
    }
    const checks = [check('wall', 'The arms reach the wall', 'Die Arme erreichen die Wand', this.best >= lim.pass), check('elbows', 'The elbows stay straight', 'Die Ellbogen bleiben gestreckt', this.elbowAtBest >= lim.elbow)];
    return { value: Math.round(Math.min(180, this.best)), grade, notes, checks };
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
    const checks = [check('spine', 'The forearm reaches the line of the spine', 'Der Unterarm erreicht die Linie der Wirbelsäule', this.best <= lim.pass)];
    return { value: Math.round(this.best), grade: this.best <= lim.pass ? 'pass' : this.best <= lim.limited ? 'limited' : 'fail', notes: [], checks };
  }
}

/**
 * Pelvic tilt (side view, golf posture, arms crossed): the pelvis tilts forward (hollow back) and back (flat back), the
 * chest stays still. The pose model has no point on the pelvis – what the camera sees is the hip point moving back and
 * forth under the still shoulders: the hip angle shoulder–hip–knee closes with the hollow back and opens with the flat
 * back (its change from the posture at the start is the value, both ways together). The physio also looks at how smooth
 * it is ("shake and bake" while flattening, 29.10.2026): the jitter of the hip angle while flattening against the jitter
 * standing still. Not a measured pelvic angle – a proxy, REVIEW(golf).
 * Both ways count from the posture held still at the start: a player who tilts at once is measured from the first still
 * moment, often a held tilt (02.11.2026, the TPI video: started in the hollow hold, "hollowing does not work").
 */
class PelvicTiltAnalyzer implements Analyzer {
  readonly kind = 'pelvicTilt' as const;
  readonly unit = '°' as const;
  private side: Side | null = null;
  private cal: { a: number; sh: V; trunk: number; lean: number }[] = [];
  private a0 = 0;
  private sh0: V = [0, 0];
  private trunk = 1;
  private swing = new Swing();
  private chestRoll = new Roll(5);
  private chest = 0;
  /** the last two raw hip angles (for the jitter) */
  private prev: number[] = [];
  /** the last hip angle taken, and since when the pictures jump away from it (ms) */
  private lastRaw: number | null = null;
  private slipFrom = -1;
  private calJit: number[] = [];
  private flatJit: number[] = [];
  private hollowJit: number[] = [];
  private tryFrom = -1;
  private lean0 = 0;
  private outMs = 0;
  private lastT = -1;
  private t0 = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.side ?? 'left');
    return [[s.sh, s.hip], [s.hip, s.kn]];
  }
  private hipAngle(f: Frame, s: ReturnType<typeof S>) {
    return jointAngle(px(f, s.sh), px(f, s.hip), px(f, s.kn));
  }
  /** how far the trunk leans forward from upright (°) */
  private lean(f: Frame, s: ReturnType<typeof S>) {
    const d = sub(px(f, s.sh), px(f, s.hip));
    return deg(Math.atan2(Math.abs(d[0]), -d[1]));
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best(), phase: 'done' };
    this.side ??= nearSide(f);
    const s = S(this.side);
    if (this.tryFrom < 0) this.tryFrom = f.t;
    const dt = this.lastT < 0 ? 0 : Math.min(200, f.t - this.lastT);
    this.lastT = f.t;
    if ([s.sh, s.hip, s.kn, s.an].some((i) => vis(f, i) < 0.5)) return { value: null, best: null, phase: this.t0 < 0 ? 'calibrate' : 'move' };
    const raw = this.hipAngle(f, s);
    // a jump of the hip angle by more than 20° from one picture to the next is the tracking slipping (to someone close by,
    // a wrong point), not a tilt: left out for up to 0.5 s, then the new angle counts (02.11.2026, the TPI video: the
    // tracking jumped to the physio beside the player for half a second – 40° "tilts" and a "moving chest")
    if (this.lastRaw != null && Math.abs(raw - this.lastRaw) > 20) {
      if (this.slipFrom < 0) this.slipFrom = f.t;
      if (f.t - this.slipFrom < 500) return { value: null, best: this.t0 < 0 ? null : this.best(), phase: this.t0 < 0 ? 'calibrate' : 'move' };
    }
    this.slipFrom = -1;
    this.lastRaw = raw;
    const lean = this.lean(f, s);
    // the shoulder against the ankle: the phone stands still, the feet too – what the shoulder moves, the chest moved
    const sh = sub(px(f, s.sh), px(f, s.an));
    // the jitter: the bend of the hip angle from picture to picture (a steady movement has none, a shaking one a lot)
    const p = this.prev;
    const jit = p.length === 2 ? Math.abs(raw - 2 * p[1] + p[0]) : 0;
    this.prev = [...p, raw].slice(-2);
    if (this.t0 < 0) {
      // the start: in golf posture (the trunk leans forward 15° or more) and still – getting into the posture is not a tilt
      // (01.11.2026, the TPI video: the first pictures were the player bending forward into the posture, 24° "tilt")
      if (lean < 15) {
        this.cal = [];
        this.calJit = [];
        return { value: null, best: null, phase: 'calibrate' };
      }
      this.cal.push({ a: raw, sh, trunk: dist(px(f, s.sh), px(f, s.hip)), lean });
      if (this.cal.length > 2) this.calJit.push(jit);
      if (this.cal.length > CAL_FRAMES) {
        this.cal.shift();
        this.calJit.shift();
      }
      const as = this.cal.map((c) => c.a);
      const still = Math.max(...as) - Math.min(...as) <= 4;
      // (after 8 s the start is taken as it is – the test must not wait for ever)
      if (this.cal.length === CAL_FRAMES && (still || f.t - this.tryFrom > 8000)) {
        this.a0 = median(as);
        this.sh0 = [median(this.cal.map((c) => c.sh[0])), median(this.cal.map((c) => c.sh[1]))];
        this.trunk = Math.max(1, median(this.cal.map((c) => c.trunk)));
        this.lean0 = median(this.cal.map((c) => c.lean));
        this.t0 = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const lim = LIMITS.pelvicTilt;
    let v: number | null = null;
    // still in golf posture? Standing up (the trunk upright) opens the hip angle far more than a tilt – not counted
    // (01.11.2026, the TPI video: the player pushed the hips forward to upright between the tilts, the hip angle 35–50°)
    if (lean >= Math.max(12, this.lean0 - 15)) {
      // + = the hip angle opens (flat back), − = it closes (hollow back)
      v = this.swing.push(raw - this.a0, f.t);
      const chest = this.chestRoll.push(dist(sh, this.sh0) / this.trunk);
      if (Math.abs(v) >= lim.small) this.chest = Math.max(this.chest, chest);
      if (v >= lim.small) this.flatJit.push(jit);
      if (v <= -lim.small) this.hollowJit.push(jit);
    } else this.outMs += dt;
    if (f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: v, best: this.best(), phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best(), phase: 'move', hold: (f.t - this.t0) / this.ms };
  }
  private ways() {
    return { hollow: Math.max(0, -this.swing.lo), flat: Math.max(0, this.swing.hi) };
  }
  private best() {
    const w = this.ways();
    return w.hollow + w.flat;
  }
  /** the jitter while flattening against the jitter standing still and while hollowing: shaking ("shake and bake" – the
   *  TPI form asks for it while flattening; the pose model shakes too, the same in every phase) */
  shaky() {
    const lim = LIMITS.pelvicTilt;
    if (this.flatJit.length < 4) return false;
    const rest = Math.max(0.3, median(this.calJit));
    const flat = median(this.flatJit);
    const hollow = this.hollowJit.length >= 4 ? median(this.hollowJit) : 0;
    return flat >= lim.shakeMin && flat >= lim.shake * rest && flat >= lim.shakeHollow * hollow;
  }
  finish(): Outcome | null {
    if (this.t0 < 0 || !Number.isFinite(this.swing.hi)) return null;
    const lim = LIMITS.pelvicTilt;
    const { hollow, flat } = this.ways();
    const notes: Text[] = [];
    const bothClear = hollow >= lim.clear && flat >= lim.clear;
    const bothSome = hollow >= lim.small && flat >= lim.small;
    const chestStill = this.chest <= lim.chest;
    const shaky = bothSome && this.shaky();
    let grade: Grade;
    if (!bothSome) {
      if (hollow < lim.small && flat < lim.small) {
        grade = 'fail';
        notes.push(L('The pelvis hardly tilts', 'Das Becken kippt kaum'));
      } else {
        // one way only: limited – with the chest moving along, the pelvis did not tilt on its own
        grade = chestStill ? 'limited' : 'fail';
        notes.push(hollow < lim.small ? L('Hollowing the back does not work', 'Ins Hohlkreuz kippen klappt nicht') : L('Flattening the back does not work', 'Den Rücken flach machen klappt nicht'));
      }
    } else grade = bothClear && chestStill && !shaky ? 'pass' : 'limited';
    if (shaky) notes.push(L('It shakes while flattening the back', 'Es zittert beim Flachmachen des Rückens'));
    if (!chestStill) notes.push(L('The chest moves along', 'Die Brust bewegt sich mit'));
    // standing up between the tilts: those moments were not measured
    if (this.outMs >= 1000) notes.push(L('Stay in golf posture – standing up is not a tilt', 'Bleib in der Golfhaltung – Aufrichten ist kein Kippen'));
    const checks = [
      check('hollow', 'Tilts forward – hollow back', 'Kippt nach vorn – Hohlkreuz', hollow >= lim.clear),
      check('flat', 'Tilts back – flat back', 'Kippt nach hinten – flacher Rücken', flat >= lim.clear),
      check('smooth', 'Smooth, without shaking', 'Flüssig, ohne Zittern', !shaky),
      check('chestStill', 'The chest stays still', 'Die Brust bleibt ruhig', chestStill),
    ];
    return { value: Math.round(hollow + flat), grade, notes, checks };
  }
}

/**
 * Forearm rotation (front view, both hands at once): elbows at the sides bent 90°, the forearms point at the phone, thumbs
 * up to start. Seen along the forearm, the hand turns in the picture like a clock hand: the line wrist → thumb points up
 * with the thumb up, inwards with the palm down (pronation) and outwards with the palm up (supination). The value is half
 * the whole turn of the weaker hand ("about X° each way") – the whole turn needs no start position; how it splits into the
 * two ways comes from the thumbs-up start (and only counts when the start was thumbs up). The pose model's thumb point is
 * coarse (01.11.2026, the TPI video: palm down read 110–130° from up, palm up 40–55° – together about 170°, the physio:
 * normal > 80° both ways).
 */
class ForearmAnalyzer implements Analyzer {
  readonly kind = 'forearm' as const;
  readonly unit = '°' as const;
  private cal: Record<Side, number[]> = { left: [], right: [] };
  private calEl: Record<Side, number[]> = { left: [], right: [] };
  private calW: number[] = [];
  private a0: Record<Side, number> = { left: 0, right: 0 };
  private el0: Record<Side, number> = { left: 0, right: 0 };
  private w0 = 1;
  private calSteady = false;
  // (no unwrapping: a hand turns less than a whole turn, a thumb point running round must not add one)
  private swing: Record<Side, Swing> = { left: new Swing(false), right: new Swing(false) };
  private elRoll: Record<Side, Roll> = { left: new Roll(5), right: new Roll(5) };
  private elDrift = 0;
  private t0 = -1;
  private done = false;
  constructor(private ms = 15000) {}
  focus(): [number, number][] {
    return [[P.lWr, P.lThumb], [P.rWr, P.rThumb], [P.lEl, P.lWr], [P.rEl, P.rWr]];
  }
  /** the hand's turn: wrist → thumb from picture-up, + = outwards (supination), − = inwards (pronation); the player's left
   *  hand is on the right of the (not mirrored) picture */
  private angle(f: Frame, side: Side): number | null {
    const s = S(side);
    if (vis(f, s.wr) < 0.5 || vis(f, s.thumb) < 0.5) return null;
    const d = sub(px(f, s.thumb), px(f, s.wr));
    if (Math.hypot(d[0], d[1]) < 2) return null;
    const out = side === 'left' ? 1 : -1;
    const a = deg(Math.atan2(out * d[0], -d[1]));
    // the line pinky → index turns with the hand too: a thumb point pointing the other way is a wrong point (01.11.2026,
    // the TPI video: turning from palm down to palm up the thumb point ran round through "down" for 0.6 s – the hand line
    // stayed where the hand was; the two agree within 60° otherwise)
    if (vis(f, s.pinky) >= 0.5 && vis(f, s.idx) >= 0.5) {
      const h = sub(px(f, s.idx), px(f, s.pinky));
      if (Math.hypot(h[0], h[1]) >= 2 && Math.abs(wrap(a - deg(Math.atan2(out * h[0], -h[1])))) > 90) return null;
    }
    return a;
  }
  /** the elbow sideways from its shoulder (px, + = outwards) */
  private elbowOut(f: Frame, side: Side) {
    const s = S(side);
    return (side === 'left' ? 1 : -1) * (px(f, s.el)[0] - px(f, s.sh)[0]);
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best(), phase: 'done' };
    const a = { left: this.angle(f, 'left'), right: this.angle(f, 'right') };
    if (this.t0 < 0) {
      if (a.left == null || a.right == null) return { value: null, best: null, phase: 'calibrate' };
      for (const s of ['left', 'right'] as Side[]) {
        this.cal[s].push(a[s]!);
        this.calEl[s].push(this.elbowOut(f, s));
      }
      this.calW.push(width(f, P.lSh, P.rSh));
      if (this.cal.left.length === CAL_FRAMES) {
        let steady = true;
        for (const s of ['left', 'right'] as Side[]) {
          // (around the median: a wrap at ±180° does not count as a spread)
          const m = median(this.cal[s]);
          this.a0[s] = m;
          this.el0[s] = median(this.calEl[s]);
          const spread = Math.max(...this.cal[s].map((x) => Math.abs(wrap(x - m))));
          // the thumbs up: still, and roughly up in the picture (the forearm points at the phone)
          if (spread > 25 || Math.abs(m) > 60) steady = false;
        }
        this.calSteady = steady;
        this.w0 = Math.max(1, median(this.calW));
        this.t0 = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    let now: number | null = null;
    for (const s of ['left', 'right'] as Side[]) {
      const x = a[s];
      if (x == null) continue;
      const v = this.swing[s].push(x, f.t);
      now = Math.max(now ?? 0, Math.abs(wrap(v - this.a0[s])));
      if (inFrame(f, S(s).el) && inFrame(f, S(s).sh)) this.elDrift = Math.max(this.elDrift, this.elRoll[s].push(Math.abs(this.elbowOut(f, s) - this.el0[s]) / this.w0));
    }
    const lim = LIMITS.forearm;
    const best = this.best();
    const grew = Math.max(this.swing.left.tGrew, this.swing.right.tGrew, this.t0);
    // finished early only when both hands reached the goal and turn no further for 3 s – else the time runs out (01.11.2026,
    // the TPI videos: the first way held for a few seconds must not end the test before the other way)
    const still = best * 2 >= lim.pass && f.t - grew > 3000;
    if (still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: now, best, phase: 'done', cue: 'done' };
    }
    return { value: now, best, phase: 'move' };
  }
  /** half the whole turn of the weaker hand */
  private best() {
    return Math.min(this.swing.left.range, this.swing.right.range) / 2;
  }
  /** the two ways of one hand from the thumbs-up start: pronation (palm down), supination (palm up) */
  ways(side: Side) {
    const sw = this.swing[side];
    return { pro: this.a0[side] - sw.lo, sup: sw.hi - this.a0[side] };
  }
  finish(): Outcome | null {
    if (this.t0 < 0) return null;
    const lim = LIMITS.forearm;
    const arc = { left: this.swing.left.range, right: this.swing.right.range };
    const weak = Math.min(arc.left, arc.right);
    if (weak < 20) return null;
    const notes: Text[] = [];
    let grade: Grade = weak >= lim.pass ? 'pass' : weak >= lim.limited ? 'limited' : 'fail';
    if (grade !== 'pass') {
      const h = (x: number) => Math.round(x / 2);
      notes.push(L(`Left about ${h(arc.left)}° each way, right about ${h(arc.right)}°`, `Links etwa ${h(arc.left)}° pro Seite, rechts etwa ${h(arc.right)}°`));
    }
    // one way clearly less – judged only from a thumbs-up start
    if (this.calSteady) {
      for (const s of ['left', 'right'] as Side[]) {
        const w = this.ways(s);
        if (Math.min(w.pro, w.sup) < lim.oneWay && Math.max(w.pro, w.sup) >= 75) {
          const l = s === 'left';
          notes.push(
            w.pro < w.sup
              ? L(`${l ? 'Left' : 'Right'}: the palm does not turn down fully`, `${l ? 'Links' : 'Rechts'}: die Handfläche dreht nicht ganz nach unten`)
              : L(`${l ? 'Left' : 'Right'}: the palm does not turn up fully`, `${l ? 'Links' : 'Rechts'}: die Handfläche dreht nicht ganz nach oben`),
          );
          if (grade === 'pass') grade = 'limited';
        }
      }
    }
    const elbows = this.elDrift <= lim.elbow;
    if (!elbows) {
      notes.push(L('The elbows leave the sides – the shoulder turns along', 'Die Ellbogen gehen vom Körper weg – die Schulter dreht mit'));
      if (grade === 'pass') grade = 'limited';
    }
    const checks = [
      check('left', 'The left forearm turns about 80° each way', 'Der linke Unterarm dreht etwa 80° pro Seite', arc.left >= lim.pass),
      check('right', 'The right forearm turns about 80° each way', 'Der rechte Unterarm dreht etwa 80° pro Seite', arc.right >= lim.pass),
      check('elbows', 'The elbows stay at the sides', 'Die Ellbogen bleiben am Körper', elbows),
    ];
    return { value: Math.round(weak / 2), grade, notes, checks };
  }
}

/**
 * The wrist bent up and down against the forearm (side view, the arm towards the phone): the forearm is the line elbow →
 * wrist, the hand the line wrist → between pinky and index (the knuckles of a fist). + = the hand up in the picture.
 * Wrist hinge: fist thumb up – up = radial (thumb side), down = ulnar. Wrist bend: forearm level, palm down – up =
 * extension, down = flexion. Each way from the hand in line at the start; the pose model's hand point follows only part of
 * the bend (`gain`, from the TPI videos of 29.10.2026 – one player, REVIEW(golf)).
 */
class WristAnalyzer implements Analyzer {
  readonly unit = '°' as const;
  private hand: Side | null = null;
  private cal: Record<Side, number[]> = { left: [], right: [] };
  private a0 = 0;
  /** the start was still with the hand in line: each way can be judged */
  steady = false;
  private swing = new Swing();
  private t0 = -1;
  private done = false;
  constructor(readonly kind: 'wristHinge' | 'wristFlex', private ms = 20000) {}
  private get gain() {
    return this.kind === 'wristHinge' ? LIMITS.wristHinge.gain : LIMITS.wristFlex.gain;
  }
  /** the goal of each way (°): up, down */
  private get goal(): [number, number] {
    return this.kind === 'wristHinge' ? [LIMITS.wristHinge.radial, LIMITS.wristHinge.ulnar] : [LIMITS.wristFlex.pass, LIMITS.wristFlex.pass];
  }
  focus(): [number, number][] {
    const s = S(this.hand ?? 'left');
    return [[s.el, s.wr], [s.wr, s.idx], [s.wr, s.pinky]];
  }
  /** the hand against the forearm in the picture (°, + = up) – null when the hand is not seen or the forearm points at
   *  the phone (then up and down are not in the picture) */
  angle(f: Frame, side: Side): number | null {
    const s = S(side);
    if ([s.el, s.wr, s.pinky, s.idx].some((i) => vis(f, i) < 0.5)) return null;
    const wr = px(f, s.wr);
    const fa = sub(wr, px(f, s.el));
    const hand = sub(mid2(px(f, s.pinky), px(f, s.idx)), wr);
    const lf = len(fa);
    const lh = len(hand);
    if (lh < 2 || lf < 1.2 * lh || Math.abs(fa[0]) < 0.4 * lf) return null;
    // the forearm points left or right in the picture: up is the other turning sense
    return (fa[0] < 0 ? -1 : 1) * wrap(dirDeg(hand) - dirDeg(fa));
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best(), phase: 'done' };
    if (this.t0 < 0) {
      // the hand towards the phone: the one seen better (the far one is hidden behind the body)
      const seen = (x: Side) => {
        const s = S(x);
        return vis(f, s.el) + vis(f, s.wr) + vis(f, s.pinky) + vis(f, s.idx);
      };
      const side: Side = seen('left') >= seen('right') ? 'left' : 'right';
      const a = this.angle(f, side);
      if (a == null) return { value: null, best: null, phase: 'calibrate' };
      this.cal[side].push(a);
      if (this.cal[side].length === CAL_FRAMES) {
        this.hand = side;
        this.a0 = median(this.cal[side]);
        const st = LIMITS.wristStart;
        this.steady = Math.max(...this.cal[side].map((x) => Math.abs(x - this.a0))) <= st.spread && Math.abs(this.a0) <= st.off;
        this.t0 = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    const a = this.angle(f, this.hand!);
    if (a == null) return { value: null, best: this.best(), phase: 'move' };
    const v = (this.swing.push(a, f.t) - this.a0) * this.gain;
    const [gu, gd] = this.goal;
    // finished early only when the goal is reached (up and down together, from a still start each way half of its goal)
    // and the hand goes no further for 2.5 s – else the time runs out (01.11.2026, the TPI videos: the first way held for
    // seconds while the physio checked it must not end the test before the other way)
    const { up, down } = this.ways();
    const both = !this.steady || (up >= gu / 2 && down >= gd / 2);
    const still = both && this.range() >= gu + gd && f.t - Math.max(this.swing.tGrew, this.t0) > 2500;
    if (still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: v, best: this.best(), phase: 'done', cue: 'done' };
    }
    return { value: v, best: this.best(), phase: 'move' };
  }
  /** up and down together (°, with the gain) – needs no start position */
  range() {
    return this.swing.range * this.gain;
  }
  /** each way from the start (°, with the gain) – only meaningful from a start with the hand in line (`steady`) */
  ways() {
    if (!Number.isFinite(this.swing.hi)) return { up: 0, down: 0 };
    return { up: Math.max(0, (this.swing.hi - this.a0) * this.gain), down: Math.max(0, (this.a0 - this.swing.lo) * this.gain) };
  }
  /** hinge: up and down together; bend: about this much each way (half of both together) */
  private best() {
    return this.kind === 'wristHinge' ? this.range() : this.range() / 2;
  }
  finish(): Outcome | null {
    if (this.t0 < 0) return null;
    const range = this.range();
    if (range < 5) return null;
    const [gu, gd] = this.goal;
    const hinge = this.kind === 'wristHinge';
    // graded on up and down together – it needs no start position, and the hand point is too coarse for a start a few
    // degrees off (with the gain of the bend, 10° on the picture are 30°): hinge 50° (20 + 30), bend 120° (60 each way);
    // limited from half (hinge) or 2 × 40° (bend)
    const goal = gu + gd;
    const limited = hinge ? goal / 2 : 2 * LIMITS.wristFlex.limited;
    let grade: Grade = range >= goal ? 'pass' : range >= limited ? 'limited' : 'fail';
    const r = Math.round;
    const notes: Text[] = [];
    // one way clearly less – only from a still start with the hand in line: the weaker way under 60 % of its goal while
    // the other reaches its goal (the self check: hinge 10° up / 35° down, bend 70° / 35°)
    let oneWay = false;
    if (this.steady) {
      const { up, down } = this.ways();
      const ru = up / gu;
      const rd = down / gd;
      if (Math.min(ru, rd) < 0.6 && Math.max(ru, rd) >= 1) {
        oneWay = true;
        notes.push(
          hinge
            ? ru < rd
              ? L(`Hinging up (thumb side) is clearly less: ${r(up)}°`, `Nach oben (Daumenseite) deutlich weniger: ${r(up)}°`)
              : L(`Hinging down is clearly less: ${r(down)}°`, `Nach unten deutlich weniger: ${r(down)}°`)
            : ru < rd
              ? L(`Bending up (back of the hand) is clearly less: ${r(up)}°`, `Nach oben (Handrücken) deutlich weniger: ${r(up)}°`)
              : L(`Bending down is clearly less: ${r(down)}°`, `Nach unten deutlich weniger: ${r(down)}°`),
        );
        if (grade === 'pass') grade = 'limited';
      }
    }
    if (grade === 'fail') notes.push(L('The wrist is stiff both ways', 'Das Handgelenk ist in beide Richtungen steif'));
    const checks = hinge
      ? [check('range', `Hinges ${goal}° up and down together (about ${gu}° up, ${gd}° down)`, `Winkelt ${goal}° nach oben und unten zusammen (etwa ${gu}° hoch, ${gd}° runter)`, range >= goal), check('bothWays', 'Both ways work', 'Beide Richtungen gehen', !oneWay)]
      : [check('range', `Bends about ${gu}° each way`, `Beugt etwa ${gu}° in jede Richtung`, range >= goal), check('bothWays', 'Both ways work', 'Beide Richtungen gehen', !oneWay)];
    return { value: r(this.best()), grade, notes, checks };
  }
}

/**
 * Reach, roll and lift (kneeling, sitting back on the heels, chest on the thighs, forehead down; side view): one straight
 * arm lies forward on the floor, thumb up, and lifts as high as it can. The lift is the turn of the line shoulder → wrist
 * from where the arm lay at the start; the arm that lifts is measured (lying side-on, the pose model mixes up left and
 * right). Not checked on a video yet (01.11.2026) – REVIEW(golf).
 */
class ReachRollLiftAnalyzer implements Analyzer {
  readonly kind = 'reachRollLift' as const;
  readonly unit = '°' as const;
  private cal: Record<Side, number[]> = { left: [], right: [] };
  private a0: Record<Side, number> = { left: 0, right: 0 };
  private roll: Record<Side, Roll> = { left: new Roll(5), right: new Roll(5) };
  private held: Record<Side, Held> = { left: new Held(300), right: new Held(300) };
  private elbowRoll = new Roll(7);
  private arm: Side = 'left';
  private best = 0;
  private elbowAtBest = 180;
  private tBest = 0;
  private lowSince = -1;
  private t0 = -1;
  private done = false;
  constructor(private ms = 12000) {}
  focus(): [number, number][] {
    const s = S(this.arm);
    return [[s.sh, s.el], [s.el, s.wr]];
  }
  /** the arm's direction in the picture, + = up – measured the same way whichever way the player faces */
  private elevation(f: Frame, side: Side): number | null {
    const s = S(side);
    if (vis(f, s.sh) < 0.5 || vis(f, s.wr) < 0.5) return null;
    const d = sub(px(f, s.wr), px(f, s.sh));
    if (len(d) < 5) return null;
    return deg(Math.atan2(-d[1], Math.abs(d[0])));
  }
  push(f: Frame): Live {
    if (this.done) return { value: null, best: this.best, phase: 'done' };
    const e = { left: this.elevation(f, 'left'), right: this.elevation(f, 'right') };
    if (this.t0 < 0) {
      if (e.left == null && e.right == null) return { value: null, best: null, phase: 'calibrate' };
      for (const s of ['left', 'right'] as Side[]) if (e[s] != null) this.cal[s].push(e[s]!);
      if (Math.max(this.cal.left.length, this.cal.right.length) >= CAL_FRAMES) {
        for (const s of ['left', 'right'] as Side[]) this.a0[s] = this.cal[s].length ? median(this.cal[s]) : 0;
        this.t0 = f.t;
        this.tBest = f.t;
        return { value: 0, best: 0, phase: 'move', cue: 'go' };
      }
      return { value: null, best: null, phase: 'calibrate' };
    }
    let now: number | null = null;
    for (const s of ['left', 'right'] as Side[]) {
      if (e[s] == null || !this.cal[s].length) continue;
      const lift = this.roll[s].push(e[s]! - this.a0[s]);
      const top = this.held[s].push(lift, f.t);
      if (now == null || lift > now) now = lift;
      if (top > this.best + 0.5) {
        this.best = top;
        this.arm = s;
        this.tBest = f.t;
        const a = S(s);
        this.elbowAtBest = this.elbowRoll.push(jointAngle(px(f, a.sh), px(f, a.el), px(f, a.wr)));
      }
    }
    const lim = LIMITS.reachRollLift;
    // finished: the arm down again for 0.6 s, or held at its top for 2.5 s, or the time is up
    if (this.best >= lim.limited && now != null && now < this.best - 15) {
      if (this.lowSince < 0) this.lowSince = f.t;
    } else this.lowSince = -1;
    const down = this.lowSince >= 0 && f.t - this.lowSince >= 600;
    const still = this.best >= lim.limited && f.t - this.tBest > 2500;
    if (down || still || f.t - this.t0 > this.ms) {
      this.done = true;
      return { value: now, best: this.best, phase: 'done', cue: 'done' };
    }
    return { value: now, best: this.best, phase: 'move' };
  }
  finish(): Outcome | null {
    if (this.t0 < 0) return null;
    const lim = LIMITS.reachRollLift;
    const notes: Text[] = [];
    let grade: Grade = this.best >= lim.pass ? 'pass' : this.best >= lim.limited ? 'limited' : 'fail';
    if (grade === 'fail') notes.push(L('The arm does not come off the floor', 'Der Arm hebt nicht vom Boden ab'));
    const straight = this.elbowAtBest >= lim.elbow;
    if (!straight && this.best >= lim.limited) {
      notes.push(L('The elbow bends', 'Der Ellbogen beugt sich'));
      if (grade === 'pass') grade = 'limited';
    }
    const checks = [check('lift', 'The arm lifts to ear height', 'Der Arm hebt bis auf Ohrhöhe', this.best >= lim.pass), check('elbow', 'The arm stays straight', 'Der Arm bleibt gestreckt', straight)];
    return { value: Math.max(0, Math.round(this.best)), grade, notes, checks };
  }
}

/**
 * The analyser of a test. `side`: the direction to turn (trunk, neck), the standing leg (balance, lower quarter),
 * the stretched leg (bridge) or the arm towards the camera (90/90).
 */
/** The squat note for heels that come up – the retest asks the ankle about it. */
export const NOTE_HEELS = L('The heels come up', 'Die Fersen heben ab');

export function makeAnalyzer(kind: MetricKind, side: Side = 'left', opts: { noArms?: boolean } = {}): Analyzer {
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
      return new SquatAnalyzer(15000, !opts.noArms);
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
    case 'pelvicTilt':
      return new PelvicTiltAnalyzer();
    case 'forearm':
      return new ForearmAnalyzer();
    case 'wristHinge':
    case 'wristFlex':
      return new WristAnalyzer(kind);
    case 'reachRollLift':
      return new ReachRollLiftAnalyzer();
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
    case 'forearm':
    case 'wristFlex':
      return tr(`about ${v}° each way`, `etwa ${v}° pro Richtung`);
    case 'wristHinge':
      return tr(`${v}° up and down together`, `${v}° nach oben und unten zusammen`);
    case 'pelvicTilt':
      return tr(`hip angle moves ${v}°`, `Hüftwinkel bewegt sich ${v}°`);
    case 'reachRollLift':
      return tr(`the arm lifts ${v}°`, `der Arm hebt ${v}°`);
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

/** The trunk and the legs of the player – a person cut off by the edge of the picture lacks some of them. */
const BODY_POINTS = [P.lSh, P.rSh, P.lHip, P.rHip, P.lKn, P.rKn, P.lAn, P.rAn];

/**
 * The player when several people are in the picture (a partner holding the phone, a child walking past): the largest,
 * most central person, and the one seen before stays the player (as in the Coach prototype). A person cut off by the
 * edge of the picture is a helper or someone passing, not the player standing in front of the phone – and one standing
 * at the side near the phone neither (31.10.2026, the TPI videos: the physio stood at the right edge close to the phone,
 * looked twice as big and was followed instead of the player in the middle): the middle of the picture counts strongly.
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
    const whole = BODY_POINTS.filter((i) => {
      const p = lm[i];
      return !!p && (p.v ?? 1) >= 0.5 && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;
    }).length / BODY_POINTS.length;
    let score = h * Math.max(0.05, 1 - 2 * Math.abs(cx - 0.5)) * (0.25 + 0.75 * whole);
    if (prev) score -= 2 * Math.hypot(cx - prev.x, cy - prev.y);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * Following the player from picture to picture (pose.ts live, the TPI checks offline): the person seen before stays the
 * player, and a jump across the picture from one picture to the next is someone else – the player was not seen in it
 * (31.10.2026, the TPI videos: when the model missed the player for a moment, the physio in front of the phone was the
 * only person seen and became the "player" for the rest of the test). After 1.5 s without the player anyone may be the
 * player again (they walked away and came back elsewhere).
 */
export class Follower {
  private prev: { x: number; y: number } | null = null;
  private lastT = -Infinity;
  reset(): void {
    this.prev = null;
    this.lastT = -Infinity;
  }
  /** the player's points in this picture, or null (nobody, or only someone else) */
  pick(people: Lm[][], t: number): Lm[] | null {
    if (!people.length) return null;
    const lm = people[pickMainPerson(people, this.prev)];
    const c = personCenter(lm);
    if (!c) return null;
    if (this.prev && t - this.lastT < 1500 && Math.hypot(c.x - this.prev.x, c.y - this.prev.y) > 0.2) return null;
    this.prev = c;
    this.lastT = t;
    return lm;
  }
}
