import type { ReactNode } from 'react';

// The golfer of the Training sketches (night run 16./17.10.2026 – Sascha: "the stick figures are not professional and
// do not show the details the text describes"). A body with volume – tapered limbs, torso, cap, glove, shoes whose
// heel can come up – and a real club (iron, wedge, driver, putter). Poses are joint positions in metres (1.75 m tall),
// x to the right, y up, the ground at y = 0. Face-on poses: the player faces you, the target is to the right.
// Down-the-line poses: seen from behind/side, the player faces right (towards the ball).
// Every joint has a name, so a sketch can point a label exactly at it (callout).

export type JointName =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'leadShoulder'
  | 'trailShoulder'
  | 'leadElbow'
  | 'trailElbow'
  | 'hands'
  | 'leadHip'
  | 'trailHip'
  | 'leadKnee'
  | 'trailKnee'
  | 'leadAnkle'
  | 'trailAnkle'
  | 'leadHeel'
  | 'trailHeel'
  | 'leadToe'
  | 'trailToe'
  | 'clubHead';

export type GolferPose =
  // face-on (target right)
  | 'front' // full-swing address with an iron
  | 'chip' // chip address: narrow, weight and hands forward
  | 'putt' // putting address
  | 'frontTop' // top of the backswing
  | 'impact' // impact: hips open, hands ahead
  | 'frontFinish' // finish facing the target, on the trail toe
  | 'halfBack' // 9 o'clock back: lead arm parallel to the ground, shaft up
  | 'halfThrough' // 3 o'clock through: trail arm parallel, shaft up, chest to the target
  | 'takeaway' // 9 o'clock up in the takeaway: hands at hip height, the shaft parallel to the ground
  | 'pump' // downswing: hands at hip height, the butt of the grip points to the ball line
  | 'chipFinish' // the short, held finish of a chip: hands low ahead, clubface up
  // down the line (player faces right)
  | 'address'
  | 'puttSide' // putting address from the side: eyes over the ball, arms hanging, putter nearly upright
  | 'top'
  | 'finish'
  // fitness and body positions
  | 'stand'
  | 'turn'
  | 'bridge'
  | 'sidelying'
  | 'sit'
  | 'squat'
  | 'lunge'
  | 'oneleg'
  | 'floorsit';

export type Club = 'iron' | 'wedge' | 'driver' | 'putter' | 'none';

type P = [number, number];
type Joints = Partial<Record<JointName, P>> & { head: P; neck: P; pelvis: P };

/** Is the pose seen face-on (feet drawn turned out a little) or from the side (feet pointing right)? */
const FACE_ON: GolferPose[] = ['front', 'chip', 'putt', 'frontTop', 'impact', 'frontFinish', 'halfBack', 'halfThrough', 'takeaway', 'pump', 'chipFinish', 'stand', 'turn', 'oneleg', 'squat', 'floorsit'];

