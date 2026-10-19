import * as THREE from 'three';
import { applyRealisticSkin } from './rigSkin';

// The 3D golfer of the Agility test videos (Sascha 17.10.2026: "3D animated videos"): our own figure in the colours of
// the Training golfer (green cap, blue-grey shirt, dark trousers, white shoes) – no bought model, so every movement
// can be shown exactly as the test text says. A skeleton of pivots (pelvis → spine → chest → neck → head, shoulders
// → elbows → wrists, hips → knees → ankles) with soft shapes hung on it. 1.75 m tall.
//
// Coordinates: y up, the figure faces +z (towards the default camera), its LEFT side is +x.
// Joint angles in degrees, in each joint's own frame (see the comments at the poses for the signs):
//  · spine, chest, neck, head, pelvis: x + = bend forward, y + = turn to the player's left, z + = lean to the player's right
//  · hips and shoulders (order Z, X, Y): z = sideways (left side + = out, right side − = out), x − = forward, y = twist
//  · knees: x + = bend · elbows: x − = bend · ankles: x + = toes up · wrists: x = bend, z = hinge

export type JointId =
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'elbowL'
  | 'wristL'
  | 'shoulderR'
  | 'elbowR'
  | 'wristR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR';

export const COLORS = {
  skin: '#d9ad86',
  shirt: '#3f5f73',
  trousers: '#2b3842',
  shoe: '#f2f4f3',
  sole: '#7d8790',
  cap: '#79a128',
  hair: '#4a3a2c',
  glove: '#ffffff',
  shaft: '#b8c2c8',
  grip: '#1c2328',
  clubHead: '#5c6870',
  stick: '#ff9d2e',
};

/** body measures in metres */
export const BODY = {
  hipY: 0.92,
  hipX: 0.095,
  thigh: 0.43,
  shin: 0.42,
  ankleH: 0.075,
  lumbar: 0.11, // pelvis → spine joint
  spine: 0.2, // spine → chest joint
  chest: 0.25, // chest → neck base
  shoulderX: 0.19,
  shoulderY: 0.2, // above the chest joint
  upperArm: 0.29,
  forearm: 0.26,
  neck: 0.09,
  headR: 0.105,
};

export interface Rig {
  root: THREE.Group;
  joints: Record<JointId, THREE.Object3D>;
  /** markers for grounding: soles of heels and toes, the pelvis (sitting) and the back (lying) */
  markers: THREE.Object3D[];
  /** more contact points for drills on the floor: knees, hands, elbows, the sides of shoulders and hips */
  contacts: THREE.Object3D[];
  /** where a club or stick is held: the right and left hand */
  hands: { L: THREE.Object3D; R: THREE.Object3D };
  /** the axis of what a closed hand holds: in the middle of the curled fingers, the shaft along the pivot's +z (towards
   * the thumb) – a club or stick through here is wrapped by the fingers at setGrip(…, 1) (see SHAFT_IN_HAND) */
  shafts: { L: THREE.Object3D; R: THREE.Object3D };
  head: THREE.Object3D;
  /** the eyes (scaled flat when closed – single-leg balance) */
  eyes: THREE.Object3D[];
  /** the finger and thumb joints of each hand (curled by setGrip) */
  fingers: { L: Finger[]; R: Finger[] };
  /** how far the hands close: 0 = open and relaxed, 1 = closed around a grip (a club, a stick) */
  setGrip(left: number, right: number): void;
}

/** a finger: its knuckle, middle and end joint (a thumb: base and tip) – curled about the hand's z (towards the palm) */
interface Finger {
  base: THREE.Object3D;
  mid: THREE.Object3D;
  tip?: THREE.Object3D;
  /** curl of each joint at a closed grip, degrees */
  closed: number[];
  /** curl at an open, relaxed hand */
  open: number[];
  thumb?: boolean;
  /** the realistic hull (rigSkin.ts): each joint's turn at rest (as the body's hand lies) – the curl comes on top */
  rest?: THREE.Quaternion[];
  /** the realistic hull: the length of each part */
  lengths?: number[];
  /** the realistic hull: each joint's whole turn when closed (the thumb lies along the grip) – mixed from rest */
  closedQ?: THREE.Quaternion[];
}

