import { L, type L as Text } from '../training/types';
import { LEG_CM, NOSE_DEPTH, P, S, angleBetween, dist, inFrame, jointAngle, median, nearSide, px, sub, turned, vis, width, type Frame } from './measure';
import type { Side, TestId } from './types';

// The drills of the mobility pillar as a guided session (Sascha 18.10.2026: "not a knowledge base like Training – an
// app that leads a person through exercises and analyses and measures the mobility meanwhile"). For every drill: how
// the app leads it (reps in a tempo or holds, per side or not, how to stand to the phone) and – where the camera can
// see it reliably – what it measures while the player does it. Pure functions over the body points, like measure.ts,
// so the unit tests run them with synthetic bodies. REVIEW(golf): Chris (reps, holds, what counts as a rep).

/** What the camera follows during a drill, picture by picture. */
export type SignalId = 'turn' | 'hipTurn' | 'head' | 'squat' | 'reach' | 'shin' | 'hipExt' | 'arms' | 'oneLeg' | 'shoulderEr' | 'kneeOpen' | 'sideSwitch' | 'armLift' | 'armOpen' | 'catCow' | 'kneeLift';

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
  /** a drill the camera does not measure but watches for its main fault (a cue like a coach) */
  watch?: WatchId;
}

const FRONT_STAND = L('Stand face-on to the phone, the whole body in the picture.', 'Stell dich frontal zum Handy, der ganze Körper im Bild.');
const SIDE_STAND = L('Stand side-on to the phone, the whole body in the picture.', 'Stell dich seitlich zum Handy, der ganze Körper im Bild.');

export const DRILL_COACH: Record<string, DrillCoach> = {
  'mob-ankle-wall': { view: 'side', where: L('Kneel side-on to the phone in front of a wall.', 'Knie dich seitlich zum Handy vor eine Wand.'), sides: true, reps: 10, tempo: 3, signal: 'shin' },
  'mob-toe-touch': { view: 'side', where: SIDE_STAND, reps: 10, tempo: 4, signal: 'reach' },
  'mob-thread-needle': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), sides: true, reps: 8, tempo: 4, signal: 'armOpen' },
  'mob-pelvic-turn': { view: 'front', where: L('Golf posture, face-on to the phone, a club across the chest.', 'Golfhaltung frontal zum Handy, ein Schläger quer vor der Brust.'), reps: 10, tempo: 3, sets: 2, signal: 'hipTurn' },
  'mob-cat-camel': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), reps: 10, tempo: 5, signal: 'catCow' },
  'mob-pelvic-tilt': { view: 'floor', where: L('On your back, side-on to the phone, knees bent.', 'Auf den Rücken, seitlich zum Handy, Knie gebeugt.'), reps: 15, tempo: 3 },
  'mob-single-leg-reach': { view: 'front', where: FRONT_STAND, sides: true, reps: 5, tempo: 6, watch: 'footUp' },
  'mob-single-leg-bridge': { view: 'floor', where: L('On your back, side-on to the phone.', 'Auf den Rücken, seitlich zum Handy.'), sides: true, reps: 8, tempo: 4, signal: 'hipExt' },
  'mob-clamshell': { view: 'floor', where: L('On your side, facing the phone, knees bent.', 'Auf die Seite, das Gesicht zum Handy, Knie gebeugt.'), sides: true, reps: 15, tempo: 3, signal: 'kneeOpen' },
  'mob-lat-stretch': { view: 'floor', where: L('Kneel in front of a bench, side-on to the phone.', 'Vor einer Bank knien, seitlich zum Handy.'), hold: 30, sets: 3, signal: 'arms' },
  'mob-wall-angels': { view: 'front', where: L('Back to a wall, face-on to the phone.', 'Mit dem Rücken an eine Wand, frontal zum Handy.'), reps: 10, tempo: 4, sets: 2, signal: 'arms' },
  'mob-9090-stretch': { view: 'front', where: FRONT_STAND, sides: true, hold: 20, sets: 3, watch: 'elbowHigh' },
  'mob-band-er': { view: 'front', where: FRONT_STAND, reps: 15, tempo: 3, sets: 2, signal: 'shoulderEr' },
  'mob-hip-ir': { view: 'floor', where: L('Sit in the 90/90 position, face-on to the phone.', 'Im 90/90-Sitz, frontal zum Handy.'), sides: true, reps: 8, tempo: 4, signal: 'kneeLift' },
  'mob-prone-y': { view: 'floor', where: L('On your front, side-on to the phone.', 'Auf den Bauch, seitlich zum Handy.'), reps: 10, tempo: 4, sets: 2, signal: 'armLift' },
  'mob-neck-turn': { view: 'front', where: L('Sit or stand face-on to the phone.', 'Setz oder stell dich frontal zum Handy.'), reps: 20, tempo: 3, signal: 'head' },
  'mob-forearm-turn': { view: 'front', where: FRONT_STAND, sides: true, reps: 10, tempo: 3, watch: 'elbowsIn' },
  'mob-wrist-hinge': { view: 'front', where: FRONT_STAND, sides: true, reps: 15, tempo: 2 },
  'mob-wrist-stretch': { view: 'floor', where: L('On hands and knees, side-on to the phone.', 'In den Vierfüßlerstand, seitlich zum Handy.'), hold: 20, sets: 6 },
  'hip-9090': { view: 'floor', where: L('Sit on the floor face-on to the phone.', 'Setz dich frontal zum Handy auf den Boden.'), reps: 10, tempo: 5, signal: 'sideSwitch' },
  'pallof-press': { view: 'front', where: L('Golf posture, face-on to the phone, the band to the side.', 'Golfhaltung frontal zum Handy, das Band seitlich.'), sides: true, reps: 10, tempo: 3, sets: 2, watch: 'trunkStill' },
  'single-leg-balance': { view: 'front', where: FRONT_STAND, sides: true, hold: 30, signal: 'oneLeg' },
  'open-books': { view: 'floor', where: L('On your side, facing the phone, knees bent.', 'Auf die Seite, das Gesicht zum Handy, Knie gebeugt.'), sides: true, reps: 10, tempo: 5, watch: 'kneesTogether' },
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

