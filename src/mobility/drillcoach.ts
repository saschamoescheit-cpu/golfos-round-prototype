import { L, type L as Text } from '../training/types';
import { LEG_CM, NOSE_DEPTH, P, S, angleBetween, dist, inFrame, jointAngle, median, nearSide, px, sub, turned, vis, width, type Frame } from './measure';
import type { Side, TestId } from './types';

// The drills of the mobility pillar as a guided session (Sascha 18.10.2026: "not a knowledge base like Training – an
// app that leads a person through exercises and analyses and measures the mobility meanwhile"). For every drill: how
// the app leads it (reps in a tempo or holds, per side or not, how to stand to the phone) and – where the camera can
// see it reliably – what it measures while the player does it. Pure functions over the body points, like measure.ts,
// so the unit tests run them with synthetic bodies. REVIEW(golf): Chris (reps, holds, what counts as a rep).

/** What the camera follows during a drill, picture by picture. */
export type SignalId = 'turn' | 'hipTurn' | 'head' | 'squat' | 'reach' | 'shin' | 'hipExt' | 'arms' | 'oneLeg' | 'shoulderEr' | 'kneeOpen' | 'sideSwitch';

export interface DrillCoach {
  /** how the player is placed to the phone: face-on, side-on, or on the floor (only the body has to be seen) */
  view: 'front' | 'side' | 'floor';
  /** where and how to stand, said after the demo */
  where: Text;
  /** left and right one after the other */
  sides?: boolean;
  /** repetitions per set (and side) */
  reps?: number;
  /** seconds per repetition – the count of the app when it does not see the reps */
  tempo?: number;
  /** seconds of a hold */
  hold?: number;
  /** sets (and holds) per side */
  sets?: number;
  /** what the camera measures */
  signal?: SignalId;
}

const FRONT_STAND = L('Stand face-on to the phone, the whole body in the picture.', 'Stell dich frontal zum Handy, der ganze Körper im Bild.');
const SIDE_STAND = L('Stand side-on to the phone, the whole body in the picture.', 'Stell dich seitlich zum Handy, der ganze Körper im Bild.');