// ---------- the poses (metres) ----------
const BASE: Record<string, Joints> = {
  front: {
    head: [-0.04, 1.57],
    neck: [-0.03, 1.43],
    pelvis: [0, 0.92],
    leadShoulder: [0.17, 1.39],
    trailShoulder: [-0.2, 1.36],
    leadElbow: [0.14, 1.12],
    trailElbow: [-0.1, 1.1],
    hands: [0.05, 0.83],
    leadHip: [0.12, 0.92],
    trailHip: [-0.12, 0.92],
    leadKnee: [0.19, 0.49],
    trailKnee: [-0.19, 0.49],
    leadAnkle: [0.21, 0.08],
    trailAnkle: [-0.21, 0.08],
    clubHead: [0.0, 0.035],
  },
  chip: {
    head: [0.03, 1.55],
    neck: [0.03, 1.41],
    pelvis: [0.04, 0.92],
    leadShoulder: [0.2, 1.38],
    trailShoulder: [-0.15, 1.37],
    leadElbow: [0.17, 1.1],
    trailElbow: [-0.04, 1.08],
    hands: [0.1, 0.82],
    leadHip: [0.15, 0.92],
    trailHip: [-0.07, 0.92],
    leadKnee: [0.13, 0.49],
    trailKnee: [-0.1, 0.5],
    leadAnkle: [0.12, 0.08],
    trailAnkle: [-0.12, 0.08],
    clubHead: [-0.02, 0.035],
  },
  putt: {
    head: [0, 1.47],
    neck: [0, 1.35],
    pelvis: [0, 0.9],
    leadShoulder: [0.17, 1.32],
    trailShoulder: [-0.17, 1.32],
    leadElbow: [0.15, 1.05],
    trailElbow: [-0.15, 1.05],
    hands: [0.0, 0.8],
    leadHip: [0.12, 0.9],
    trailHip: [-0.12, 0.9],
    leadKnee: [0.16, 0.48],
    trailKnee: [-0.16, 0.48],
    leadAnkle: [0.17, 0.08],
    trailAnkle: [-0.17, 0.08],
    clubHead: [0.0, 0.03],
  },
  frontTop: {
    head: [-0.06, 1.56],
    neck: [-0.05, 1.42],
    pelvis: [-0.03, 0.92],
    leadShoulder: [0.02, 1.38],
    trailShoulder: [-0.2, 1.42],
    leadElbow: [-0.2, 1.47],
    trailElbow: [-0.38, 1.3],
    hands: [-0.42, 1.6],
    leadHip: [0.08, 0.92],
    trailHip: [-0.14, 0.92],
    leadKnee: [0.1, 0.48],
    trailKnee: [-0.2, 0.49],
    leadAnkle: [0.21, 0.08],
    trailAnkle: [-0.21, 0.08],
    clubHead: [0.45, 1.75],
  },
  impact: {
    head: [-0.07, 1.55],
    neck: [-0.04, 1.42],
    pelvis: [0.06, 0.92],
    leadShoulder: [0.14, 1.4],
    trailShoulder: [-0.21, 1.33],
    leadElbow: [0.13, 1.12],
    trailElbow: [-0.07, 1.08],
    hands: [0.09, 0.84],
    leadHip: [0.18, 0.93],
    trailHip: [-0.05, 0.9],
    leadKnee: [0.22, 0.49],
    trailKnee: [-0.09, 0.47],
    leadAnkle: [0.21, 0.08],
    trailAnkle: [-0.21, 0.08],
    clubHead: [0.0, 0.035],
  },
  halfBack: {
    head: [-0.05, 1.56],
    neck: [-0.04, 1.42],
    pelvis: [-0.02, 0.92],
    leadShoulder: [0.03, 1.39],
    trailShoulder: [-0.2, 1.4],
    leadElbow: [-0.24, 1.33],
    trailElbow: [-0.36, 1.18],
    hands: [-0.52, 1.28],
    leadHip: [0.09, 0.92],
    trailHip: [-0.13, 0.92],
    leadKnee: [0.14, 0.48],
    trailKnee: [-0.2, 0.49],
    leadAnkle: [0.2, 0.08],
    trailAnkle: [-0.2, 0.08],
    clubHead: [-0.58, 2.12],
  },
  halfThrough: {
    head: [0.02, 1.56],
    neck: [0.02, 1.42],
    pelvis: [0.06, 0.93],
    leadShoulder: [0.2, 1.4],
    trailShoulder: [-0.02, 1.38],
    leadElbow: [0.36, 1.2],
    trailElbow: [0.26, 1.33],
    hands: [0.52, 1.28],
    leadHip: [0.16, 0.93],
    trailHip: [-0.04, 0.92],
    leadKnee: [0.2, 0.49],
    trailKnee: [-0.1, 0.48],
    leadAnkle: [0.2, 0.08],
    trailAnkle: [-0.2, 0.08],
    clubHead: [0.58, 2.12],
  },
  takeaway: {
    head: [-0.04, 1.56],
    neck: [-0.03, 1.42],
    pelvis: [-0.01, 0.92],
    leadShoulder: [0.09, 1.39],
    trailShoulder: [-0.19, 1.38],
    leadElbow: [-0.05, 1.13],
    trailElbow: [-0.24, 1.09],
    hands: [-0.32, 0.99],
    leadHip: [0.11, 0.92],
    trailHip: [-0.12, 0.92],
    leadKnee: [0.17, 0.48],
    trailKnee: [-0.18, 0.49],
    leadAnkle: [0.2, 0.08],
    trailAnkle: [-0.2, 0.08],
    clubHead: [-1.15, 1.02],
  },
  pump: {
    head: [-0.06, 1.56],
    neck: [-0.04, 1.42],
    pelvis: [0.02, 0.92],
    leadShoulder: [0.1, 1.39],
    trailShoulder: [-0.2, 1.36],
    leadElbow: [-0.08, 1.14],
    trailElbow: [-0.22, 1.1],
    hands: [-0.3, 0.98],
    leadHip: [0.14, 0.92],
    trailHip: [-0.1, 0.92],
    leadKnee: [0.2, 0.49],
    trailKnee: [-0.16, 0.48],
    leadAnkle: [0.21, 0.08],
    trailAnkle: [-0.21, 0.08],
    clubHead: [-0.52, 1.84],
  },
  chipFinish: {
    head: [0.04, 1.55],
    neck: [0.04, 1.41],
    pelvis: [0.06, 0.92],
    leadShoulder: [0.21, 1.38],
    trailShoulder: [-0.12, 1.36],
    leadElbow: [0.24, 1.12],
    trailElbow: [0.04, 1.08],
    hands: [0.27, 0.88],
    leadHip: [0.17, 0.92],
    trailHip: [-0.05, 0.92],
    leadKnee: [0.14, 0.49],
    trailKnee: [-0.07, 0.49],
    leadAnkle: [0.12, 0.08],
    trailAnkle: [-0.12, 0.08],
    clubHead: [0.62, 0.42],
  },
  // 90/90 on the floor, face-on: the front knee out to the lead side, its shin across in front; the back knee out to
  // the trail side, its shin pointing back; sitting tall, the arms forward (no hands on the floor)
  floorsit: {
    head: [0.0, 0.98],
    neck: [0.0, 0.85],
    pelvis: [0.0, 0.16],
    leadShoulder: [0.17, 0.82],
    trailShoulder: [-0.17, 0.82],
    leadElbow: [0.3, 0.68],
    trailElbow: [-0.3, 0.68],
    hands: [0.42, 0.78],
    trailHand: [-0.42, 0.78],
    leadHip: [0.1, 0.16],
    trailHip: [-0.1, 0.16],
    leadKnee: [0.42, 0.3],
    trailKnee: [-0.46, 0.1],
    leadAnkle: [0.62, 0.08],
    trailAnkle: [-0.64, 0.08],
  } as Joints,
  squat: {
    head: [0.02, 1.08],
    neck: [0.0, 0.95],
    pelvis: [-0.03, 0.46],
    leadShoulder: [0.17, 0.93],
    trailShoulder: [-0.17, 0.93],
    leadElbow: [0.2, 1.2],
    trailElbow: [-0.2, 1.2],
    hands: [0.2, 1.48],
    trailHand: [-0.2, 1.48],
    leadHip: [0.13, 0.46],
    trailHip: [-0.13, 0.46],
    leadKnee: [0.3, 0.42],
    trailKnee: [-0.3, 0.42],
    leadAnkle: [0.2, 0.08],
    trailAnkle: [-0.2, 0.08],
  } as Joints,
  frontFinish: {
    head: [0.1, 1.57],
    neck: [0.07, 1.44],
    pelvis: [0.12, 0.94],
    leadShoulder: [0.2, 1.42],
    trailShoulder: [-0.02, 1.42],
    leadElbow: [0.02, 1.55],
    trailElbow: [0.22, 1.5],
    hands: [-0.06, 1.66],
    leadHip: [0.18, 0.94],
    trailHip: [0.04, 0.93],
    leadKnee: [0.2, 0.5],
    trailKnee: [0.06, 0.5],
    leadAnkle: [0.21, 0.08],
    trailAnkle: [-0.13, 0.13],
    clubHead: [-0.62, 1.42],
  },
  address: {
    head: [0.31, 1.41],
    neck: [0.22, 1.32],
    pelvis: [-0.1, 0.88],
    leadShoulder: [0.24, 1.29],
    trailShoulder: [0.2, 1.29],
    leadElbow: [0.31, 1.05],
    trailElbow: [0.27, 1.04],
    hands: [0.35, 0.8],
    leadHip: [-0.09, 0.88],
    trailHip: [-0.11, 0.88],
    leadKnee: [0.09, 0.47],
    trailKnee: [0.07, 0.47],
    leadAnkle: [0.0, 0.08],
    trailAnkle: [-0.02, 0.08],
    clubHead: [0.68, 0.035],
  },
  puttSide: {
    head: [0.3, 1.4],
    neck: [0.2, 1.31],
    pelvis: [-0.09, 0.89],
    leadShoulder: [0.22, 1.28],
    trailShoulder: [0.18, 1.28],
    leadElbow: [0.24, 1.04],
    trailElbow: [0.2, 1.03],
    hands: [0.28, 0.84],
    leadHip: [-0.08, 0.89],
    trailHip: [-0.1, 0.89],
    leadKnee: [0.07, 0.48],
    trailKnee: [0.05, 0.48],
    leadAnkle: [0.0, 0.08],
    trailAnkle: [-0.02, 0.08],
    clubHead: [0.36, 0.03],
  },
  top: {
    head: [0.27, 1.43],
    neck: [0.18, 1.34],
    pelvis: [-0.12, 0.9],
    leadShoulder: [0.24, 1.3],
    trailShoulder: [0.1, 1.36],
    leadElbow: [0.12, 1.42],
    trailElbow: [-0.08, 1.33],
    hands: [-0.06, 1.62],
    leadHip: [-0.08, 0.9],
    trailHip: [-0.14, 0.9],
    leadKnee: [0.1, 0.48],
    trailKnee: [0.07, 0.47],
    leadAnkle: [0.0, 0.08],
    trailAnkle: [-0.02, 0.08],
    clubHead: [0.42, 1.8],
  },
  finish: {
    head: [0.06, 1.58],
    neck: [0.03, 1.45],
    pelvis: [0.02, 0.94],
    leadShoulder: [0.08, 1.42],
    trailShoulder: [-0.04, 1.42],
    leadElbow: [-0.1, 1.55],
    trailElbow: [-0.02, 1.62],
    hands: [-0.16, 1.68],
    leadHip: [0.04, 0.94],
    trailHip: [-0.02, 0.93],
    leadKnee: [0.05, 0.5],
    trailKnee: [0.02, 0.5],
    leadAnkle: [0.03, 0.08],
    trailAnkle: [-0.14, 0.13],
    clubHead: [-0.62, 1.4],
  },
};