/**
 * The drill a little harder once it sits (a coach's progression): every two clean sessions in a row – all reps or the
 * whole hold, no cue – 2 reps or 10 s more, at most three steps. REVIEW(golf): Chris.
 */
export function progressed(c: DrillCoach, clean: number): DrillCoach {
  const step = progressStep(clean);
  if (!step) return c;
  return { ...c, ...(c.hold != null ? { hold: c.hold + 10 * step } : { reps: (c.reps ?? 10) + 2 * step }) };
}
export const progressStep = (clean: number): number => Math.min(3, Math.floor(clean / 2));

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
  armLift: { unit: '°', better: 'up', minAmp: 6, name: L('arms off the floor', 'Arme vom Boden') },
  armOpen: { unit: '°', better: 'up', minAmp: 40, name: L('arm open towards the ceiling', 'Arm zur Decke geöffnet') },
  // cat and cow: the camera sees no spine, only the head going down and up with it – counted, not measured
  catCow: { unit: '°', better: 'up', minAmp: 20, name: L('cat and cow', 'Katze und Kuh'), countOnly: true },
  // the back knee off the floor in the 90/90 sit (in hundredths of the thigh, from the still pictures) – counted, not measured
  kneeLift: { unit: '°', better: 'up', minAmp: 12, name: L('knee lifts', 'Knie heben'), countOnly: true },
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
    case 'kneeLift':
      return [P.lHip, P.rHip, P.lKn, P.rKn];
    case 'armLift':
      return (s) => [S(s).sh, S(s).wr, S(s).hip];
    case 'armOpen':
      return (s) => [S(s).sh, S(s).wr];
    case 'catCow':
      return (s) => [S(s).sh, S(s).hip, s === 'left' ? P.lEar : P.rEar];
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
  private cal: { w: number; h: number; e: number; n: number; leg: number; al: number; ar: number; kl: number; kr: number; th: number }[] = [];
  private base = { w: 0, h: 0, e: 0, n: 0, leg: 1, al: 1, ar: 1, kl: 0, kr: 0, th: 1 };
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
      // the arms straight down (on hands and knees): their length in the picture
      al: dist(px(f, P.lSh), px(f, P.lWr)),
      ar: dist(px(f, P.rSh), px(f, P.rWr)),
      // the knees on the floor (the 90/90 sit): their height and the length of the thighs
      kl: px(f, P.lKn)[1],
      kr: px(f, P.rKn)[1],
      th: (dist(px(f, P.lHip), px(f, P.lKn)) + dist(px(f, P.rHip), px(f, P.rKn))) / 2,
    });
    if (this.calibrated) {
      const m = (k: keyof (typeof this.cal)[number]) => median(this.cal.map((c) => c[k]));
      this.base = { w: m('w'), h: m('h'), e: m('e'), n: m('n'), leg: Math.max(1, m('leg')), al: Math.max(1, m('al')), ar: Math.max(1, m('ar')), kl: m('kl'), kr: m('kr'), th: Math.max(1, m('th')) };
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
      case 'kneeLift':
        // the knee that comes furthest off the floor, against where it was in the still pictures
        return this.calibrated ? (Math.max(this.base.kl - px(f, P.lKn)[1], this.base.kr - px(f, P.rKn)[1]) / this.base.th) * 100 : null;
      case 'catCow': {
        // on hands and knees: the head against the line of the back, + = up (cow), − = down between the arms (cat)
        const ear = nearSide(f) === 'left' ? P.lEar : P.rEar;
        const back = sub(px(f, s.sh), px(f, s.hip));
        const head = sub(px(f, ear), px(f, s.sh));
        const fwd = back[0] >= 0 ? 1 : -1;
        const up = (v: number[]) => deg(Math.atan2(-v[1], v[0] * fwd));
        return up(head) - up(back);
      }
      case 'armLift':
        // lying on the front, arms overhead: how far the arm rises off the line of the trunk
        return angleBetween(sub(px(f, s.sh), px(f, s.hip)), sub(px(f, s.wr), px(f, s.sh)));
      case 'armOpen': {
        // on hands and knees: the arm from straight down (0°) towards the ceiling (180°). Side-on the camera sees the
        // opening only as how high the hand gets – the angle from that height against the arm length of the still
        // pictures (arms straight down); the arm that opens furthest counts
        if (!this.calibrated) return null;
        const open = (sd: Side) => {
          if (!inFrame(f, S(sd).sh) || !inFrame(f, S(sd).wr)) return -1;
          const len = sd === 'left' ? this.base.al : this.base.ar;
          const down = (px(f, S(sd).wr)[1] - px(f, S(sd).sh)[1]) / len;
          return deg(Math.acos(Math.max(-1, Math.min(1, down))));
        };
        const v = Math.max(open('left'), open('right'));
        return v < 0 ? null : v;
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

/** values that say what they are ("thighs 12° above parallel", "4 cm above the toes") – shown without the name */
export const SELF_NAMED: SignalId[] = ['squat', 'reach'];

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
    case 'catCow':
    case 'kneeLift':
      return '';
    default:
      return `${Math.round(v)}°`;
  }
}