/** the radius of what a closed hand holds (a club grip, a stick): 1.35 cm */
export const SHAFT_R = 0.0135;
/** where that shaft runs in the hand (wrist frame, x for the left hand – the right hand mirrors x): the middle of the
 * curled fingers, at the height of the knuckles; the shaft points along +z (towards the thumb) */
export const SHAFT_IN_HAND: [number, number, number] = [-0.023, -0.084, 0];

/** the curl of a finger's joints so its parts lie around a shaft: each part a chord of the circle the finger's middle
 * line follows (shaft radius + finger radius); a joint turns by half of the two chords' angles */
function wrapCurl(parts: number[], fingerR: number): number[] {
  const R = SHAFT_R + fingerR;
  const arc = parts.map((l) => 2 * Math.asin(Math.min(1, l / (2 * R))));
  return arc.map((a, i) => THREE.MathUtils.radToDeg(i === 0 ? a / 2 : (arc[i - 1] + a) / 2));
}

function mat(color: string, rough = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

/** a limb between a joint and the next one: a capsule along −y (down) or +y (up) of its joint */
function limb(parent: THREE.Object3D, length: number, r0: number, r1: number, color: string, up = false) {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, Math.max(0.001, length - (r0 + r1) / 2), 6, 14);
  // taper: scale the vertices along the length
  const pos = g.attributes.position;
  const half = length / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = THREE.MathUtils.clamp((y + half) / length, 0, 1); // 0 at the start (bottom of the geometry) … 1
    const r = up ? r0 + (r1 - r0) * k : r1 + (r0 - r1) * k;
    const s = r / ((r0 + r1) / 2);
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(color));
  m.position.y = up ? length / 2 : -length / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function ball(parent: THREE.Object3D, r: number, color: string, at: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color));
  m.position.set(...at);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent: THREE.Object3D, at: [number, number, number], order: THREE.EulerOrder = 'XYZ') {
  const o = new THREE.Object3D();
  o.position.set(...at);
  o.rotation.order = order;
  parent.add(o);
  return o;
}

function marker(parent: THREE.Object3D, at: [number, number, number], list: THREE.Object3D[]) {
  const o = new THREE.Object3D();
  o.position.set(...at);
  parent.add(o);
  list.push(o);
  return o;
}

/** The figure: the soft shapes (default), or the realistic body (Training 19.10.2026) once it is loaded
 *  (rigSkin.ts: loadRealisticBody) – the same skeleton and interface. */
export function buildRig(opts: { skin?: 'classic' | 'realistic' } = {}): Rig {
  const rig = buildClassic();
  if (opts.skin === 'realistic') applyRealisticSkin(rig);
  return rig;
}