// fitness poses: the joint tables of the first sketches (body units, 10 = 1.75 m) –
// [head, neck, hip, knee1, foot1, knee2, foot2, elbow1, hand1, elbow2, hand2]
type J = [number, number];
const OLD: Partial<Record<GolferPose, J[]>> = {
  stand: [[0, 9.2], [0, 8.3], [0, 4.8], [0.2, 2.4], [0.1, 0], [-0.2, 2.4], [-0.3, 0], [0.4, 6.6], [0.5, 5], [-0.4, 6.6], [-0.5, 5]],
  turn: [[0, 9.2], [0, 8.3], [0, 4.8], [0.6, 2.4], [0.8, 0], [-0.6, 2.4], [-0.8, 0], [1.6, 8.2], [2.8, 8.2], [-1.6, 8.2], [-2.8, 8.2]],
  bridge: [[-4.6, 0.6], [-3.8, 0.5], [0, 2.2], [2.2, 3.2], [3.0, 0], [2.0, 3.0], [2.8, 0], [-2.4, 0.2], [-1.2, 0.1], [-2.4, 0.15], [-1.2, 0.05]],
  sidelying: [[-4.6, 0.8], [-3.8, 0.6], [0, 0.6], [1.6, 2.2], [3.2, 2.2], [1.7, 1.6], [3.3, 1.6], [-2.2, 2.6], [-1.0, 4.4], [-2.6, 0.6], [-1.0, 0.8]],
  sit: [[0, 9.2], [0, 8.3], [0, 4.6], [2.4, 4.6], [2.4, 0], [2.2, 4.4], [2.2, 0], [1.6, 7.6], [2.6, 7.6], [-1.6, 7.6], [-2.6, 7.6]],
  lunge: [[0, 8.8], [0, 7.9], [0, 4.4], [2.0, 2.6], [2.0, 0], [-1.2, 1.4], [-2.6, 0.2], [0.8, 6.4], [1.6, 5.6], [-0.8, 6.4], [0.2, 5.6]],
  oneleg: [[0, 9.2], [0, 8.3], [0, 4.8], [0.2, 2.4], [0.1, 0], [1.4, 3.6], [0.6, 2.4], [1.2, 7.6], [2.2, 7.8], [-1.2, 7.6], [-2.2, 7.8]],
};
const fromOld = (t: J[]): Joints => {
  const m = (j: J): P => [j[0] * 0.175, j[1] * 0.175];
  const [hd, nk, hp, k1, f1, k2, f2, e1, h1, e2, h2] = t.map(m);
  return {
    head: hd,
    neck: nk,
    pelvis: hp,
    leadShoulder: [nk[0] + 0.06, nk[1] - 0.02],
    trailShoulder: [nk[0] - 0.06, nk[1] - 0.02],
    leadElbow: e1,
    trailElbow: e2,
    hands: h1,
    trailHand: h2,
    leadHip: hp,
    trailHip: hp,
    leadKnee: k1,
    trailKnee: k2,
    leadAnkle: [f1[0], f1[1] + 0.08],
    trailAnkle: [f2[0], f2[1] + 0.08],
  } as Joints;
};

