import type { Frame, Lm } from './measure';
import type { MetricKind, Side } from './types';

// Synthetic players for the tests and the QA run (no camera, no person): a body of 1.75 m that does a test with a
// chosen result – a trunk that turns 50°, a squat that stops 10° above parallel, a balance that ends after 12 s.
// Front view: the player faces the camera (raw camera picture, the player's left is on the right of the picture).
// Side view: the player faces right, the left side is towards the camera.

export const SYNTH_W = 720;
export const SYNTH_H = 1280;
const K = 576; // px per metre (2 m = 90 % of the height)

type J3 = [number, number, number]; // x = player's left, y = up, z = towards the camera
type J2 = [number, number]; // side view: x = forward (right in the picture), y = up

const frontPoint = (p: J3): Lm => ({ x: 0.5 + (p[0] * K) / SYNTH_W, y: 0.95 - (p[1] * K) / SYNTH_H, z: -p[2], v: 1 });
const sidePoint = (p: J2, v = 1, k = K, x0 = 0.3): Lm => ({ x: x0 + (p[0] * k) / SYNTH_W, y: 0.95 - (p[1] * k) / SYNTH_H, z: 0, v });

/** turn a point about the vertical axis through (0, 0, 0) – + = to the player's left */
const yaw = (p: J3, deg: number): J3 => {
  const r = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(r) + p[2] * Math.sin(r), p[1], -p[0] * Math.sin(r) + p[2] * Math.cos(r)];
};

export interface FrontPose {
  trunk?: number; // shoulders and head turn (°)
  pelvis?: number; // hips turn (°)
  head?: number; // head on top of the trunk (°)
  lift?: Side | null; // this foot is in the air (balance)
  liftX?: number; // the standing foot slides sideways (m)
  er?: number; // both elbows at the sides bent 90°, forearms forward, turned out this far (°) – band external rotation
  kneeOpen?: number; // the right knee opens away from the left (°, clamshell seen from the front)
  kneeShift?: number; // both knees shift sideways (m, the 90/90 switch)
}

/** The 33 points of a player seen from the front. */
export function frontBody(o: FrontPose): Lm[] {
  const t = o.trunk ?? 0;
  const pv = o.pelvis ?? 0;
  const h = t + (o.head ?? 0);
  const lm: J3[] = new Array(33).fill([0, 1, 0]);
  const both = (l: number, r: number, p: J3, turn: number) => {
    lm[l] = yaw(p, turn);
    lm[r] = yaw([-p[0], p[1], p[2]], turn);
  };
  lm[0] = yaw([0, 1.62, 0.116], h); // nose: 0.8 ear widths in front of the axis
  both(1, 4, [0.02, 1.66, 0.09], h);
  both(2, 5, [0.035, 1.66, 0.085], h);
  both(3, 6, [0.05, 1.66, 0.07], h);
  both(7, 8, [0.0725, 1.63, 0], h);
  both(9, 10, [0.025, 1.57, 0.095], h);
  both(11, 12, [0.19, 1.43, 0], t);
  both(13, 14, [0.22, 1.16, 0], t);
  both(15, 16, [0.24, 0.9, 0.02], t);
  both(17, 18, [0.25, 0.83, 0.02], t);
  both(19, 20, [0.25, 0.82, 0.04], t);
  both(21, 22, [0.23, 0.84, 0.05], t);
  both(23, 24, [0.1, 0.93, 0], pv);
  both(25, 26, [0.1, 0.5, 0.02], 0);
  both(27, 28, [0.1, 0.08, 0], 0);
  both(29, 30, [0.1, 0.03, -0.05], 0);
  both(31, 32, [0.11, 0.02, 0.15], 0);
  if (o.lift) {
    // the lifted leg: knee forward and up, the foot off the ground
    const [kn, an, he, to] = o.lift === 'left' ? [25, 27, 29, 31] : [26, 28, 30, 32];
    const x = lm[an][0];
    lm[kn] = [x, 0.72, 0.3];
    lm[an] = [x, 0.42, 0.15];
    lm[he] = [x, 0.38, 0.1];
    lm[to] = [x, 0.38, 0.3];
  }
  if (o.er != null) {
    // elbows by the sides, forearms pointing at the camera, turned out (the wrist moves sideways)
    const a = (o.er * Math.PI) / 180;
    for (const sg of [1, -1]) {
      const [el, wr, ...hand] = sg === 1 ? [13, 15, 17, 19, 21] : [14, 16, 18, 20, 22];
      lm[el] = [sg * 0.2, 1.16, 0];
      // forearm 0.9 of the upper arm (0.27 m), as a person
      lm[wr] = [sg * (0.2 + 0.243 * Math.sin(a)), 1.16, 0.243 * Math.cos(a)];
      for (const i of hand) lm[i] = [sg * (0.2 + 0.29 * Math.sin(a)), 1.15, 0.29 * Math.cos(a)];
    }
  }
  if (o.kneeOpen) {
    const k = 0.43 * Math.sin((o.kneeOpen * Math.PI) / 180);
    lm[26] = [lm[26][0] - k, lm[26][1], lm[26][2]];
  }
  if (o.kneeShift) for (const i of [25, 26]) lm[i] = [lm[i][0] + o.kneeShift, lm[i][1], lm[i][2]];
  if (o.liftX) {
    const [an, he, to] = o.lift === 'left' ? [28, 30, 32] : [27, 29, 31];
    for (const i of [an, he, to]) lm[i] = [lm[i][0] + o.liftX, lm[i][1], lm[i][2]];
  }
  return lm.map(frontPoint);
}