export const DRILL_COACH: Record<string, DrillCoach> = {
  'mob-ankle-wall': { view: 'side', where: L('Kneel side-on to the phone in front of a wall.', 'Knie dich seitlich zum Handy vor eine Wand.'), sides: true, reps: 10, tempo: 3, signal: 'shin' },
  'mob-toe-touch': { view: 'side', where: SIDE_STAND, reps: 10, tempo: 4, signal: 'reach' },
  'mob-thread-needle': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), sides: true, reps: 8, tempo: 4 },
  'mob-pelvic-turn': { view: 'front', where: L('Golf posture, face-on to the phone, a club across the chest.', 'Golfhaltung frontal zum Handy, ein Schläger quer vor der Brust.'), reps: 10, tempo: 3, sets: 2, signal: 'hipTurn' },
  'mob-cat-camel': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), reps: 10, tempo: 5 },
  'mob-pelvic-tilt': { view: 'floor', where: L('On your back, side-on to the phone, knees bent.', 'Auf den Rücken, seitlich zum Handy, Knie gebeugt.'), reps: 15, tempo: 3 },
  'mob-single-leg-reach': { view: 'front', where: FRONT_STAND, sides: true, reps: 5, tempo: 6 },
  'mob-single-leg-bridge': { view: 'floor', where: L('On your back, side-on to the phone.', 'Auf den Rücken, seitlich zum Handy.'), sides: true, reps: 8, tempo: 4, signal: 'hipExt' },
  'mob-clamshell': { view: 'floor', where: L('On your side, facing the phone, knees bent.', 'Auf die Seite, das Gesicht zum Handy, Knie gebeugt.'), sides: true, reps: 15, tempo: 3, signal: 'kneeOpen' },
  'mob-lat-stretch': { view: 'floor', where: L('Kneel in front of a bench, side-on to the phone.', 'Vor einer Bank knien, seitlich zum Handy.'), hold: 30, sets: 3, signal: 'arms' },
  'mob-wall-angels': { view: 'front', where: L('Back to a wall, face-on to the phone.', 'Mit dem Rücken an eine Wand, frontal zum Handy.'), reps: 10, tempo: 4, sets: 2, signal: 'arms' },
  'mob-9090-stretch': { view: 'front', where: FRONT_STAND, sides: true, hold: 20, sets: 3 },
  'mob-band-er': { view: 'front', where: FRONT_STAND, reps: 15, tempo: 3, sets: 2, signal: 'shoulderEr' },
  'mob-hip-ir': { view: 'floor', where: L('Sit in the 90/90 position, face-on to the phone.', 'Im 90/90-Sitz, frontal zum Handy.'), sides: true, reps: 8, tempo: 4 },
  'mob-prone-y': { view: 'floor', where: L('On your front, side-on to the phone.', 'Auf den Bauch, seitlich zum Handy.'), reps: 10, tempo: 4, sets: 2 },
  'mob-neck-turn': { view: 'front', where: L('Sit or stand face-on to the phone.', 'Setz oder stell dich frontal zum Handy.'), reps: 20, tempo: 3, signal: 'head' },
  'mob-forearm-turn': { view: 'front', where: FRONT_STAND, sides: true, reps: 10, tempo: 3 },
  'mob-wrist-hinge': { view: 'front', where: FRONT_STAND, sides: true, reps: 15, tempo: 2 },
  'mob-wrist-stretch': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), hold: 20, sets: 6 },
  'hip-9090': { view: 'floor', where: L('Sit on the floor face-on to the phone.', 'Setz dich frontal zum Handy auf den Boden.'), reps: 10, tempo: 5, signal: 'sideSwitch' },
  'pallof-press': { view: 'front', where: L('Golf posture, face-on to the phone, the band to the side.', 'Golfhaltung frontal zum Handy, das Band seitlich.'), sides: true, reps: 10, tempo: 3, sets: 2 },
  'single-leg-balance': { view: 'front', where: FRONT_STAND, sides: true, hold: 30, signal: 'oneLeg' },
  'open-books': { view: 'floor', where: L('On your side, facing the phone, knees bent.', 'Auf die Seite, das Gesicht zum Handy, Knie gebeugt.'), sides: true, reps: 10, tempo: 5 },
  'seated-rotation': { view: 'front', where: L('Sit face-on to the phone on a chair.', 'Setz dich frontal zum Handy auf einen Stuhl.'), reps: 20, tempo: 3, signal: 'turn' },
  'deep-squat': { view: 'side', where: SIDE_STAND, reps: 10, tempo: 4, signal: 'squat' },
  'glute-bridge': { view: 'floor', where: L('On your back, side-on to the phone, knees bent.', 'Auf den Rücken, seitlich zum Handy, Knie gebeugt.'), reps: 12, tempo: 4, sets: 2, signal: 'hipExt' },
};

/**
 * Drills that measure what a test measures, the same way (Sascha 18.10.2026: "repeat later to see how the values
 * changed") – their values show on the test page between two screenings. The test counts the weaker side; the drill
 * turns both ways in one set, so its value is the furthest it went.
 */
export const SAME_AS_TEST: Record<string, TestId> = {
  'seated-rotation': 'seated-rotation',
  'mob-pelvic-turn': 'pelvic-rotation',
  'deep-squat': 'deep-squat',
  'mob-toe-touch': 'toe-touch',
  'mob-neck-turn': 'neck',
};

/** A drill not in the table: led by the clock, 10 reps in a slow tempo. */
export const coachOf = (id: string): DrillCoach => DRILL_COACH[id] ?? { view: 'front', where: FRONT_STAND, reps: 10, tempo: 4 };

/** The sets of a drill in order: per side all sets of the left, then all of the right. */
export function setsOf(c: DrillCoach): (Side | null)[] {
  const n = c.sets ?? 1;
  const out: (Side | null)[] = [];
  for (const side of c.sides ? (['left', 'right'] as Side[]) : [null]) for (let i = 0; i < n; i++) out.push(side);
  return out;
}

/** Seconds a drill takes as led (sets × reps × tempo or the holds, plus a breath between the sets). */
export function drillSeconds(c: DrillCoach): number {
  const per = c.hold ?? (c.reps ?? 10) * (c.tempo ?? 4);
  return setsOf(c).length * (per + 8);
}

// ---------- what the camera follows ----------

export interface SignalDef {
  /** the unit of the value */
  unit: '°' | 'cm' | 's';
  /** more is better (a deeper squat, a bigger turn) – or less (the fingers nearer the toes) */
  better: 'up' | 'down';
  /** how far a repetition has to go from the rest position to count */
  minAmp: number;
  /** what the value means, for the result ("turn", "shin angle") */
  name: Text;
  /** the camera only counts (the value itself means nothing to the player) */
  countOnly?: boolean;
}