const DEFAULT_CLUB: Partial<Record<GolferPose, Club>> = { front: 'iron', chip: 'wedge', putt: 'putter', frontTop: 'iron', impact: 'iron', frontFinish: 'iron', halfBack: 'wedge', halfThrough: 'wedge', takeaway: 'iron', pump: 'iron', chipFinish: 'wedge', address: 'iron', puttSide: 'putter', top: 'iron', finish: 'iron' };

export interface GolferOptions {
  pose: GolferPose;
  club?: Club;
  /** this heel comes up (on the toe) */
  heelUp?: 'lead' | 'trail';
  /** the whole body leans this many metres towards the target (+) or away (−) at the hips (weight shift) */
  shift?: number;
  flip?: boolean;
  /** feet together, narrow or wide (face-on) */
  stance?: 'together' | 'narrow' | 'wide';
  /** only the lead hand on the club – the trail hand rests on the chest */
  oneHand?: boolean;
  /** an alignment stick held with the grip, pointing up past the lead hip */
  gripStick?: boolean;
  /** a towel under both arms across the chest */
  towel?: boolean;
  /** a club along the spine (head, upper back, tailbone) */
  spineClub?: boolean;
  /** a club across the chest, arms crossed over it */
  crossClub?: boolean;
  /** lower hips and more knee flex (stay down) */
  crouch?: boolean;
  /** the typical fault: the wrists flip, the hands fall behind the clubhead, the shaft leans away from the target */
  scoop?: boolean;
  /** standing up through the shot (early extension): face-on the body rises, the club comes up off the ground; from the
   *  side the hips move towards the ball and the back gets upright */
  standUp?: boolean;
  /** own joint positions (metres) over the pose – for positions the poses do not have (mobility screen, 17.10.2026) */
  joints?: Partial<Record<JointName | 'trailHand', P>>;
  /** draw face-on (true) or from the side (false) – default from the pose */
  faceOn?: boolean;
}