/** "11 degrees further than last time" – the clear gains only (3° or 1 cm/s at least), else null; `by` > 0 is better */
export function gainSpeech(sig: SignalId, by: number, tr: (en: string, de: string) => string): string | null {
  const u = SIGNALS[sig].unit;
  // (the time on one leg is no distance: not "further")
  if (SIGNALS[sig].countOnly || sig === 'oneLeg' || by < (u === '°' ? 3 : 1)) return null;
  const n = Math.round(by);
  const unit = u === '°' ? tr('degrees', 'Grad') : u === 'cm' ? tr('centimetres', 'Zentimeter') : tr(n === 1 ? 'second' : 'seconds', n === 1 ? 'Sekunde' : 'Sekunden');
  return tr(`${n} ${unit} further than last time`, `${n} ${unit} weiter als beim letzten Mal`);
}

// ---------- form cues: what a coach would say while the player does the drill ----------

/** A fault the camera can see during a drill – said once (at most one cue every 6 s) and counted for the result. */
export type FormCue = 'hipsStill' | 'chestStill' | 'shouldersStill' | 'heelsDown' | 'armsUp' | 'heelDown' | 'kneesStraight' | 'elbowsIn' | 'trunkStill' | 'footUp' | 'kneesTogether' | 'hipsOverKnees' | 'elbowHigh';
/** what the camera watches in a drill it does not measure */
export type WatchId = 'trunkStill' | 'footUp' | 'elbowsIn' | 'kneesTogether' | 'elbowHigh';
/** what the camera watches in such a drill, for the list before the session ("the camera watches: …") */
export const WATCH_FOCUS: Record<WatchId, { en: string; de: string }> = {
  trunkStill: L('a still trunk', 'den ruhigen Rumpf'),
  footUp: L('the free foot', 'den freien Fuß'),
  elbowsIn: L('the elbows at the body', 'die Ellbogen am Körper'),
  kneesTogether: L('the knees together', 'die Knie zusammen'),
  elbowHigh: L('the elbow at shoulder height', 'den Ellbogen auf Schulterhöhe'),
};