export const SIGNALS: Record<SignalId, SignalDef> = {
  turn: { unit: '°', better: 'up', minAmp: 12, name: L('turn of the chest', 'Drehung der Brust') },
  hipTurn: { unit: '°', better: 'up', minAmp: 8, name: L('turn of the hips', 'Drehung der Hüfte') },
  head: { unit: '°', better: 'up', minAmp: 15, name: L('head turn', 'Kopfdrehung') },
  squat: { unit: '°', better: 'up', minAmp: 25, name: L('depth of the thighs', 'Tiefe der Oberschenkel') },
  reach: { unit: 'cm', better: 'down', minAmp: 20, name: L('fingertips above the toes', 'Fingerspitzen über den Zehen') },
  shin: { unit: '°', better: 'up', minAmp: 8, name: L('knee over the toes (shin angle)', 'Knie über die Zehen (Schienbeinwinkel)') },
  hipExt: { unit: '°', better: 'up', minAmp: 18, name: L('hip extension', 'Hüftstreckung') },
  arms: { unit: '°', better: 'up', minAmp: 25, name: L('arms overhead', 'Arme über Kopf') },
  oneLeg: { unit: 's', better: 'up', minAmp: 0.5, name: L('time on one leg', 'Zeit auf einem Bein') },
  shoulderEr: { unit: '°', better: 'up', minAmp: 20, name: L('external rotation of the shoulders', 'Außenrotation der Schultern') },
  kneeOpen: { unit: '°', better: 'up', minAmp: 12, name: L('opening of the knees', 'Öffnung der Knie') },
  // the knees from one side to the other: the middle is "out", a side is "rest" – every switch counts
  sideSwitch: { unit: '°', better: 'up', minAmp: 0.5, name: L('switches', 'Wechsel'), countOnly: true },
};

/** The points a signal needs (front view: these; side view: the near side's). */
function needs(id: SignalId): number[] | ((side: Side) => number[]) {
  switch (id) {
    case 'turn':
      return [P.lSh, P.rSh];
    case 'hipTurn':
      return [P.lHip, P.rHip];
    case 'head':
      return [P.nose, P.lSh, P.rSh];
    case 'oneLeg':
      return [P.lHip, P.rHip, P.lAn, P.rAn];
    case 'arms':
      return [P.lSh, P.rSh, P.lEl, P.rEl, P.lHip, P.rHip];
    case 'shoulderEr':
      return [P.lSh, P.rSh, P.lEl, P.rEl, P.lWr, P.rWr];
    case 'kneeOpen':
    case 'sideSwitch':
      return [P.lHip, P.rHip, P.lKn, P.rKn];
    case 'squat':
      return (s) => [S(s).hip, S(s).kn];
    case 'reach':
      return (s) => [S(s).hip, S(s).an, S(s).idx, S(s).toe];
    case 'shin':
      return (s) => [S(s).kn, S(s).an];
    case 'hipExt':
      return (s) => [S(s).sh, S(s).hip, S(s).kn];
  }
}

const deg = (r: number) => (r * 180) / Math.PI;
const CAL = 8;

/**
 * One signal over the frames of a drill. Turns need the face-on width first and the reach the leg length – both come
 * from the first pictures while the player stands still (the countdown).
 */