/** The joints of a pose in metres (with the options applied), and the feet. */
export function golferJoints(o: GolferOptions): Record<JointName, P> & { trailHand?: P } {
  const old = OLD[o.pose];
  const j: Record<string, P> = { ...(old ? fromOld(old) : BASE[o.pose] ?? BASE.front), ...(o.joints as Record<string, P> | undefined) };
  const club = o.club ?? DEFAULT_CLUB[o.pose] ?? 'none';
  // the driver is longer and the ball sits further forward; the putter shorter
  if (j.clubHead && j.hands && club === 'driver') j.clubHead = [j.clubHead[0] + (FACE_ON.includes(o.pose) ? 0.14 : 0.22), j.clubHead[1]];
  // weight shift: everything above the knees moves, a little more at the top
  if (o.shift) {
    for (const k of ['head', 'neck', 'pelvis', 'leadShoulder', 'trailShoulder', 'leadElbow', 'trailElbow', 'hands', 'leadHip', 'trailHip', 'trailHand']) if (j[k]) j[k] = [j[k][0] + o.shift * (k === 'pelvis' || k.endsWith('Hip') ? 1 : 0.7), j[k][1]];
    for (const k of ['leadKnee', 'trailKnee']) if (j[k]) j[k] = [j[k][0] + o.shift * 0.4, j[k][1]];
  }
  const face = o.faceOn ?? FACE_ON.includes(o.pose);
  // stance width (face-on): move ankles, knees and hips together or apart
  if (o.stance && FACE_ON.includes(o.pose)) {
    const w = o.stance === 'together' ? 0.055 : o.stance === 'narrow' ? 0.12 : 0.3;
    const cx = j.pelvis[0];
    const set = (key: string, x: number) => j[key] && (j[key] = [x, j[key][1]]);
    set('leadAnkle', cx + w);
    set('trailAnkle', cx - w);
    set('leadKnee', cx + w * 0.92);
    set('trailKnee', cx - w * 0.92);
    set('leadHip', cx + Math.min(0.12, w + 0.04));
    set('trailHip', cx - Math.min(0.12, w + 0.04));
  }
  if (o.crouch) {
    for (const k of ['head', 'neck', 'pelvis', 'leadShoulder', 'trailShoulder', 'leadElbow', 'trailElbow', 'hands', 'leadHip', 'trailHip', 'clubHeadNo']) if (j[k]) j[k] = [j[k][0], j[k][1] - 0.07];
    for (const k of ['leadKnee', 'trailKnee']) if (j[k]) j[k] = [j[k][0] + 0.05, j[k][1] - 0.02];
  }
  if (o.scoop && j.hands && j.clubHead) {
    j.hands = [j.clubHead[0] - 0.2, j.hands[1] + 0.03];
    for (const k of ['leadElbow', 'trailElbow']) if (j[k]) j[k] = [j[k][0] - 0.1, j[k][1]];
  }
  if (o.standUp) {
    const lift = (k: string, dx: number, dy: number) => j[k] && (j[k] = [j[k][0] + dx, j[k][1] + dy]);
    if (face) {
      for (const k of ['head', 'neck', 'pelvis', 'leadShoulder', 'trailShoulder', 'leadElbow', 'trailElbow', 'hands', 'trailHand', 'leadHip', 'trailHip']) lift(k, 0, 0.07);
      for (const k of ['leadKnee', 'trailKnee']) lift(k, 0, 0.03);
      lift('clubHead', 0, 0.09);
    } else {
      for (const k of ['pelvis', 'leadHip', 'trailHip']) lift(k, 0.09, 0.04);
      for (const k of ['leadKnee', 'trailKnee']) lift(k, 0.05, 0.02);
      lift('head', -0.07, 0.1);
      lift('neck', -0.06, 0.09);
      for (const k of ['leadShoulder', 'trailShoulder']) lift(k, -0.05, 0.08);
      for (const k of ['leadElbow', 'trailElbow']) lift(k, -0.02, 0.07);
      lift('hands', 0, 0.06);
      lift('clubHead', 0, 0.06);
    }
  }
  if (o.oneHand) {
    // the trail hand rests on the chest
    j.trailElbow = [j.trailShoulder![0] - 0.04, j.trailShoulder![1] - 0.22];
    j.trailHand = [j.neck[0] + 0.02, j.neck[1] - 0.14];
  }
  // feet: face-on turned out a little (lead to the right, trail to the left); from the side pointing right
  const foot = (side: 'lead' | 'trail') => {
    const a = j[side + 'Ankle'];
    if (!a) return;
    const dir = face ? (side === 'lead' ? 1 : -1) : 1;
    // own heel and toe points (lying, kneeling, a foot in the air) stay as given
    const own = o.joints?.[(side + 'Heel') as JointName] && o.joints?.[(side + 'Toe') as JointName];
    if (own) return;
    const len = face ? 0.17 : 0.24;
    let heel: P = [a[0] - dir * len * 0.3, 0.02];
    let toe: P = [a[0] + dir * len * 0.7, 0.02];
    const up = o.heelUp === side || (side === 'trail' && (o.pose === 'frontFinish' || o.pose === 'finish'));
    if (up) {
      // on the toe: the heel rises, the ankle with it, the knee bends towards the target
      toe = [a[0] + dir * len * 0.45, 0.02];
      heel = [toe[0] - dir * len * 0.55, 0.16];
      j[side + 'Ankle'] = [toe[0] - dir * len * 0.35, 0.17];
      const kn = j[side + 'Knee'];
      if (kn) j[side + 'Knee'] = [kn[0] + 0.05, kn[1] + 0.02];
    }
    j[side + 'Heel'] = heel;
    j[side + 'Toe'] = toe;
  };
  foot('lead');
  foot('trail');
  if (club === 'none') delete j.clubHead;
  if (o.flip) for (const k of Object.keys(j)) j[k] = [-j[k][0], j[k][1]];
  return j as Record<JointName, P>;
}

