import { golferJoints, type GolferOptions } from './Golfer';
import type { L, Motion, MotionFrame, Shot } from './types';

// The animated figure (Sascha 17.10.2026: "animated videos would be better than still pictures"). The key positions
// are the figure's poses; between them every limb turns around its joint (angle and length interpolated), so arms,
// legs and the club keep their length and the clubhead swings on an arc instead of cutting through the body.

type P = [number, number];
export type Frame = Record<string, P>;

/** limb → the joint it turns around (the parent comes first) */
const PARENT: [string, string][] = [
  ['leadElbow', 'leadShoulder'],
  ['trailElbow', 'trailShoulder'],
  ['hands', 'leadElbow'],
  ['trailHand', 'trailElbow'],
  ['clubHead', 'hands'],
  ['leadKnee', 'leadHip'],
  ['trailKnee', 'trailHip'],
  ['leadAnkle', 'leadKnee'],
  ['trailAnkle', 'trailKnee'],
];

const rot = (p: P, c: P, deg: number): P => {
  const a = (deg * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** The joints of one key position. rock: arms and club turn around the middle between the shoulders (a pendulum). */
export function frameJoints(base: Omit<GolferOptions, 'pose'>, f: MotionFrame): Frame {
  const j = golferJoints({ ...base, ...f.opts, pose: f.pose }) as unknown as Frame;
  if (f.rock && j.leadShoulder && j.trailShoulder) {
    const c: P = [(j.leadShoulder[0] + j.trailShoulder[0]) / 2, (j.leadShoulder[1] + j.trailShoulder[1]) / 2];
    // + towards the target (to the right face-on): the club below the shoulders swings right – counter-clockwise, y up
    // one-handed the trail hand rests on the chest and stays there
    const arms = f.opts?.oneHand || base.oneHand ? ['leadElbow', 'hands', 'clubHead'] : ['leadElbow', 'trailElbow', 'hands', 'trailHand', 'clubHead'];
    for (const k of arms) if (j[k]) j[k] = rot(j[k], c, base.flip ? -f.rock : f.rock);
  }
  return j;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = (u: number) => u * u * (3 - 2 * u);

/** Between two key positions: the trunk and feet move straight, the limbs turn around their joints. */
export function blend(a: Frame, b: Frame, u: number): Frame {
  const out: Frame = {};
  for (const k of Object.keys(a)) if (b[k]) out[k] = [lerp(a[k][0], b[k][0], u), lerp(a[k][1], b[k][1], u)];
  for (const [k, parent] of PARENT) {
    if (!a[k] || !b[k] || !a[parent] || !b[parent] || !out[parent]) continue;
    const va: P = [a[k][0] - a[parent][0], a[k][1] - a[parent][1]];
    const vb: P = [b[k][0] - b[parent][0], b[k][1] - b[parent][1]];
    const aa = Math.atan2(va[1], va[0]);
    let ab = Math.atan2(vb[1], vb[0]);
    // the short way round
    while (ab - aa > Math.PI) ab -= 2 * Math.PI;
    while (ab - aa < -Math.PI) ab += 2 * Math.PI;
    const ang = lerp(aa, ab, u);
    const len = lerp(Math.hypot(...va), Math.hypot(...vb), u);
    out[k] = [out[parent][0] + Math.cos(ang) * len, out[parent][1] + Math.sin(ang) * len];
  }
  return out;
}

export interface Timeline {
  keys: { j: Frame; at: number; hold: number; label?: L; hit?: Shot }[];
  /** seconds for one run through the movement */
  total: number;
}

export function timeline(base: Omit<GolferOptions, 'pose'>, m: Motion): Timeline {
  let at = 0;
  const keys = m.frames.map((f, i) => {
    at += i === 0 ? 0 : f.t;
    const k = { j: frameJoints(base, f), at, hold: f.hold ?? 0, label: f.label, hit: f.hit };
    at += k.hold;
    return k;
  });
  return { keys, total: at };
}

/** The ball after the hit: how long ago and what kind of shot (none before the hit). */
export function hitAt(tl: Timeline, time: number): { shot: Shot; since: number } | null {
  const k = tl.keys.find((x) => x.hit);
  return k && time >= k.at ? { shot: k.hit!, since: time - k.at } : null;
}

/** Where a ball is, in metres from where it lay, a time after the hit: x towards the target, y up. */
export function ballFlight(shot: Shot, s: number): [number, number] {
  const arc = (carry: number, apex: number, dur: number, roll: number, k = 3): [number, number] => {
    if (s < dur) {
      const u = s / dur;
      return [carry * u, apex * 4 * u * (1 - u)];
    }
    return [carry + roll * (1 - Math.exp(-k * (s - dur))), 0];
  };
  switch (shot) {
    case 'putt':
      return [1.8 * (1 - Math.exp(-2.4 * s)), 0];
    case 'chip':
      return arc(1.1, 0.25, 0.45, 1.6);
    case 'punch':
      return arc(5, 0.45, 0.9, 1.5);
    case 'pitch':
      return arc(2.6, 1.0, 0.8, 0.4, 5);
    case 'bunker':
      return arc(2.2, 1.1, 0.85, 0.5, 5);
    case 'full':
      // long and out of the picture towards the target
      return [7 * s, Math.max(0, 3.6 * s - 1.1 * s * s)];
  }
}

/** The figure at a time of the run (seconds), and what is happening then. */
export function at(tl: Timeline, time: number): { j: Frame; label?: L } {
  const { keys } = tl;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (time <= k.at) {
      if (i === 0) return { j: k.j, label: keys[1]?.label };
      const prev = keys[i - 1];
      const start = prev.at + prev.hold;
      const u = Math.min(1, Math.max(0, (time - start) / Math.max(1e-6, k.at - start)));
      return { j: blend(prev.j, k.j, ease(u)), label: k.label };
    }
    // resting in the start position, the first step is already named
    if (time <= k.at + k.hold) return { j: k.j, label: k.label ?? keys[i + 1]?.label };
  }
  const last = keys[keys.length - 1];
  return { j: last.j, label: last.label };
}