export class Signal {
  private cal: { w: number; h: number; e: number; n: number; leg: number }[] = [];
  private base = { w: 0, h: 0, e: 0, n: 0, leg: 1 };
  constructor(readonly id: SignalId) {}
  get def(): SignalDef {
    return SIGNALS[this.id];
  }
  get calibrated(): boolean {
    return this.cal.length >= CAL;
  }
  /** a still picture before the drill starts */
  calibrate(f: Frame): void {
    if (this.calibrated) return;
    const s = S(nearSide(f));
    this.cal.push({
      w: width(f, P.lSh, P.rSh),
      h: width(f, P.lHip, P.rHip),
      e: width(f, P.lEar, P.rEar),
      n: this.noseOff(f),
      leg: dist(px(f, s.hip), px(f, s.an)),
    });
    if (this.calibrated) {
      const m = (k: keyof (typeof this.cal)[number]) => median(this.cal.map((c) => c[k]));
      this.base = { w: m('w'), h: m('h'), e: m('e'), n: m('n'), leg: Math.max(1, m('leg')) };
    }
  }
  private noseOff(f: Frame) {
    return (f.lm[P.nose].x - (f.lm[P.lSh].x + f.lm[P.rSh].x) / 2) * f.w;
  }
  /** the points this signal needs that are not in the picture */
  missing(f: Frame): number[] {
    const n = needs(this.id);
    const ix = typeof n === 'function' ? n(nearSide(f)) : n;
    return ix.filter((i) => !inFrame(f, i));
  }
  /** the value in this picture, null when the points are not seen */
  value(f: Frame): number | null {
    if (this.missing(f).length) return null;
    const s = S(nearSide(f));
    switch (this.id) {
      case 'turn':
        return this.calibrated ? turned(width(f, P.lSh, P.rSh), this.base.w) : null;
      case 'hipTurn':
        return this.calibrated ? turned(width(f, P.lHip, P.rHip), this.base.h) : null;
      case 'head': {
        if (!this.calibrated || this.base.e <= 0) return null;
        const off = Math.abs(this.noseOff(f) - this.base.n);
        const bySide = deg(Math.asin(Math.min(1, off / (NOSE_DEPTH * this.base.e))));
        const ears = vis(f, P.lEar) >= 0.5 && vis(f, P.rEar) >= 0.5;
        return ears ? (bySide + turned(width(f, P.lEar, P.rEar), this.base.e)) / 2 : bySide;
      }
      case 'squat': {
        // thigh angle to the horizontal: + = the hip below the knee (y grows downwards)
        const hip = px(f, s.hip);
        const kn = px(f, s.kn);
        return deg(Math.atan2(hip[1] - kn[1], Math.abs(hip[0] - kn[0])));
      }
      case 'reach':
        // + = the fingertips above the toes, in cm (the leg length of the first pictures sets the scale)
        return this.calibrated ? ((px(f, s.toe)[1] - px(f, s.idx)[1]) / this.base.leg) * LEG_CM : null;
      case 'shin': {
        // the front leg (its knee highest above its ankle): how far the shin leans forward from upright
        const lean = (sd: Side) => {
          const k = px(f, S(sd).kn);
          const a = px(f, S(sd).an);
          return { up: a[1] - k[1], deg: deg(Math.atan2(Math.abs(k[0] - a[0]), Math.max(1e-6, a[1] - k[1]))) };
        };
        const both = (['left', 'right'] as Side[]).filter((sd) => inFrame(f, S(sd).kn) && inFrame(f, S(sd).an)).map(lean);
        const front = both.sort((a, b) => b.up - a.up)[0];
        return front && front.up > 0 ? front.deg : null;
      }
      case 'hipExt':
        // shoulder – hip – knee: 180° = a straight line (the hips all the way up)
        return jointAngle(px(f, s.sh), px(f, s.hip), px(f, s.kn));
      case 'arms': {
        // upper arm against the trunk, both arms (front: out to the side and up; side: forward and up)
        const arm = (sh: number, el: number, hip: number) => angleBetween(sub(px(f, hip), px(f, sh)), sub(px(f, el), px(f, sh)));
        return (arm(P.lSh, P.lEl, P.lHip) + arm(P.rSh, P.rEl, P.rHip)) / 2;
      }
      case 'shoulderEr': {
        // elbows at the sides, forearms forward: turned out, the wrist moves sideways from the elbow – the angle from how
        // far, against the forearm length (about 0.9 of the upper arm, the forearm itself points at the camera) – an
        // estimate; REVIEW(golf): Chris, against a goniometer
        const er = (sh: number, el: number, wr: number) => {
          const upper = dist(px(f, sh), px(f, el));
          return upper > 1 ? deg(Math.asin(Math.min(1, Math.abs(px(f, wr)[0] - px(f, el)[0]) / (0.9 * upper)))) : 0;
        };
        return (er(P.lSh, P.lEl, P.lWr) + er(P.rSh, P.rEl, P.rWr)) / 2;
      }
      case 'kneeOpen': {
        // the angle between the thighs from the distance of the knees (thighs of the same length)
        const thigh = (dist(px(f, P.lHip), px(f, P.lKn)) + dist(px(f, P.rHip), px(f, P.rKn))) / 2;
        return thigh > 1 ? deg(2 * Math.asin(Math.min(1, dist(px(f, P.lKn), px(f, P.rKn)) / (2 * thigh)))) : null;
      }
      case 'sideSwitch': {
        // where the knees are against the hips, in hip widths: the middle (0) is "out", a side (±1) the rest
        const hipW = Math.max(1, Math.abs(px(f, P.lHip)[0] - px(f, P.rHip)[0]));
        const off = ((px(f, P.lKn)[0] + px(f, P.rKn)[0]) / 2 - (px(f, P.lHip)[0] + px(f, P.rHip)[0]) / 2) / hipW;
        return -Math.abs(off);
      }
      case 'oneLeg': {
        // one foot clearly higher than the other: 1, both down: 0
        const leg = Math.max(1, (dist(px(f, P.lHip), px(f, P.lAn)) + dist(px(f, P.rHip), px(f, P.rAn))) / 2);
        return Math.abs(px(f, P.lAn)[1] - px(f, P.rAn)[1]) / leg > 0.08 ? 1 : 0;
      }
    }
  }
}