// ---------- drawing ----------
const C = {
  skin: '#d9ad86',
  shirt: '#3f5f73',
  shirtFar: '#344f60',
  trousers: '#25313a',
  trousersFar: '#1d272e',
  shoe: '#f2f4f3',
  sole: '#7d8790',
  cap: '#79a128',
  glove: '#ffffff',
  grip: '#1c2328',
  shaft: '#aab4bb',
  head: '#5c6870',
  outline: '#16212a',
};

/** A limb: a tapered capsule from a (radius ra) to b (radius rb). */
function capsule(a: P, b: P, ra: number, rb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len;
  const ny = dx / len;
  const f = (n: number) => n.toFixed(2);
  const p1 = [a[0] + nx * ra, a[1] + ny * ra];
  const p2 = [b[0] + nx * rb, b[1] + ny * rb];
  const p3 = [b[0] - nx * rb, b[1] - ny * rb];
  const p4 = [a[0] - nx * ra, a[1] - ny * ra];
  // the side quad plus the two round ends (drawn as full circles – robust whatever the direction)
  const circle = (c: P, rr: number) => `M${f(c[0] - rr)},${f(c[1])} a${f(rr)},${f(rr)} 0 1 0 ${f(rr * 2)},0 a${f(rr)},${f(rr)} 0 1 0 ${f(-rr * 2)},0 Z`;
  return `M${f(p1[0])},${f(p1[1])} L${f(p2[0])},${f(p2[1])} L${f(p3[0])},${f(p3[1])} L${f(p4[0])},${f(p4[1])} Z ${circle(a, ra)} ${circle(b, rb)}`;
}