export const CUES: Record<FormCue, Text> = {
  hipsStill: L('Keep the hips still – only the chest turns.', 'Die Hüfte bleibt ruhig – nur die Brust dreht.'),
  chestStill: L('Keep the chest still – only the hips turn.', 'Die Brust bleibt ruhig – nur die Hüfte dreht.'),
  shouldersStill: L('Keep the shoulders still – only the head turns.', 'Die Schultern bleiben ruhig – nur der Kopf dreht.'),
  heelsDown: L('Heels on the floor.', 'Fersen am Boden lassen.'),
  armsUp: L('Arms up, in line with the body.', 'Arme nach oben, in Linie mit dem Körper.'),
  heelDown: L('The front heel stays down.', 'Die vordere Ferse bleibt unten.'),
  kneesStraight: L('Keep the knees straight.', 'Knie gestreckt lassen.'),
  elbowsIn: L('Elbows on the body.', 'Ellbogen am Körper.'),
  trunkStill: L('Keep the trunk still – do not turn with the band.', 'Der Rumpf bleibt ruhig – nicht mitdrehen.'),
  footUp: L('Keep the free foot off the floor.', 'Den freien Fuß in der Luft lassen.'),
  kneesTogether: L('Keep the knees together.', 'Die Knie bleiben zusammen.'),
  elbowHigh: L('Keep the elbow at shoulder height.', 'Den Ellbogen auf Schulterhöhe halten.'),
  hipsOverKnees: L('Keep the hips over the knees.', 'Die Hüfte bleibt über den Knien.'),
};
/** the short form for the result, e.g. "2 × heels up" */
export const CUE_SHORT: Record<FormCue, Text> = {
  hipsStill: L('hips turned along', 'Hüfte drehte mit'),
  chestStill: L('chest turned along', 'Brust drehte mit'),
  shouldersStill: L('shoulders turned along', 'Schultern drehten mit'),
  heelsDown: L('heels up', 'Fersen hoch'),
  armsUp: L('arms forward', 'Arme nach vorn'),
  heelDown: L('heel up', 'Ferse hoch'),
  kneesStraight: L('knees bent', 'Knie gebeugt'),
  elbowsIn: L('elbows off the body', 'Ellbogen vom Körper weg'),
  trunkStill: L('trunk turned along', 'Rumpf drehte mit'),
  footUp: L('foot down', 'Fuß abgesetzt'),
  kneesTogether: L('knees apart', 'Knie auseinander'),
  elbowHigh: L('elbow dropped', 'Ellbogen gesunken'),
  hipsOverKnees: L('sat back', 'nach hinten gesetzt'),
};

/**
 * Watches the form while the player does a drill. It needs the still pictures before the drill (widths face-on, the
 * heels flat) and then says a cue when a fault lasts 0.4 s – at most one cue every 6 s, so the player is not talked
 * over. The thresholds follow the screen's limits (heels 0.2 of the foot, arms 30° off the trunk). REVIEW(golf): Chris.
 */