/**
 * Counts repetitions in a signal: out from the rest position by at least the signal's amplitude, and back. The rest
 * position is where the player starts and follows the lowest values (a stiff start does not stop the count). The best
 * value is the furthest a repetition went.
 */
export class RepCounter {
  reps = 0;
  best: number | null = null;
  private rest: number | null = null;
  private start: number[] = [];
  private out = false;
  private peak = 0;
  private recent: number[] = [];
  /** how far the last reps went (from the rest position) */
  private sizes: number[] = [];
  constructor(private def: Pick<SignalDef, 'better' | 'minAmp'>) {}
  /** a new value; true when a repetition was just completed */
  push(v: number | null): boolean {
    if (v == null || !Number.isFinite(v)) return false;
    // a little smoothing: the median of the last three (one wrong point does not count a rep)
    this.recent.push(v);
    if (this.recent.length > 3) this.recent.shift();
    const x = median(this.recent);
    const s = this.def.better === 'up' ? x : -x;
    if (this.rest == null) {
      this.start.push(s);
      if (this.start.length >= 3) this.rest = Math.min(...this.start);
      return false;
    }
    if (!this.out && s < this.rest) this.rest = s;
    const d = s - this.rest;
    // the thresholds follow the reps the player does: out past more than half of a usual rep, back once half of this
    // one is undone – a quick turn through the middle (left – right – left) is seen at 30 pictures a second
    const usual = this.sizes.length ? median(this.sizes) : 0;
    if (!this.out) {
      if (d > Math.max(this.def.minAmp, 0.55 * usual)) {
        this.out = true;
        this.peak = s;
      }
      return false;
    }
    if (s > this.peak) this.peak = s;
    if (d < Math.max(this.def.minAmp * 0.4, 0.4 * (this.peak - this.rest))) {
      this.out = false;
      this.reps++;
      this.sizes.push(this.peak - this.rest);
      if (this.sizes.length > 3) this.sizes.shift();
      const p = this.def.better === 'up' ? this.peak : -this.peak;
      this.best = this.best == null ? p : this.def.better === 'up' ? Math.max(this.best, p) : Math.min(this.best, p);
      return true;
    }
    return false;
  }
  /** where the current repetition is, 0 (rest) … 1 (as far as the best so far) – for the bar on the screen */
  progress(v: number | null): number {
    if (v == null || this.rest == null) return 0;
    const s = this.def.better === 'up' ? v : -v;
    const top = this.best == null ? this.rest + this.def.minAmp * 2 : this.def.better === 'up' ? this.best : -this.best;
    return Math.max(0, Math.min(1, (s - this.rest) / Math.max(1e-6, top - this.rest)));
  }
}

/** The value in words, e.g. "38°", "4 cm above the toes", "24 s". */
export function signalValueText(id: SignalId, v: number | null, tr: (en: string, de: string) => string): string {
  if (v == null) return '–';
  const n = (x: number) => String(x).replace('.', tr('.', ','));
  switch (id) {
    case 'reach': {
      const cm = Math.round(v);
      return cm <= 0 ? tr(`${-cm} cm past the toes`, `${-cm} cm über die Zehen hinaus`) : tr(`${cm} cm above the toes`, `${cm} cm über den Zehen`);
    }
    case 'squat': {
      const d = Math.round(v);
      return d >= 0 ? tr(`thighs ${d}° below parallel`, `Oberschenkel ${d}° unter waagrecht`) : tr(`thighs ${-d}° above parallel`, `Oberschenkel ${-d}° über waagrecht`);
    }
    case 'oneLeg':
      return `${n(Math.round(v))} s`;
    case 'sideSwitch':
      return '';
    default:
      return `${Math.round(v)}°`;
  }
}