function buildClassic(): Rig {
  const root = new THREE.Group();
  const markers: THREE.Object3D[] = [];
  const contacts: THREE.Object3D[] = [];
  const B = BODY;

  const pelvis = pivot(root, [0, B.hipY, 0], 'YXZ');
  // pelvis: a wide rounded block of the trousers
  ball(pelvis, 0.16, COLORS.trousers, [0, 0.03, -0.005], [1.05, 0.62, 0.78]);
  marker(pelvis, [0, -0.08, -0.05], markers); // seat (sitting on a chair)
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.016, 8, 32), mat('#e9eef0', 0.5));
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, 0.085, 0);
  belt.scale.set(1.07, 0.78, 1);
  belt.castShadow = true;
  pelvis.add(belt);

  // ---- torso ----
  const spine = pivot(pelvis, [0, B.lumbar, 0], 'YXZ');
  limb(spine, B.spine + 0.04, 0.13, 0.145, COLORS.shirt, true).scale.set(1.12, 1, 0.78);
  ball(pelvis, 0.15, COLORS.shirt, [0, 0.1, 0], [1.05, 0.5, 0.75]); // belt line of the shirt
  const chest = pivot(spine, [0, B.spine, 0], 'YXZ');
  ball(chest, 0.17, COLORS.shirt, [0, 0.12, 0.0], [1.12, 1.0, 0.72]);
  marker(chest, [0, 0.12, -0.13], markers); // upper back (lying)
  marker(pelvis, [0, 0.02, -0.13], markers); // low back (lying)

  const neck = pivot(chest, [0, B.chest, 0], 'YXZ');
  limb(neck, B.neck + 0.02, 0.05, 0.045, COLORS.skin, true);
  const head = pivot(neck, [0, B.neck, 0.01], 'YXZ');
  ball(head, B.headR, COLORS.skin, [0, B.headR * 0.95, 0.005], [0.92, 1.08, 1.0]);
  // cap: crown and visor (the visor shows where the player looks)
  const crown = new THREE.Mesh(new THREE.SphereGeometry(B.headR * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(COLORS.cap, 0.6));
  crown.position.set(0, B.headR * 1.12, 0);
  crown.scale.set(0.95, 0.9, 1.02);
  crown.castShadow = true;
  head.add(crown);
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(B.headR * 0.95, B.headR * 0.95, 0.012, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84), mat(COLORS.cap, 0.6));
  visor.position.set(0, B.headR * 1.12, 0.06);
  visor.scale.set(1, 1, 1.25);
  visor.castShadow = true;
  head.add(visor);
  // eyes: they close for the balance test
  const eyes = [-1, 1].map((s) => ball(head, 0.014, '#1c2328', [s * 0.036, B.headR * 1.0, B.headR * 0.9]));
  // nose and ears: the head turn has to be visible
  ball(head, 0.022, COLORS.skin, [0, B.headR * 0.85, B.headR * 0.95]);
  ball(head, 0.022, COLORS.skin, [B.headR * 0.92, B.headR * 0.85, -0.005], [0.6, 1.2, 1]);
  ball(head, 0.022, COLORS.skin, [-B.headR * 0.92, B.headR * 0.85, -0.005], [0.6, 1.2, 1]);
  marker(head, [0, B.headR * 0.9, -B.headR], markers); // back of the head (lying)

  // ---- arms ----
  const arm = (side: 1 | -1) => {
    const s = side === 1 ? 'L' : 'R';
    const shoulder = pivot(chest, [side * B.shoulderX, B.shoulderY, -0.01], 'ZXY');
    ball(shoulder, 0.062, COLORS.shirt, [0, -0.01, 0]);
    limb(shoulder, B.upperArm, 0.056, 0.045, COLORS.shirt);
    const elbow = pivot(shoulder, [0, -B.upperArm, 0], 'XYZ');
    limb(elbow, B.forearm, 0.042, 0.032, COLORS.skin);
    const wrist = pivot(elbow, [0, -B.forearm, 0], 'XZY');
    // the hand (Sascha 17.10.2026: "more detail – fingers and hands"): the palm, four fingers in two parts and the
    // thumb; the left hand in the glove as a golfer. Palm towards the body (−x for the left hand), thumb forward (+z).
    const handColor = side === 1 ? COLORS.glove : COLORS.skin;
    ball(wrist, 0.042, handColor, [0, -0.048, 0.004], [0.5, 1.05, 1.0]);
    const fingers: Finger[] = [];
    // index … little: knuckle across the palm (z), lengths of the three parts, thickness (Training 18.10.2026: with two
    // parts the fingers could not close around a club grip – the first part was as long as the circle is wide)
    const F: [number, number, number, number, number][] = [
      [0.026, 0.04, 0.024, 0.019, 0.0095],
      [0.009, 0.043, 0.026, 0.02, 0.0098],
      [-0.008, 0.04, 0.024, 0.019, 0.0092],
      [-0.024, 0.033, 0.02, 0.016, 0.0082],
    ];
    for (const [z, l1, l2, l3, r] of F) {
      // the knuckles in line at the shaft's height, so every finger wraps the same shaft
      const base = pivot(wrist, [0, SHAFT_IN_HAND[1], z], 'XYZ');
      limb(base, l1, r, r * 0.94, handColor);
      const mid = pivot(base, [0, -l1, 0], 'XYZ');
      limb(mid, l2, r * 0.92, r * 0.86, handColor);
      const tip = pivot(mid, [0, -l2, 0], 'XYZ');
      limb(tip, l3, r * 0.84, r * 0.78, handColor);
      fingers.push({ base, mid, tip, closed: wrapCurl([l1, l2, l3], r), open: [12, 14, 10] });
    }
    // the thumb: from the heel of the hand forward and down; closed it lies on the grip, along the shaft (base turned
    // more forward, the tip nearly straight – it ends about 7 cm along the shaft, on its top)
    const tb = pivot(wrist, [-side * 0.008, -0.03, 0.03], 'XYZ');
    tb.rotation.set(THREE.MathUtils.degToRad(-28), 0, 0);
    limb(tb, 0.036, 0.0115, 0.0105, handColor);
    const tm = pivot(tb, [0, -0.036, 0], 'XYZ');
    limb(tm, 0.03, 0.0102, 0.0088, handColor);
    fingers.push({ base: tb, mid: tm, closed: [22, 6], open: [8, 10], thumb: true });
    const grip = pivot(wrist, [0, -0.06, 0.01]);
    const shaft = pivot(wrist, [side * SHAFT_IN_HAND[0], SHAFT_IN_HAND[1], SHAFT_IN_HAND[2]]);
    marker(wrist, [0, -0.08, -0.02], contacts); // palm
    marker(elbow, [0, 0, -0.045], contacts); // back of the elbow
    marker(shoulder, [side * 0.065, 0, 0], contacts); // side of the shoulder (lying on the side)
    return { shoulder, elbow, wrist, grip, shaft, s, fingers };
  };
  const aL = arm(1);
  const aR = arm(-1);

  // ---- legs ----
  const leg = (side: 1 | -1) => {
    const hip = pivot(pelvis, [side * B.hipX, 0, 0], 'ZXY');
    limb(hip, B.thigh, 0.085, 0.06, COLORS.trousers);
    const knee = pivot(hip, [0, -B.thigh, 0], 'XYZ');
    ball(knee, 0.06, COLORS.trousers);
    marker(knee, [0, -0.03, 0.06], contacts); // kneecap (kneeling)
    marker(hip, [side * 0.09, -0.04, 0], contacts); // side of the hip (lying on the side)
    limb(knee, B.shin, 0.058, 0.042, COLORS.trousers);
    const ankle = pivot(knee, [0, -B.shin, 0], 'XYZ');
    // the shoe: sole and upper, pointing forward (+z)
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.27), mat(COLORS.sole));
    sole.position.set(0, -B.ankleH + 0.012, 0.06);
    sole.castShadow = true;
    ankle.add(sole);
    ball(ankle, 0.06, COLORS.shoe, [0, -B.ankleH + 0.05, 0.07], [0.82, 0.55, 2.15]);
    marker(ankle, [0, -B.ankleH, -0.07], markers); // heel
    marker(ankle, [0, -B.ankleH, 0.19], markers); // toe
    return { hip, knee, ankle };
  };
  const lL = leg(1);
  const lR = leg(-1);

  return {
    root,
    head,
    eyes,
    markers,
    contacts,
    hands: { L: aL.grip, R: aR.grip },
    shafts: { L: aL.shaft, R: aR.shaft },
    fingers: { L: aL.fingers, R: aR.fingers },
    setGrip(left: number, right: number) {
      for (const [list, k, side] of [[aL.fingers, left, 1], [aR.fingers, right, -1]] as [Finger[], number, 1 | -1][]) {
        for (const f of list) {
          const at = (i: number) => THREE.MathUtils.degToRad(-side * (f.open[i] + (f.closed[i] - f.open[i]) * k));
          if (f.rest && f.closedQ) {
            [f.base, f.mid, f.tip].forEach((p, i) => p?.quaternion.copy(f.rest![i]).slerp(f.closedQ![i], k));
            continue;
          }
          if (f.rest) {
            // the realistic hand: its rest turn, then the curl about the part's own z
            [f.base, f.mid, f.tip].forEach((p, i) => p?.quaternion.copy(f.rest![i]).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), at(i))));
            continue;
          }
          // fingers curl towards the palm (about z); the thumb folds across the palm (about z as well, from its base tilt)
          f.base.rotation.z = at(0);
          f.mid.rotation.z = at(1);
          if (f.tip) f.tip.rotation.z = at(2);
          if (f.thumb) {
            f.base.rotation.y = THREE.MathUtils.degToRad(side * 20 * k);
            f.base.rotation.x = THREE.MathUtils.degToRad(-28 - 17 * k);
          }
        }
      }
    },
    joints: {
      pelvis,
      spine,
      chest,
      neck,
      head,
      shoulderL: aL.shoulder,
      elbowL: aL.elbow,
      wristL: aL.wrist,
      shoulderR: aR.shoulder,
      elbowR: aR.elbow,
      wristR: aR.wrist,
      hipL: lL.hip,
      kneeL: lL.knee,
      ankleL: lL.ankle,
      hipR: lR.hip,
      kneeR: lR.knee,
      ankleR: lR.ankle,
    },
  };
}