export class FormCheck {
  private cal: { w: number; h: number; hy: [number, number]; ft: [number, number] }[] = [];
  private base = { w: 0, h: 0, hy: [0, 0] as [number, number], ft: [1, 1] as [number, number] };
  private since: Partial<Record<FormCue, number>> = {};
  /** the first picture of the set */
  private t0: number | undefined;
  /** when each fault was last seen */
  private seenAt: Partial<Record<FormCue, number>> = {};
  private lastSaid = -1e9;
  /** how often each cue was said */
  counts: Partial<Record<FormCue, number>> = {};
  constructor(readonly signal: SignalId | WatchId) {}
  get calibrated(): boolean {
    return this.cal.length >= CAL;
  }
  calibrate(f: Frame): void {
    if (this.calibrated) return;
    const sides = [S('left'), S('right')];
    this.cal.push({
      w: width(f, P.lSh, P.rSh),
      h: width(f, P.lHip, P.rHip),
      hy: [px(f, sides[0].heel)[1], px(f, sides[1].heel)[1]],
      ft: [dist(px(f, sides[0].heel), px(f, sides[0].toe)), dist(px(f, sides[1].heel), px(f, sides[1].toe))],
    });
    if (this.calibrated) {
      const m = (g: (c: (typeof this.cal)[number]) => number) => median(this.cal.map(g));
      this.base = { w: m((c) => c.w), h: m((c) => c.h), hy: [m((c) => c.hy[0]), m((c) => c.hy[1])], ft: [Math.max(1, m((c) => c.ft[0])), Math.max(1, m((c) => c.ft[1]))] };
    }
  }
  /** the faults in this picture (value: the drill's signal now) */
  faults(f: Frame, value: number | null): FormCue[] {
    // a watched drill has no value of its own; a measured one is checked while the camera sees its movement
    const watched = this.signal === 'trunkStill' || this.signal === 'footUp' || this.signal === 'elbowsIn' || this.signal === 'kneesTogether' || this.signal === 'elbowHigh';
    if (!this.calibrated || (value == null && !watched)) return [];
    const v = value ?? 0;
    const seen = (...ix: number[]) => ix.every((i) => inFrame(f, i));
    const out: FormCue[] = [];
    switch (this.signal) {
      case 'turn':
        if (v > 25 && seen(P.lHip, P.rHip) && this.base.h > 0 && turned(width(f, P.lHip, P.rHip), this.base.h) > 15) out.push('hipsStill');
        break;
      case 'hipTurn':
        if (v > 12 && seen(P.lSh, P.rSh) && this.base.w > 0 && turned(width(f, P.lSh, P.rSh), this.base.w) > Math.max(15, v * 0.6)) out.push('chestStill');
        break;
      case 'head':
        if (v > 30 && seen(P.lSh, P.rSh) && this.base.w > 0 && turned(width(f, P.lSh, P.rSh), this.base.w) > 15) out.push('shouldersStill');
        break;
      case 'squat': {
        // on the way down (the thighs at least 50° from upright)
        if (v < -50) break;
        const side = nearSide(f);
        const s = S(side);
        const i = side === 'left' ? 0 : 1;
        if (seen(s.heel) && (this.base.hy[i] - px(f, s.heel)[1]) / this.base.ft[i] > 0.2) out.push('heelsDown');
        if (seen(s.sh, s.hip, s.wr) && angleBetween(sub(px(f, s.sh), px(f, s.hip)), sub(px(f, s.wr), px(f, s.sh))) > 35) out.push('armsUp');
        break;
      }
      case 'shin': {
        if (v < 10) break;
        // the front leg: its knee highest above its ankle
        const legs = (['left', 'right'] as Side[]).filter((sd) => seen(S(sd).kn, S(sd).an, S(sd).heel, S(sd).toe));
        const front = legs.sort((a, b) => px(f, S(b).an)[1] - px(f, S(b).kn)[1] - (px(f, S(a).an)[1] - px(f, S(a).kn)[1]))[0];
        if (!front) break;
        const s = S(front);
        const foot = dist(px(f, s.heel), px(f, s.toe));
        if (foot > 1 && (px(f, s.toe)[1] - px(f, s.heel)[1]) / foot > 0.2) out.push('heelDown');
        break;
      }
      case 'reach': {
        const s = S(nearSide(f));
        // reaching down (the fingers below the knee) with bent knees
        if (seen(s.hip, s.kn, s.an, s.idx) && px(f, s.idx)[1] > px(f, s.kn)[1] && jointAngle(px(f, s.hip), px(f, s.kn), px(f, s.an)) < 155) out.push('kneesStraight');
        break;
      }
      case 'trunkStill':
        // Pallof press: the band pulls to the side, the shoulders stay square to the phone
        if (seen(P.lSh, P.rSh) && this.base.w > 0 && turned(width(f, P.lSh, P.rSh), this.base.w) > 15) out.push('trunkStill');
        break;
      case 'footUp': {
        // single-leg reach: both feet on the floor (the ankles level) is the free foot down – after the first 3 s of the
        // set (the player lifts the foot after "Go")
        this.t0 ??= f.t;
        if (f.t - this.t0 < 3000 || !seen(P.lHip, P.rHip, P.lAn, P.rAn)) break;
        const leg = Math.max(1, (dist(px(f, P.lHip), px(f, P.lAn)) + dist(px(f, P.rHip), px(f, P.rAn))) / 2);
        if (Math.abs(px(f, P.lAn)[1] - px(f, P.rAn)[1]) / leg < 0.04) out.push('footUp');
        break;
      }
      case 'elbowHigh': {
        // the 90/90 shoulder stretch: the stretched arm (the hand higher up) keeps the upper arm at shoulder height – more
        // than 20° below it is the fault (after the first 2 s of the set, while the player gets into it)
        this.t0 ??= f.t;
        if (f.t - this.t0 < 2000 || !seen(P.lSh, P.rSh, P.lEl, P.rEl, P.lWr, P.rWr)) break;
        const sd = px(f, P.lWr)[1] < px(f, P.rWr)[1] ? S('left') : S('right');
        const up = sub(px(f, sd.el), px(f, sd.sh));
        if (deg(Math.atan2(up[1], Math.abs(up[0]))) > 20) out.push('elbowHigh');
        break;
      }
      case 'kneesTogether': {
        // open books, lying on the side facing the phone: the knees stay on each other (the thighs less than 20° apart)
        if (!seen(P.lHip, P.rHip, P.lKn, P.rKn)) break;
        const thigh = (dist(px(f, P.lHip), px(f, P.lKn)) + dist(px(f, P.rHip), px(f, P.rKn))) / 2;
        if (thigh > 1 && dist(px(f, P.lKn), px(f, P.rKn)) / thigh > 2 * Math.sin((20 * Math.PI) / 180)) out.push('kneesTogether');
        break;
      }
      case 'armOpen': {
        // thread the needle on hands and knees: the hips stay over the knees (sitting back towards the heels is the fault)
        const s = S(nearSide(f));
        if (!seen(s.hip, s.kn)) break;
        const thigh = dist(px(f, s.hip), px(f, s.kn));
        if (thigh > 1 && Math.abs(px(f, s.hip)[0] - px(f, s.kn)[0]) / thigh > 0.45) out.push('hipsOverKnees');
        break;
      }
      case 'elbowsIn':
      case 'shoulderEr': {
        const away = (sh: number, el: number) => Math.abs(px(f, el)[0] - px(f, sh)[0]) > 0.4 * dist(px(f, sh), px(f, el));
        if (seen(P.lSh, P.rSh, P.lEl, P.rEl) && (away(P.lSh, P.lEl) || away(P.rSh, P.rEl))) out.push('elbowsIn');
        break;
      }
    }
    return out;
  }
  /** a cue to say now: a fault held 0.4 s, at most one cue every 6 s */
  push(f: Frame, value: number | null): FormCue | null {
    const now = f.t;
    const fs = this.faults(f, value);
    for (const c of Object.keys(CUES) as FormCue[]) {
      if (fs.includes(c)) this.since[c] ??= now;
      else delete this.since[c];
    }
    for (const c of fs) this.seenAt[c] = now;
    if (now - this.lastSaid < 6000) return null;
    // of the faults held long enough, the one said least so far; a fault seen in the last 3 s that was said less is
    // waited for a little (2.5 s) – two faults take turns instead of the first one every time
    const due = fs.filter((c) => now - (this.since[c] ?? now) >= 400).sort((a, b) => (this.counts[a] ?? 0) - (this.counts[b] ?? 0));
    const c = due[0];
    if (!c) return null;
    const recent = (Object.keys(this.seenAt) as FormCue[]).filter((x) => now - (this.seenAt[x] ?? -1e9) < 3000);
    const least = Math.min(...recent.map((x) => this.counts[x] ?? 0));
    if ((this.counts[c] ?? 0) > least && now - this.lastSaid < 6000 + 2500) return null;
    this.lastSaid = now;
    this.counts[c] = (this.counts[c] ?? 0) + 1;
    return c;
  }
}
