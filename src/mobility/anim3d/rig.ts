import * as THREE from 'three';

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
  /** where a club or stick is held: the right and left hand */
  hands: { L: THREE.Object3D; R: THREE.Object3D };
  head: THREE.Object3D;
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

/** The figure. */
export function buildRig(): Rig {
  const root = new THREE.Group();
  const markers: THREE.Object3D[] = [];
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
    // the hand: a flat rounded block (the right hand bare, the left one in the glove as a golfer)
    ball(wrist, 0.045, side === 1 ? COLORS.glove : COLORS.skin, [0, -0.05, 0.005], [0.62, 1.15, 1.0]);
    const grip = pivot(wrist, [0, -0.06, 0.01]);
    return { shoulder, elbow, wrist, grip, s };
  };
  const aL = arm(1);
  const aR = arm(-1);

  // ---- legs ----
  const leg = (side: 1 | -1) => {
    const hip = pivot(pelvis, [side * B.hipX, 0, 0], 'ZXY');
    limb(hip, B.thigh, 0.085, 0.06, COLORS.trousers);
    const knee = pivot(hip, [0, -B.thigh, 0], 'XYZ');
    ball(knee, 0.06, COLORS.trousers);
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
    markers,
    hands: { L: aL.grip, R: aR.grip },
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
}

/** Puts the rig into a pose; with `ground` the lowest marker is set on the floor. */
export function applyPose(rig: Rig, p: Pose, ground = true): void {
  for (const id of Object.keys(rig.joints) as JointId[]) {
    const r = p.j[id] ?? [0, 0, 0];
    rig.joints[id].rotation.set(D(r[0]), D(r[1]), D(r[2]));
  }
  rig.root.position.set(p.at?.[0] ?? 0, 0, p.at?.[1] ?? 0);
  rig.root.rotation.set(D(p.tip ?? 0), D(p.turn ?? 0), 0, 'YXZ');
  if (p.y != null) {
    rig.root.position.y = p.y;
    return;
  }
  if (!ground) return;
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const m of rig.markers) {
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
  };
}