/** A side view from named points (near = left side; the far side drawn 2 cm behind with less visibility). */
function sideBody(p: Record<string, J2>, far?: Record<string, J2>, k = K, x0 = 0.3): Lm[] {
  const lm: Lm[] = new Array(33).fill(null).map(() => sidePoint([0, 1], 0.3, k, x0));
  const set = (l: number, r: number, key: string) => {
    lm[l] = sidePoint(p[key], 0.95, k, x0);
    lm[r] = sidePoint(far?.[key] ?? [p[key][0] - 0.02, p[key][1]], 0.7, k, x0);
  };
  lm[0] = sidePoint(p.nose, 0.95, k, x0);
  set(7, 8, 'ear');
  set(9, 10, 'mouth');
  set(11, 12, 'sh');
  set(13, 14, 'el');
  set(15, 16, 'wr');
  set(19, 20, 'idx');
  set(23, 24, 'hip');
  set(25, 26, 'kn');
  set(27, 28, 'an');
  set(29, 30, 'heel');
  set(31, 32, 'toe');
  return lm;
}

const lerp = (a: J2, b: J2, k: number): J2 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const add = (a: J2, d: J2, s = 1): J2 => [a[0] + d[0] * s, a[1] + d[1] * s];
const dirDeg = (deg: number): J2 => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)]; // 0° = up, + = forward

/** Overhead deep squat at k (0 standing … 1 bottom): `depth` thigh angle at the bottom (+ = below parallel). */
export function squatBody(k: number, depth: number, heelLift = 0, armDev = 0): Lm[] {
  const stand: Record<string, J2> = { an: [0, 0.08], heel: [-0.06, 0.03], toe: [0.17, 0.02], kn: [0.02, 0.5], hip: [-0.02, 0.92], sh: [0, 1.43], el: [0.01, 1.72], wr: [0.02, 2.0], idx: [0.02, 2.07], ear: [0, 1.63], nose: [0.1, 1.62], mouth: [0.09, 1.57] };
  const kn: J2 = [0.25, 0.44];
  const r = (depth * Math.PI) / 180;
  const hip: J2 = [kn[0] - 0.43 * Math.cos(r), kn[1] - 0.43 * Math.sin(r)];
  const trunk = 36; // parallel to the shin
  const sh = add(hip, dirDeg(trunk), 0.52);
  const arm = dirDeg(trunk + armDev);
  const bottom: Record<string, J2> = {
    an: [0, 0.08],
    heel: [-0.06, 0.03 + heelLift * 0.23],
    toe: [0.17, 0.02],
    kn,
    hip,
    sh,
    el: add(sh, arm, 0.3),
    wr: add(sh, arm, 0.58),
    idx: add(sh, arm, 0.65),
    ear: add(sh, dirDeg(trunk), 0.2),
    nose: add(add(sh, dirDeg(trunk), 0.19), [0.1, 0]),
    mouth: add(add(sh, dirDeg(trunk), 0.14), [0.09, 0]),
  };
  const p: Record<string, J2> = {};
  for (const key of Object.keys(stand)) p[key] = lerp(stand[key], bottom[key], k);
  return sideBody(p);
}