const D = THREE.MathUtils.degToRad;

export type Rot = [number, number, number];
export interface Pose {
  /** joint angles in degrees */
  j: Partial<Record<JointId, Rot>>;
  /** where the figure stands: x/z of the pelvis (y is found from the ground unless `y` is given), turn about y */
  at?: [number, number];
  y?: number;
  turn?: number;
  /** the whole body tipped forward/back (lying: −90 = on the back) */
  tip?: number;
  /** 1 = eyes open (default), 0 = closed */
  eyes?: number;
  /** the whole body rolled to the side (lying on the side: 90 = on the right side) */
  roll?: number;
  /** how far each hand is closed, 0 … 1 (default: relaxed, slightly curled; holding a club or stick: 1) */
  gripL?: number;
  gripR?: number;
}

/** Puts the rig into a pose; with `ground` the lowest marker is set on the floor ('all': knees, hands, elbows too). */
export function applyPose(rig: Rig, p: Pose, ground: boolean | 'all' = true): void {
  for (const id of Object.keys(rig.joints) as JointId[]) {
    const r = p.j[id] ?? [0, 0, 0];
    rig.joints[id].rotation.set(D(r[0]), D(r[1]), D(r[2]));
  }
  rig.root.position.set(p.at?.[0] ?? 0, 0, p.at?.[1] ?? 0);
  rig.root.rotation.set(D(p.tip ?? 0), D(p.turn ?? 0), D(p.roll ?? 0), 'YXZ');
  for (const e of rig.eyes) e.scale.set(1, Math.max(0.12, p.eyes ?? 1), 1);
  rig.setGrip(p.gripL ?? 0.25, p.gripR ?? 0.25);
  if (p.y != null) {
    rig.root.position.y = p.y;
    return;
  }
  if (!ground) return;
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const m of ground === 'all' ? [...rig.markers, ...rig.contacts] : rig.markers) {
    m.getWorldPosition(v);
    low = Math.min(low, v.y);
  }
  rig.root.position.y = -low;
}

/** A pose between two others (each angle eased). */
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  const j: Partial<Record<JointId, Rot>> = {};
  const ids = new Set([...Object.keys(a.j), ...Object.keys(b.j)] as JointId[]);
  for (const id of ids) {
    const ra = a.j[id] ?? [0, 0, 0];
    const rb = b.j[id] ?? [0, 0, 0];
    j[id] = [ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, ra[2] + (rb[2] - ra[2]) * k];
  }
  const l = (x?: number, y?: number) => (x == null && y == null ? undefined : (x ?? 0) + ((y ?? 0) - (x ?? 0)) * k);
  return {
    j,
    at: a.at || b.at ? [l(a.at?.[0], b.at?.[0])!, l(a.at?.[1], b.at?.[1])!] : undefined,
    y: a.y != null || b.y != null ? l(a.y, b.y) : undefined,
    turn: l(a.turn, b.turn),
    tip: l(a.tip, b.tip),
    roll: l(a.roll, b.roll),
    eyes: a.eyes != null || b.eyes != null ? (a.eyes ?? 1) + ((b.eyes ?? 1) - (a.eyes ?? 1)) * k : undefined,
    gripL: l(a.gripL, b.gripL),
    gripR: l(a.gripR, b.gripR),
  };
}