export function Golfer(props: { x: number; y: number; k: number; tilt?: number } & GolferOptions) {
  const j = golferJoints(props);
  const k = props.k;
  // metres → px around the figure's foot point (y up → svg y down)
  const q = (p: P): P => [p[0] * k, -p[1] * k];
  const r = (m: number) => Math.max(1.2, m * k);
  const face = props.faceOn ?? FACE_ON.includes(props.pose);
  const club = props.club ?? DEFAULT_CLUB[props.pose] ?? 'none';
  const limb = (a?: P, b?: P, ra = 0.05, rb = 0.04, fill = C.shirt, key?: string): ReactNode => {
    if (!a || !b) return null;
    const pa = q(a);
    const pb = q(b);
    return <path key={key} d={capsule(pa, pb, r(ra), r(rb))} fill={fill} fillRule="nonzero" />;
  };
  const shoe = (side: 'lead' | 'trail') => {
    const h = j[(side + 'Heel') as JointName];
    const t = j[(side + 'Toe') as JointName];
    if (!h || !t) return null;
    const ph = q(h);
    const pt = q(t);
    return (
      <g key={'shoe-' + side}>
        <path d={capsule(ph, pt, r(0.045), r(0.04))} fill={C.sole} />
        <path d={capsule([ph[0], ph[1] - r(0.01)], [pt[0], pt[1] - r(0.01)], r(0.036), r(0.032))} fill={C.shoe} />
      </g>
    );
  };
  const hand = j.hands;
  const trailHand = (j as { trailHand?: P }).trailHand ?? hand;
  // the club: grip, shaft, head
  const clubPart = () => {
    if (club === 'none' || !j.clubHead || !hand) return null;
    const ph = q(hand);
    const pc = q(j.clubHead);
    const dx = pc[0] - ph[0];
    const dy = pc[1] - ph[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const gripEnd: P = [ph[0] + ux * r(0.24), ph[1] + uy * r(0.24)];
    const butt: P = [ph[0] - ux * r(0.05), ph[1] - uy * r(0.05)];
    // the head: perpendicular to the shaft at its end, toe pointing away from the player
    const toeDir = face ? 1 : 1;
    const hx = pc[0];
    const hy = pc[1];
    const headShape =
      club === 'driver' ? (
        <ellipse cx={hx + toeDir * r(0.05)} cy={hy - r(0.02)} rx={r(0.065)} ry={r(0.04)} fill={C.head} stroke={C.outline} strokeWidth={0.8} />
      ) : club === 'putter' ? (
        <rect x={hx - r(0.02)} y={hy - r(0.03)} width={r(0.1)} height={r(0.035)} rx={r(0.008)} fill={C.head} stroke={C.outline} strokeWidth={0.8} />
      ) : (
        <path d={`M${hx},${hy - r(0.035)} L${hx + r(0.075)},${hy - r(0.02)} L${hx + r(0.07)},${hy + r(0.012)} L${hx - r(0.005)},${hy + r(0.012)} Z`} fill={C.head} stroke={C.outline} strokeWidth={0.8} />
      );
    return (
      <g key="club">
        <line x1={gripEnd[0]} y1={gripEnd[1]} x2={pc[0]} y2={pc[1]} stroke={C.shaft} strokeWidth={Math.max(1.3, k * 0.012)} strokeLinecap="round" />
        <line x1={butt[0]} y1={butt[1]} x2={gripEnd[0]} y2={gripEnd[1]} stroke={C.grip} strokeWidth={Math.max(2.2, k * 0.022)} strokeLinecap="round" />
        {headShape}
      </g>
    );
  };
  const head = q(j.head);
  const neck = q(j.neck);
  const hr = r(0.105);
  // the cap: a crown on the head and the visor towards where the player looks
  const look = face ? 0 : 1;
  const tilt = props.tilt ?? 0;
  return (
    <g transform={`translate(${props.x},${props.y}) rotate(${-tilt})`}>
      {/* far side first: trail leg (face-on the trail leg is on the left), then lead leg */}
      {limb(j.trailHip, j.trailKnee, 0.075, 0.055, face ? C.trousers : C.trousersFar, 'tt')}
      {limb(j.trailKnee, j.trailAnkle, 0.055, 0.04, face ? C.trousers : C.trousersFar, 'ts')}
      {shoe('trail')}
      {limb(j.leadHip, j.leadKnee, 0.075, 0.055, C.trousers, 'lt')}
      {limb(j.leadKnee, j.leadAnkle, 0.055, 0.04, C.trousers, 'ls')}
      {shoe('lead')}
      {/* pelvis and torso */}
      {limb(j.trailHip, j.leadHip, 0.085, 0.085, C.trousers, 'pel')}
      {limb(j.pelvis, j.neck, face ? 0.13 : 0.11, face ? 0.15 : 0.1, C.shirt, 'torso')}
      {face && limb(j.trailShoulder, j.leadShoulder, 0.06, 0.06, C.shirt, 'sh')}
      {/* trail arm behind the lead arm */}
      {limb(j.trailShoulder, j.trailElbow, 0.045, 0.038, face ? C.shirt : C.shirtFar, 'tu')}
      {limb(j.trailElbow, trailHand, 0.035, 0.028, C.skin, 'tf')}
      {props.gripStick && hand && j.clubHead && (() => {
        // the stick continues the shaft above the hands, past the lead hip
        const ph = q(hand);
        const pc = q(j.clubHead);
        const len = Math.hypot(pc[0] - ph[0], pc[1] - ph[1]) || 1;
        const ux = (ph[0] - pc[0]) / len;
        const uy = (ph[1] - pc[1]) / len;
        return <line x1={ph[0]} y1={ph[1]} x2={ph[0] + ux * r(0.85)} y2={ph[1] + uy * r(0.85)} stroke="#ff9d2e" strokeWidth={Math.max(1.6, k * 0.014)} strokeLinecap="round" />;
      })()}
      {props.towel && <path d={capsule(q([j.trailShoulder![0] - 0.06, j.trailShoulder![1] - 0.1]), q([j.leadShoulder![0] + 0.06, j.leadShoulder![1] - 0.1]), r(0.045), r(0.045))} fill="#ffffff" />}
      {clubPart()}
      {limb(j.leadShoulder, j.leadElbow, 0.045, 0.038, C.shirt, 'lu')}
      {limb(j.leadElbow, hand, 0.035, 0.028, C.skin, 'lf')}
      {hand && <circle cx={q(hand)[0]} cy={q(hand)[1]} r={r(0.04)} fill={club !== 'none' ? C.glove : C.skin} stroke={C.outline} strokeWidth={0.7} />}
      {/* neck and head with the cap */}
      {limb(j.neck, [j.neck[0] + (j.head[0] - j.neck[0]) * 0.4, j.neck[1] + (j.head[1] - j.neck[1]) * 0.4], 0.04, 0.04, C.skin, 'nk')}
      <circle cx={head[0]} cy={head[1]} r={hr} fill={C.skin} stroke={C.outline} strokeWidth={0.8} />
      <path d={`M${head[0] - hr},${head[1] - hr * 0.15} A${hr},${hr} 0 0 1 ${head[0] + hr},${head[1] - hr * 0.15} Z`} fill={C.cap} stroke={C.outline} strokeWidth={0.8} />
      {look ? (
        <path d={`M${head[0] + hr * 0.6},${head[1] - hr * 0.2} L${head[0] + hr * 1.55},${head[1] - hr * 0.05} L${head[0] + hr * 0.7},${head[1] + hr * 0.05} Z`} fill={C.cap} stroke={C.outline} strokeWidth={0.7} />
      ) : (
        <ellipse cx={head[0]} cy={head[1] - hr * 0.12} rx={hr * 1.05} ry={hr * 0.22} fill={C.cap} stroke={C.outline} strokeWidth={0.7} />
      )}
      {props.spineClub && (() => {
        // along the back: from behind the head down past the upper back to the tailbone
        const back = face ? 0 : -0.07;
        const top = q([j.head[0] + back - 0.05, j.head[1] + 0.12]);
        const bottom = q([j.pelvis[0] + back - 0.06, j.pelvis[1] - 0.12]);
        return <line x1={top[0]} y1={top[1]} x2={bottom[0]} y2={bottom[1]} stroke={C.shaft} strokeWidth={Math.max(1.6, k * 0.014)} strokeLinecap="round" />;
      })()}
      {props.crossClub && (() => {
        const a = q([j.trailShoulder![0] - 0.25, j.trailShoulder![1] - 0.05]);
        const b = q([j.leadShoulder![0] + 0.25, j.leadShoulder![1] - 0.05]);
        return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.shaft} strokeWidth={Math.max(1.6, k * 0.014)} strokeLinecap="round" />;
      })()}
      {/* neck point kept for callouts */}
      <circle cx={neck[0]} cy={neck[1]} r={0} />
    </g>
  );
}