/** Toe touch at k (0 standing … 1 bent): fingertips `gap` m above the toes at the bottom, knees bent by `kneeBend`°. */
export function toeTouchBody(k: number, gap: number, kneeBend = 0): Lm[] {
  const stand: Record<string, J2> = { an: [0, 0.08], heel: [-0.06, 0.03], toe: [0.17, 0.02], kn: [0.01, 0.5], hip: [-0.01, 0.92], sh: [0, 1.43], el: [0.02, 1.15], wr: [0.03, 0.88], idx: [0.03, 0.8], ear: [0, 1.63], nose: [0.1, 1.62], mouth: [0.09, 1.57] };
  const knee: J2 = [-0.04 + Math.sin((kneeBend * Math.PI) / 180) * 0.21, 0.49 - (1 - Math.cos((kneeBend * Math.PI) / 180)) * 0.21];
  const fingerY = 0.02 + gap;
  const bottom: Record<string, J2> = { an: [0, 0.08], heel: [-0.06, 0.03], toe: [0.17, 0.02], kn: knee, hip: [-0.08, 0.9], sh: [0.22, 0.5], el: [0.21, 0.3], wr: [0.2, fingerY + 0.08], idx: [0.2, fingerY], ear: [0.3, 0.4], nose: [0.33, 0.33], mouth: [0.3, 0.33] };
  const p: Record<string, J2> = {};
  for (const key of Object.keys(stand)) p[key] = lerp(stand[key], bottom[key], k);
  return sideBody(p);
}

/** Lat test in a wall sit: straight arms raised to `flex`° (0 = down, 90 = forward, 180 = up along the wall). */
export function latBody(flex: number, elbowBend = 0): Lm[] {
  const sh: J2 = [0, 1.0];
  const arm = dirDeg(180 - flex);
  const el = add(sh, arm, 0.3);
  const fore = dirDeg(180 - flex - elbowBend);
  const wr = add(el, fore, 0.27);
  return sideBody({ sh, el, wr, idx: add(wr, fore, 0.08), hip: [0, 0.5], kn: [0.45, 0.48], an: [0.45, 0.08], heel: [0.4, 0.03], toe: [0.62, 0.02], ear: [0, 1.2], nose: [0.1, 1.19], mouth: [0.09, 1.14] });
}

/** 90/90 in golf posture: the forearm turned back `turn`° from pointing at the ground (90 = parallel to the spine). */
export function shoulderBody(turn: number): Lm[] {
  const hip: J2 = [0, 0.9];
  const u: J2 = [0.58, 0.81]; // spine direction
  const sh = add(hip, u, 0.52);
  const el: J2 = [sh[0] + 0.02, sh[1] - 0.02];
  const r = (turn * Math.PI) / 180;
  const start: J2 = [0.81, -0.58]; // at right angles to the spine, forward-down
  const dir: J2 = [start[0] * Math.cos(r) + u[0] * Math.sin(r), start[1] * Math.cos(r) + u[1] * Math.sin(r)];
  const wr = add(el, dir, 0.27);
  return sideBody({ hip, sh, el, wr, idx: add(wr, dir, 0.08), kn: [0.12, 0.48], an: [0.02, 0.08], heel: [-0.04, 0.03], toe: [0.19, 0.02], ear: add(sh, u, 0.2), nose: add(add(sh, u, 0.18), [0.1, -0.03]), mouth: add(add(sh, u, 0.13), [0.08, -0.03]) });
}

/** Bridge with the `ext` leg out: the hips sag `sag` m below the line; extended = the leg is up. */
export function bridgeBody(ext: Side, extended: boolean, sag: number, up = true): Lm[] {
  const sh: J2 = [0, 0.1];
  const hip: J2 = up ? [0.5, 0.38 - sag] : [0.45, 0.1];
  const supKn: J2 = [0.9, 0.5];
  const supAn: J2 = [1.0, 0.08];
  const dir: J2 = [supKn[0] - hip[0], supKn[1] - hip[1]];
  const n = Math.hypot(dir[0], dir[1]);
  const u: J2 = [dir[0] / n, dir[1] / n];
  const extKn = extended ? add(hip, u, 0.43) : [supKn[0] - 0.02, supKn[1]] as J2;
  const extAn = extended ? add(extKn, u, 0.42) : [supAn[0] - 0.02, supAn[1]] as J2;
  const base = { sh, hip, el: [0.2, 0.05] as J2, wr: [0.4, 0.04] as J2, idx: [0.47, 0.04] as J2, ear: [-0.18, 0.12] as J2, nose: [-0.2, 0.2] as J2, mouth: [-0.16, 0.19] as J2 };
  const sup = { kn: supKn, an: supAn, heel: [supAn[0] - 0.05, 0.03] as J2, toe: [supAn[0] + 0.15, 0.02] as J2 };
  const ex = { kn: extKn, an: extAn, heel: add(extAn, [-0.03, -0.04]), toe: add(extAn, [0.05, 0.12]) };
  // the near (left) side gets the leg the test names
  const near = ext === 'left' ? { ...base, ...ex } : { ...base, ...sup };
  const far = ext === 'left' ? { ...base, ...sup } : { ...base, ...ex };
  // lying down the player is long: the phone further away (smaller) so head and feet are in the picture
  return sideBody(near, far, 400, 0.22);
}

/** A scripted test: the frames of a player doing it with the given result. */
export interface Script {
  ms: number;
  at: (t: number) => Lm[];
}

const ramp = (t: number, t0: number, t1: number) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));

/** The value a synthetic player reaches in each test – 'good' passes everything, 'stiff' fails most. */
export type SynthLevel = 'good' | 'stiff';

export function script(kind: MetricKind, side: Side, level: SynthLevel): Script {
  const good = level === 'good';
  switch (kind) {
    case 'trunkRotation': {
      const a = good ? 52 : 32;
      const sgn = side === 'left' ? 1 : -1;
      return { ms: 7000, at: (t) => frontBody({ trunk: sgn * a * (ramp(t, 1000, 3000) - ramp(t, 4500, 6000)) }) };
    }
    case 'pelvicRotation': {
      const a = good ? 38 : 18;
      return { ms: 11000, at: (t) => frontBody({ pelvis: a * Math.sin((t - 800) / 900) * ramp(t, 800, 1500), trunk: good ? 3 : 12 * Math.sin((t - 800) / 900) * ramp(t, 800, 1500) }) };
    }
    case 'lowerQuarter': {
      const a = good ? 64 : 48;
      return { ms: 13000, at: (t) => frontBody({ pelvis: a * Math.sin((t - 800) / 1000) * ramp(t, 800, 1600), trunk: a * Math.sin((t - 800) / 1000) * ramp(t, 800, 1600), lift: side === 'left' ? 'right' : 'left' }) };
    }
    case 'neck': {
      const a = good ? 76 : 52;
      const sgn = side === 'left' ? 1 : -1;
      return { ms: 7000, at: (t) => frontBody({ head: sgn * a * (ramp(t, 1000, 2800) - ramp(t, 4500, 6000)) }) };
    }
    case 'balance': {
      const lift: Side = side === 'left' ? 'right' : 'left';
      const downAt = good ? 99999 : 1000 + 500 + 1500 + 12000;
      return { ms: good ? 26000 : 17000, at: (t) => frontBody({ lift: t > 1000 && t < downAt ? lift : null }) };
    }
    case 'squat':
      return { ms: 9000, at: (t) => squatBody(ramp(t, 1000, 3000) - ramp(t, 4500, 6500), good ? 8 : -12, good ? 0 : 0.3, good ? 10 : 40) };
    case 'toeTouch':
      return { ms: 9000, at: (t) => toeTouchBody(ramp(t, 1000, 3000) - ramp(t, 4500, 6500), good ? -0.01 : 0.12, 0) };
    case 'bridge': {
      const sagMax = good ? 0.0 : 0.12;
      return { ms: 16000, at: (t) => bridgeBody(side, t > 1500, sagMax * ramp(t, 3000, 9000), t > 800) };
    }
    case 'lat': {
      const a = good ? 172 : 140;
      return { ms: 8000, at: (t) => latBody(20 + (a - 20) * (ramp(t, 600, 2600) - 0.8 * ramp(t, 5000, 6500))) };
    }
    case 'shoulder9090': {
      const a = good ? 86 : 55;
      return { ms: 9000, at: (t) => shoulderBody(a * ramp(t, 800, 3000)) };
    }
  }
}

/** The frames of a script at a frame rate (for the unit tests). */
export function frames(s: Script, fps = 20): Frame[] {
  const out: Frame[] = [];
  for (let t = 0; t <= s.ms; t += 1000 / fps) out.push({ lm: s.at(t), w: SYNTH_W, h: SYNTH_H, t });
  return out;
}
