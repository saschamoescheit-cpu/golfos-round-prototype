import * as THREE from 'three';
import { applyPose, BODY, buildRig, COLORS, type Pose, type Rig, type Rot } from '../../mobility/anim3d/rig';
import type { L, Shot } from '../types';
import { ballFlight } from '../motion';

// The 3D swing videos of Training (Sascha 17.10.2026: "3D animated videos would be better than still pictures").
// The golfer of the Agility 3D videos (same figure, same stage, same camera views), here holding a club with both
// hands: the trunk turns by key poses, the hands and the club move on the swing arc, and the arms and legs are solved
// to reach them (two-bone inverse kinematics) – so both hands stay on the grip and the feet stay on the ground.
//
// World: y up, the player faces +z (the ball lies in front of the toes), the target is +x (to the right face-on).

export type View = 'front' | 'side' | 'angle' | 'above';
export type Club3D = 'iron' | 'wedge' | 'driver' | 'putter';
type V3 = [number, number, number];

export interface SwingKey {
  t: number;
  /** trunk and head angles (degrees, the rig's signs: pelvis/spine/chest/neck/head – x forward, y + towards the target) */
  body: Partial<Record<'pelvis' | 'spine' | 'chest' | 'neck' | 'head', Rot>>;
  /** the lead hand on the grip, in the chest's own frame (x to the player's left, y up the spine, z forward) */
  hands: V3;
  /** where the club points from the hands: in the world, or 'ball' – the clubhead at the ball */
  club: V3 | 'ball';
  /** weight shift: the pelvis this far towards the target (m) */
  shift?: number;
  /** the body lower (m, knee flex) */
  drop?: number;
  /** the trail heel comes up (0–1) */
  heel?: number;
  /** the eyes stay on the ball (default) or the head follows the body to the target (after impact) */
  free?: boolean;
  /** with club 'ball': the clubhead this far from its place at the ball (m) – behind it (fat), above it (thin) */
  miss?: V3;
  /** the face turned about the shaft (degrees): + open (it looks right of the target), − closed */
  face?: number;
  /** the pelvis this far towards the ball (m) – standing up into the ball (early extension) */
  push?: number;
  label?: L;
}

export interface Swing {
  keys: SwingKey[];
  club: Club3D;
  /** distance between the ankles (m) */
  stance?: number;
  /** the ball, relative to the middle of the feet: x towards the target, z in front of the ankles */
  ball?: [number, number];
  /** the ball leaves at this time: it rolls (putt, chip) this many metres, or flies off (full swing) */
  /** side: the ball's start line and its bend (slice +, hook −), metres to the right per metre and per metre² of
   *  carry – for a right-hander right of the target is away from the player */
  hit?: { at: number; shot: Shot; scale?: number; side?: { start: number; bend: number } };
  /** the ball sits on a tee (driver) */
  tee?: boolean;
  /** only the lead hand on the club – the trail hand rests on the chest */
  oneHand?: boolean;
  /** played from sand (bunker) */
  sand?: boolean;
  /** drill aids: a stick in the ground outside the trail hip, a towel under both arms, a stick held with the grip */
  props?: ('stickHip' | 'towel' | 'stickGrip' | 'stickSeat')[];
  view?: View;
}

const CLUB_LEN: Record<Club3D, number> = { driver: 1.06, iron: 0.86, wedge: 0.82, putter: 0.8 };

// ---------- inverse kinematics ----------
const tmpQ = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Turns a joint so its limb (along its local −y) points at a world point. */
function aim(joint: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from).normalize();
  joint.parent!.getWorldQuaternion(tmpQ);
  dir.applyQuaternion(tmpQ.clone().invert());
  joint.quaternion.setFromUnitVectors(DOWN, dir);
  joint.updateMatrixWorld(true);
}

/** Two bones (lengths a, b) from the root joint to reach the target; the middle joint bends towards the pole. */
function twoBone(root: THREE.Object3D, mid: THREE.Object3D, a: number, b: number, target: THREE.Vector3, pole: THREE.Vector3) {
  const s = root.getWorldPosition(new THREE.Vector3());
  const toT = target.clone().sub(s);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const u = toT.normalize();
  // the bend plane: towards the pole, square to the line root → target
  const v = pole.clone().sub(s);
  v.sub(u.clone().multiplyScalar(v.dot(u))).normalize();
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const elbow = s.clone().addScaledVector(u, a * cos).addScaledVector(v, a * sin);
  aim(root, s, elbow);
  aim(mid, elbow, s.clone().addScaledVector(u, d));
}

/** The club: grip, shaft and head along +y of its group (the butt end at 0). */
function buildClub(kind: Club3D): THREE.Group {
  const g = new THREE.Group();
  const m = (c: string, r = 0.5, metal = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: metal });
  const steel = m('#c9d1d6', 0.28, 0.75);
  const len = CLUB_LEN[kind];
  // grip with a cap, the shaft narrowing to the hosel
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0105, 0.27, 12), m(COLORS.grip, 0.85));
  grip.position.y = 0.135;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(COLORS.grip, 0.85));
  cap.rotation.x = Math.PI;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0042, len - 0.31, 10), steel);
  shaft.position.y = 0.27 + (len - 0.31) / 2;
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.045, 10), kind === 'driver' ? m('#2a3136', 0.4, 0.3) : steel);
  hosel.position.y = len - 0.02;
  // the head lies flat on the ground at address: tilted against the shaft by the lie angle, toe away from the player
  const head = new THREE.Group();
  head.position.y = len;
  head.rotation.x = -0.33;
  if (kind === 'driver') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.062, 24, 16), m('#2a3136', 0.32, 0.4));
    crown.scale.set(0.9, 0.62, 1.15);
    crown.position.set(0.015, -0.02, 0.055);
    head.add(crown);
  } else if (kind === 'putter') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.11), steel);
    blade.position.set(0.004, -0.012, 0.045);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.0285, 0.0005, 0.003), m('#ffffff', 0.6));
    line.position.set(0.004, -0.024, 0.045);
    head.add(blade, line);
  } else {
    // a blade iron: thin face, a little thicker at the sole, a rounded toe
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.046, 0.075), steel);
    blade.position.set(0.002, -0.016, 0.04);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.01, 0.075), steel);
    sole.position.set(0.004, 0.004, 0.04);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), steel);
    toe.scale.set(0.008, 0.023, 0.009);
    toe.position.set(0.002, -0.016, 0.0775);
    head.add(blade, sole, toe);
  }
  for (const x of [grip, cap, shaft, hosel]) g.add(x);
  g.add(head);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

// ---------- the swing at a time ----------
const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** The swings' trunk angles (swings.ts) lifted to the reference address of the shared figure (Agility 18.10.2026,
 *  ADDRESS in src/mobility/anim3d/clips.ts: trunk about 45° forward with a straight back, the head in line with the
 *  spine, the eyes down): a little further forward at the hips, the neck less bent back, the head nodding to the ball –
 *  the head only while the eyes are on the ball. */
const POSTURE = { pelvis: 2, spine: 2, chest: 1, neck: 8, head: 10 } as const;
const postured = (body: SwingKey['body'], look: number): SwingKey['body'] => {
  const out: SwingKey['body'] = {};
  for (const id of ['pelvis', 'spine', 'chest', 'neck', 'head'] as const) {
    const r = body[id] ?? [0, 0, 0];
    out[id] = [r[0] + POSTURE[id] * (id === 'neck' || id === 'head' ? look : 1), r[1], r[2]];
  }
  return out;
};

/** A value between the keys t1 and t2 (u from 0 to 1), on a smooth curve through the four keys around it: the
 *  speed runs on through a key instead of stopping there (a swing flows), but the curve never goes beyond a key –
 *  where the movement turns (the top, the finish) or holds, it comes to rest (monotone cubic, Fritsch–Butland). */
export function mono(p0: number, p1: number, p2: number, p3: number, t0: number, t1: number, t2: number, t3: number, u: number): number {
  const h = t2 - t1;
  if (h <= 0) return p1;
  const d0 = t1 > t0 ? (p1 - p0) / (t1 - t0) : 0;
  const d1 = (p2 - p1) / h;
  const d2 = t3 > t2 ? (p3 - p2) / (t3 - t2) : 0;
  const tan = (x: number, y: number) => (x * y > 0 ? (2 * x * y) / (x + y) : 0);
  const m1 = tan(d0, d1);
  const m2 = tan(d1, d2);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * h * m2;
}

interface Prepared {
  /** clubQ: the club's whole turn in the chest frame – the shaft direction and the face with it */
  keys: (SwingKey & { clubLocal: THREE.Vector3; clubQ: THREE.Quaternion })[];
  length: number;
}

export interface Viewer {
  setSwing(s: Swing): void;
  /** several golfers side by side (x along the target line, z towards the ball, metres) – the fault and the right way */
  setSwings(list: { swing: Swing; x?: number; z?: number }[]): void;
  setView(v: View): void;
  setPlaying(on: boolean): void;
  setSpeed(k: number): void;
  seek(t: number): void;
  onLabel(cb: (label: L | undefined, step: number) => void): void;
  /** development: look closer at a point (the preview checks the club head) */
  closeUp?(at: [number, number, number] | null, dist?: number): void;
  resize(): void;
  dispose(): void;
}

export function createGolfViewer(canvas: HTMLCanvasElement): Viewer {
  // the stage of the Agility videos: sky, grass, sun with soft shadows
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe6f5');
  scene.fog = new THREE.Fog('#cfe6f5', 9, 26);
  scene.add(new THREE.HemisphereLight('#ffffff', '#7cb257', 1.5));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(2.2, 4.5, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dfefff', 0.6);
  fill.position.set(-3, 2.5, -2);
  scene.add(fill);
  const floorMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat('#7cb257'));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), floorMat('#8fc069'));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.001;
  pad.receiveShadow = true;
  scene.add(pad);
  // the target: a flag on a small green down the target line – from behind it shows where the ball is meant to go
  const green = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), floorMat('#93c86c'));
  green.rotation.x = -Math.PI / 2;
  green.position.set(6.4, 0.002, 0.3);
  scene.add(green);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 8), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.5 }));
  pin.position.set(6.4, 1.05, 0.3);
  scene.add(pin);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: '#79a128', roughness: 0.8, side: THREE.DoubleSide }));
  cloth.position.set(6.4, 1.92, 0.3 - 0.25);
  cloth.rotation.y = Math.PI / 2;
  scene.add(cloth);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);

  /** one golfer on the stage: the figure, the club, the ball and its tee, the swing, how far along the target line */
  interface Player {
    rig: Rig;
    club: THREE.Group;
    ball: THREE.Mesh;
    tee: THREE.Mesh;
    extras: THREE.Group;
    /** the divot: the mark in the turf and the bits of grass flying off (none for a putt, a chip, from the tee or thin) */
    divot: { mark: THREE.Mesh; bits: THREE.Mesh[]; from: number; len: number; yaw: number } | null;
    /** the path of the clubhead, drawn up to now – from behind it shows the swing plane */
    trace: { mesh: THREE.Mesh; times: number[]; share: number[] } | null;
    /** the ball's flight drawn behind it, as the tracer on television – so the curve is seen even when the ball is small */
    tracer: { mesh: THREE.Mesh; times: number[]; share: number[] } | null;
    /** a putt's hole and the moment the ball drops in (none when it misses) */
    cup: { at: THREE.Vector3; drop: number | null } | null;
    swing: Swing;
    prep: Prepared;
    x: number;
    z: number;
  }
  let players: Player[] = [];

  let view: View = 'front';
  let playing = true;
  let speed = 1;
  let t = 0;
  let last = performance.now();
  let raf = 0;
  let visible = true;
  let labelCb: ((l: L | undefined, step: number) => void) | null = null;
  let lastStep = -1;
  let bounds: THREE.Box3 | null = null;
  let length = 0;

  const ballPos = (p: { swing: Swing; x: number; z: number }) => {
    const b = p.swing.ball ?? [0, 0.6];
    return new THREE.Vector3(p.x + b[0], p.swing.tee ? 0.06 : 0.0215, p.z + b[1]);
  };

  /** the trunk of a key (or between two) put on the rig, the limbs left for the solver */
  const poseTrunk = (p: { rig: Rig; x: number; z: number }, body: SwingKey['body'], shift: number, drop: number, push = 0) => {
    // both hands closed around the grip (the fingers of the Agility figure)
    const pose: Pose = { j: { ...body }, at: [p.x + shift, p.z + push - 0.06], y: drop, gripL: 1, gripR: 1 };
    applyPose(p.rig, pose, false);
    p.rig.root.updateMatrixWorld(true);
  };
  const chestQ = (rig: Rig) => rig.joints.chest.getWorldQuaternion(new THREE.Quaternion());
  const chestPos = (rig: Rig) => rig.joints.chest.getWorldPosition(new THREE.Vector3());

  /** each key's club direction in the chest frame – 'ball' worked out with the key's own trunk. The face: the neutral
   *  swing (Sascha 17.10.2026: the basic swing model) – the hands do not roll the face, it follows the body turn: from
   *  the address (face square to the target, toe away from the player) the club only turns the shortest way in the
   *  chest's frame, so the toe points up when the shaft is level back and through, and the face is square again at
   *  impact */
  const prepare = (p: { rig: Rig; swing: Swing; x: number; z: number }): Prepared => {
    const s = p.swing;
    let address: { dir: THREE.Vector3; q: THREE.Quaternion } | null = null;
    const keys = s.keys.map((k) => {
      poseTrunk(p, postured(k.body, k.free ? 0 : 1), k.shift ?? 0, -(k.drop ?? 0.05), k.push ?? 0);
      let hands = new THREE.Vector3(...k.hands).applyQuaternion(chestQ(p.rig)).add(chestPos(p.rig));
      const head = ballPos(p).add(new THREE.Vector3(-0.04, 0.005, 0)).add(new THREE.Vector3(...(k.miss ?? [0, 0, 0])));
      const dir = k.club === 'ball' ? head.clone().sub(hands).normalize() : new THREE.Vector3(...k.club).normalize();
      // at the ball the clubhead sits exactly behind it: the hands slide along the shaft to the club's length
      if (k.club === 'ball') hands = head.clone().addScaledVector(dir, -(CLUB_LEN[s.club] - 0.05));
      const local = hands.clone().sub(chestPos(p.rig)).applyQuaternion(chestQ(p.rig).invert());
      const inv = chestQ(p.rig).invert();
      const clubLocal = dir.clone().applyQuaternion(inv);
      if (!address) {
        // the address: the shaft along dir (club +y), the toe away from the player (club +z towards the ball line)
        const y = dir.clone();
        const zAxis = new THREE.Vector3(0, 0, 1).sub(y.clone().multiplyScalar(y.z)).normalize();
        const x = new THREE.Vector3().crossVectors(y, zAxis);
        const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, zAxis));
        address = { dir: clubLocal.clone(), q: inv.clone().multiply(world) };
      }
      const clubQ = new THREE.Quaternion().setFromUnitVectors(address.dir, clubLocal).multiply(address.q);
      return { ...k, hands: [local.x, local.y, local.z] as V3, clubLocal, clubQ };
    });
    return { keys, length: keys[keys.length - 1].t };
  };

  /** a golfer and the club at a time of the swing */
  const place = (p: Player, time: number) => {
    const { rig, swing, prep } = p;
    const keys = prep.keys;
    const tt = Math.min(Math.max(time, 0), prep.length);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= tt) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const k0 = keys[Math.max(i - 1, 0)];
    const k3 = keys[Math.min(i + 2, keys.length - 1)];
    const u = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
    const k = ease(u);
    // every number of the pose on the smooth curve through the keys around this moment
    const mix = (g: (x: Prepared['keys'][number]) => number) => mono(g(k0), g(a), g(b), g(k3), k0.t, a.t, b.t, k3.t, u);
    // the eyes on the ball until the club has passed it, then the head turns with the body
    const look = lerp(a.free ? 0 : 1, b.free ? 0 : 1, k);
    const body: SwingKey['body'] = {};
    for (const id of ['pelvis', 'spine', 'chest', 'neck', 'head'] as const) body[id] = [0, 1, 2].map((c) => mix((x) => x.body[id]?.[c] ?? 0)) as Rot;
    poseTrunk(p, postured(body, look), mix((x) => x.shift ?? 0), -mix((x) => x.drop ?? 0.05), mix((x) => x.push ?? 0));
    if (look > 0) {
      // the smallest turn of the head that points the face at the ball (no roll, also with the ball right below the
      // eyes when putting); the face points a little below the eyes' line – aim a bit beyond the ball
      const head = rig.joints.head;
      const keyed = head.quaternion.clone();
      const wq = head.getWorldQuaternion(new THREE.Quaternion());
      const face = new THREE.Vector3(0, -0.25, 1).normalize().applyQuaternion(wq);
      const want = ballPos(p).sub(head.getWorldPosition(new THREE.Vector3())).normalize();
      const turned = new THREE.Quaternion().setFromUnitVectors(face, want).multiply(wq);
      head.parent!.getWorldQuaternion(tmpQ);
      const local = tmpQ.clone().invert().multiply(turned);
      head.quaternion.copy(keyed.slerp(local, look * 0.55));
      head.updateMatrixWorld(true);
    }
    const q = chestQ(rig);
    const chestP = chestPos(rig);
    const handsL = new THREE.Vector3(...[0, 1, 2].map((c) => mix((x) => x.hands[c]))).applyQuaternion(q).add(chestP);
    // the club turns with the hands – shaft and face together, on the same smooth curve (the four turns on one side
    // of the sphere, so the curve takes the short way)
    const qs = [k0.clubQ, a.clubQ, b.clubQ, k3.clubQ].map((x) => x.clone());
    if (qs[0].dot(qs[1]) < 0) qs[0].set(-qs[0].x, -qs[0].y, -qs[0].z, -qs[0].w);
    if (qs[2].dot(qs[1]) < 0) qs[2].set(-qs[2].x, -qs[2].y, -qs[2].z, -qs[2].w);
    if (qs[3].dot(qs[2]) < 0) qs[3].set(-qs[3].x, -qs[3].y, -qs[3].z, -qs[3].w);
    const cq = (['x', 'y', 'z', 'w'] as const).map((c) => mono(qs[0][c], qs[1][c], qs[2][c], qs[3][c], k0.t, a.t, b.t, k3.t, u));
    const clubW = q.clone().multiply(new THREE.Quaternion(cq[0], cq[1], cq[2], cq[3]).normalize());
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(clubW).normalize();
    // an open or closed face: the club turns about its shaft (the hands turn with it)
    const face = mix((x) => x.face ?? 0);
    if (face) clubW.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, THREE.MathUtils.degToRad(face)));
    const handsR = handsL.clone().addScaledVector(dir, 0.09);

    // the hands on the grip (a golf grip, not a fist around a stick): the shaft runs diagonally through the fingers –
    // in the hand's frame half towards the thumb side (+z, where the fingers close around) and half along the fingers
    // (−y) – and the back of the lead hand / the palm of the trail hand face where the clubface looks; the grip point
    // sits 6 cm from the wrist, the fingers of the Agility figure close around it
    const J = rig.joints;
    const faceN = new THREE.Vector3(-1, 0, 0).applyQuaternion(clubW);
    const C = new THREE.Vector3(0, -Math.SQRT1_2, Math.SQRT1_2);
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), C, new THREE.Vector3(1, 0, 0).cross(C));
    const nx = faceN.clone().sub(dir.clone().multiplyScalar(faceN.dot(dir))).normalize();
    const world = new THREE.Matrix4().makeBasis(nx, dir, nx.clone().cross(dir));
    const handW = new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.clone().invert()));
    const GRIP = new THREE.Vector3(0, -0.06, 0.01).applyQuaternion(handW);
    const wristL = handsL.clone().sub(GRIP);
    const wristR = handsR.clone().sub(GRIP);
    const setHand = (wrist: THREE.Object3D) => {
      wrist.parent!.getWorldQuaternion(tmpQ);
      wrist.quaternion.copy(tmpQ.clone().invert().multiply(handW));
      wrist.updateMatrixWorld(true);
    };
    // elbows point down and a little out, away from the body
    const poleL = chestP.clone().add(new THREE.Vector3(0.5, -1, 0.1).applyQuaternion(q));
    const poleR = chestP.clone().add(new THREE.Vector3(-0.5, -1, 0.1).applyQuaternion(q));
    twoBone(J.shoulderL, J.elbowL, BODY.upperArm, BODY.forearm, wristL, poleL);
    // one-handed: the trail hand rests flat on the chest
    const rest = chestP.clone().add(new THREE.Vector3(0.02, 0.1, 0.17).applyQuaternion(q));
    twoBone(J.shoulderR, J.elbowR, BODY.upperArm, BODY.forearm, swing.oneHand ? rest : wristR, poleR);
    setHand(J.wristL);
    // one-handed the trail hand lies open on the chest
    if (swing.oneHand) rig.setGrip(1, 0.1);
    if (swing.oneHand) aim(J.wristR, rest, rest.clone().add(new THREE.Vector3(1, 0.3, 0).applyQuaternion(q)));
    else setHand(J.wristR);

    // legs: the ankles stay where they stand; the trail heel comes up in the finish
    const half = (swing.stance ?? 0.36) / 2;
    const heel = lerp(a.heel ?? 0, b.heel ?? 0, k);
    const ankleL = new THREE.Vector3(p.x + half, BODY.ankleH, p.z);
    const ankleR = new THREE.Vector3(p.x - half + heel * 0.06, BODY.ankleH + heel * 0.11, p.z - heel * 0.03);
    const pelvisP = J.pelvis.getWorldPosition(new THREE.Vector3());
    twoBone(J.hipL, J.kneeL, BODY.thigh, BODY.shin, ankleL, pelvisP.clone().add(new THREE.Vector3(0.25, 0, 1)));
    twoBone(J.hipR, J.kneeR, BODY.thigh, BODY.shin, ankleR, pelvisP.clone().add(new THREE.Vector3(-0.25 + heel * 0.5, 0, 1)));
    // feet flat, toes a little out; the trail foot up on its toes
    const footQ = (yaw: number, pitch: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ'));
    for (const [joint, wq] of [
      [J.ankleL, footQ(14, 0)],
      [J.ankleR, footQ(-14 + heel * 30, heel * 50)],
    ] as const) {
      joint.parent!.getWorldQuaternion(tmpQ);
      joint.quaternion.copy(tmpQ.clone().invert().multiply(wq));
    }
    rig.root.updateMatrixWorld(true);

    // the club in the hands
    p.club.position.copy(handsL).addScaledVector(dir, -0.05);
    p.club.quaternion.copy(clubW);
    p.club.updateMatrixWorld(true);

    let label: L | undefined;
    let step = 0;
    for (let n = 0; n <= i; n++)
      if (keys[n].label) {
        label = keys[n].label;
        step++;
      }
    return { label, step };
  };

  /** the divot of a swing, relative to the ball (x towards the target, metres): after the ball when the ball is
   *  struck first – the sign of a good iron shot – behind it when fat; none when thin or topped (the edge stays above
   *  the ground), from the tee, with a wood that sweeps, a chip that brushes the grass or a putt */
  const divotOf = (swing: Swing): { from: number; len: number; yaw: number } | null => {
    const h = swing.hit;
    if (!h || swing.tee || h.shot === 'putt') return null;
    const miss = swing.keys.find((k) => Math.abs(k.t - h.at) < 1e-6)?.miss ?? [0, 0, 0];
    // the divot points along the club's path: left of the target from out to in (over the top), right from in to out
    const yaw = h.side ? (h.side.start < 0 ? 0.21 : h.side.start > 0 ? -0.21 : 0) : 0;
    if (miss[1] > 0.015) return null;
    if (miss[0] < -0.03) return { from: miss[0] - 0.02, len: 0.17, yaw };
    if (swing.club === 'driver' || h.shot === 'chip') return null;
    return { from: 0.01, len: h.shot === 'full' ? 0.15 : 0.09, yaw };
  };
  /** the divot opens as the club passes the ground, the bits of turf fly forward and stay where they land */
  const placeDivot = (p: Player, time: number) => {
    const d = p.divot;
    const h = p.swing.hit;
    if (!d || !h) return;
    const s = time - (h.at - 0.03);
    const u = THREE.MathUtils.clamp(s / 0.08, 0, 1);
    const at = ballPos(p);
    const dir = new THREE.Vector3(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
    d.mark.visible = s > 0;
    d.mark.scale.set(Math.max(0.001, (d.len / 2) * u), 0.026, 1);
    d.mark.position.copy(at).addScaledVector(dir, d.from + (d.len * u) / 2).setY(0.003);
    d.bits.forEach((b, i) => {
      b.visible = s > 0.02;
      if (!b.visible) return;
      const k = Math.max(0, s - 0.02);
      const vx = 0.9 + 0.35 * i;
      const vy = 1.1 + 0.25 * ((i * 7) % 3);
      const vz = 0.18 * (((i * 5) % 3) - 1);
      // flying until it lands, then lying there
      const land = (2 * vy) / 9.81;
      const tt = Math.min(k, land);
      b.position.copy(at).addScaledVector(dir, d.from + 0.05 + vx * tt).setY(Math.max(0.006, 0.01 + vy * tt - 4.9 * tt * tt));
      b.position.z += vz * tt;
      b.rotation.set(k * 9 * (i + 1), k * 5, k * 7);
      if (k >= land) b.rotation.set(0, i, 0);
    });
  };

  /** the clubhead's path through the swing as a thin tube; it grows with the swing (the share of its length
   *  reached by each moment) and starts again with every run */
  const HEAD = (len: number) => new THREE.Vector3(0, len - 0.01, 0.04);
  const buildTrace = (p: Player): Player['trace'] => {
    // from the address until shortly after the hit – beyond, the club wraps round the body and the line would only clutter
    const n = 150;
    const end = p.swing.hit ? Math.min(p.prep.length, p.swing.hit.at + 0.3) : p.prep.length;
    const times: number[] = [];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const time = (end * i) / n;
      place(p, time);
      times.push(time);
      pts.push(p.club.localToWorld(HEAD(CLUB_LEN[p.swing.club])));
    }
    const share = [0];
    for (let i = 1; i < pts.length; i++) share.push(share[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = share[share.length - 1];
    if (total < 0.3) return null;
    for (let i = 0; i < share.length; i++) share[i] /= total;
    const segs = 240;
    // the tube needs a direction everywhere: points where the club stands still (address, holds) are left out
    const path = pts.filter((x, i) => i === 0 || x.distanceTo(pts[i - 1]) > 0.002);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), segs, 0.0045, 5, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#79a128', transparent: true, opacity: 0.75, depthWrite: false }));
    mesh.renderOrder = 1;
    return { mesh, times, share };
  };
  const placeTrace = (p: Player, time: number) => {
    const tr = p.trace;
    if (!tr) return;
    let i = 0;
    while (i < tr.times.length - 1 && tr.times[i + 1] <= time) i++;
    const segs = 240;
    const k = Math.floor(tr.share[i] * segs);
    tr.mesh.visible = k > 0;
    tr.mesh.geometry.setDrawRange(0, k * 5 * 6);
  };

  /** where the ball is a time after the hit (the flight of its shot, its start line and bend) */
  const ballAt = (p: { swing: Swing; x: number; z: number }, s: number) => {
    const at = ballPos(p);
    const h = p.swing.hit!;
    const [dx, dy] = ballFlight(h.shot, s);
    const k = h.scale ?? 1;
    at.x += dx * k;
    at.y += dy * k;
    if (h.side) at.z += (h.side.start * dx + h.side.bend * dx * dx) * k;
    return at;
  };
  /** the tracer: the flight of a shot through the air (no putt, no ball that stays near) as a thin white tube, drawn up
   *  to the ball while it flies */
  const buildTracer = (p: Player): Player['tracer'] => {
    const h = p.swing.hit;
    if (!h || h.shot === 'putt') return null;
    const times: number[] = [];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const sec = (2.2 * i) / 80;
      const at = ballAt(p, sec);
      if (at.x - ballPos(p).x > 12) break;
      times.push(sec);
      pts.push(at);
    }
    const share = [0];
    for (let i = 1; i < pts.length; i++) share.push(share[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = share[share.length - 1];
    if (total < 1) return null;
    for (let i = 0; i < share.length; i++) share[i] /= total;
    const path = pts.filter((x, i) => i === 0 || x.distanceTo(pts[i - 1]) > 0.002);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 160, 0.012, 5, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.renderOrder = 1;
    mesh.visible = false;
    return { mesh, times, share };
  };
  const placeTracer = (p: Player, time: number) => {
    const tr = p.tracer;
    const h = p.swing.hit;
    if (!tr || !h) return;
    const s = time - h.at;
    let i = 0;
    while (i < tr.times.length - 1 && tr.times[i + 1] <= s) i++;
    const k = s <= 0 ? 0 : Math.floor(tr.share[i] * 160);
    tr.mesh.visible = k > 0;
    tr.mesh.geometry.setDrawRange(0, k * 5 * 6);
  };

  /** the ball: still until the club arrives, then rolling to a stop or flying away towards the target */
  const placeBall = (p: Player, time: number) => {
    const at = ballPos(p);
    const h = p.swing.hit;
    p.ball.visible = true;
    if (h && time > h.at) {
      const s = time - h.at;
      // the same flights as the drawings: rolling, low with roll, high and soft, out of the sand, long away
      at.copy(ballAt(p, s));
      p.ball.visible = at.x - ballPos(p).x < 12;
      if (p.cup?.drop != null && s >= p.cup.drop) at.set(p.cup.at.x, Math.max(-0.05, 0.0215 - (s - p.cup.drop) * 0.6), p.cup.at.z);
    }
    p.ball.position.copy(at);
  };

  const DIRS: Record<View, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.12, 1).normalize(),
    side: new THREE.Vector3(-1, 0.12, 0).normalize(),
    angle: new THREE.Vector3(-0.72, 0.3, 0.72).normalize(),
    above: new THREE.Vector3(0, 0.95, 0.62).normalize(),
  };
  const swingBounds = () => {
    if (!players.length) return null;
    const box = new THREE.Box3();
    for (let i = 0; i <= 16; i++)
      for (const p of players) {
        place(p, (length * i) / 16);
        box.expandByObject(p.rig.root);
        box.expandByObject(p.club);
      }
    for (const p of players) box.expandByObject(p.ball);
    return box;
  };
  let close: { at: THREE.Vector3; dist: number } | null = null;
  const placeCamera = () => {
    if (close) {
      camera.position.copy(close.at).addScaledVector(DIRS[view], close.dist);
      camera.lookAt(close.at);
      return;
    }
    bounds ??= swingBounds();
    const dir = DIRS[view];
    if (!bounds || bounds.isEmpty()) {
      camera.position.set(0, 1.2, 3.6);
      camera.lookAt(0, 0.9, 0);
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    let hx = 0;
    let hy = 0;
    let depth = 0;
    const c = new THREE.Vector3();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          c.set(x, y, z).sub(center);
          hx = Math.max(hx, Math.abs(c.dot(right)));
          hy = Math.max(hy, Math.abs(c.dot(up)));
          depth = Math.max(depth, c.dot(dir));
        }
    const vf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const d = Math.max(hy / Math.tan(vf), hx / Math.tan(hf)) * 1.12 + depth;
    camera.position.copy(center).addScaledVector(dir, Math.max(1.2, d));
    camera.lookAt(center);
  };

  const update = () => {
    if (!players.length) return;
    // the loop: the swing, a rest in the finish, again
    const loop = length + 1.2;
    const tt = ((t % loop) + loop) % loop;
    let s = { label: undefined as L | undefined, step: 0 };
    players.forEach((p, i) => {
      const r = place(p, tt);
      if (i === 0) s = r;
      placeBall(p, tt);
      placeDivot(p, tt);
      placeTrace(p, tt);
      placeTracer(p, tt);
    });
    if (labelCb && s.step !== lastStep) {
      lastStep = s.step;
      labelCb(s.label, s.step);
    }
  };
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (playing) t += dt * speed;
    update();
    renderer.render(scene, camera);
  };
  const resize = () => {
    const w = canvas.clientWidth || 340;
    const h = canvas.clientHeight || 255;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    placeCamera();
  };
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => (visible = es.some((e) => e.isIntersecting))) : null;
  io?.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  const setSwings = (list: { swing: Swing; x?: number; z?: number }[]) => {
    for (const p of players) {
      scene.remove(p.rig.root, p.club, p.ball, p.tee, p.extras);
      for (const o of [p.rig.root, p.club, p.ball, p.tee, p.extras])
        o.traverse((x) => {
          const m = x as THREE.Mesh;
          m.geometry?.dispose();
          for (const y of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) y.dispose();
        });
    }
    players = list.map(({ swing, x = 0, z = 0 }) => {
      const rig = buildRig();
      const club = buildClub(swing.club);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
      ball.castShadow = true;
      const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.04, 8), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.6 }));
      tee.visible = !!swing.tee;
      // the drill aids (orange like the alignment sticks of the drawings)
      const extras = new THREE.Group();
      const stickMat = new THREE.MeshStandardMaterial({ color: COLORS.stick, roughness: 0.5 });
      if (swing.props?.includes('stickHip')) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.05, 8), stickMat);
        s.position.set(x - (swing.stance ?? 0.36) / 2 - 0.13, 0.5, z - 0.02);
        s.castShadow = true;
        extras.add(s);
      }
      if (swing.props?.includes('towel')) {
        const towel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.05), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }));
        towel.position.set(0, 0.1, 0.13);
        towel.castShadow = true;
        rig.joints.chest.add(towel);
      }
      if (swing.props?.includes('stickGrip')) {
        // the stick continues the shaft above the hands, past the lead hip
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.85, 8), stickMat);
        s.position.y = -0.42;
        s.castShadow = true;
        club.add(s);
      }
      // the divot: dark soil (light sand in a bunker), bits of turf with the grass on top
      const dv = divotOf(swing);
      let divot: Player['divot'] = null;
      if (dv) {
        const mark = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: swing.sand ? '#bfae84' : '#6b5638', roughness: 1 }));
        mark.rotation.set(-Math.PI / 2, dv.yaw, 0, 'YXZ');
        mark.receiveShadow = true;
        mark.visible = false;
        const turf = new THREE.MeshStandardMaterial({ color: '#6a9e45', roughness: 1 });
        const bits = swing.sand
          ? []
          : [0, 1, 2, 3].map((i) => {
              const b = new THREE.Mesh(new THREE.BoxGeometry(0.035 - i * 0.005, 0.01, 0.025), turf);
              b.castShadow = true;
              b.visible = false;
              return b;
            });
        extras.add(mark, ...bits);
        divot = { mark, bits, ...dv };
      }
      const at = ballPos({ swing, x, z });
      ball.position.copy(at);
      tee.position.set(at.x, 0.02, at.z);
      scene.add(rig.root, club, ball, tee, extras);
      return { rig, club, ball, tee, extras, divot, trace: null, tracer: null, cup: null, swing, x, z, prep: prepare({ rig, swing, x, z }) } as Player;
    });
    const alongLine = players.some((p) => p.x !== players[0].x);
    for (const p of players) {
      p.trace = buildTrace(p);
      if (p.trace) p.extras.add(p.trace.mesh);
      // golfers side by side along the target line: the left one's ball flies past the right one – no tracer there
      p.tracer = alongLine ? null : buildTracer(p);
      if (p.tracer) p.extras.add(p.tracer.mesh);
      // a putt rolls to a hole just short of where it would stop: dark, with the white liner at its edge; the ball drops in
      // when it reaches it (a pushed or pulled putt rolls past and stops beside it)
      const h = p.swing.hit;
      if (h?.shot === 'putt' && p.swing.club === 'putter') {
        const at = ballPos(p);
        at.x += 1.74 * (h.scale ?? 1);
        at.y = 0.003;
        let drop: number | null = null;
        for (let s = 0; s < 4 && drop === null; s += 0.01) {
          const b = ballAt(p, s);
          if (Math.hypot(b.x - at.x, b.z - at.z) < 0.04) drop = s;
        }
        p.cup = { at, drop };
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.054, 28), new THREE.MeshBasicMaterial({ color: '#1f272c' }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.copy(at);
        const liner = new THREE.Mesh(new THREE.RingGeometry(0.048, 0.054, 28), new THREE.MeshBasicMaterial({ color: '#f2f4f3' }));
        liner.rotation.x = -Math.PI / 2;
        liner.position.copy(at).setY(0.0035);
        p.extras.add(hole, liner);
      }
      // a stick in the ground just behind the seat at address (the coach's check for early extension): the seat stays on
      // it through the swing – or leaves it towards the ball
      if (p.swing.props?.includes('stickSeat')) {
        place(p, 0);
        const seat = p.rig.joints.pelvis.getWorldPosition(new THREE.Vector3());
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.05, 8), new THREE.MeshStandardMaterial({ color: COLORS.stick, roughness: 0.5 }));
        s.position.set(seat.x, 0.5, seat.z - 0.11);
        s.castShadow = true;
        p.extras.add(s);
      }
    }
    length = Math.max(...players.map((p) => p.prep.length));
    const first = list[0].swing;
    (pad.material as THREE.MeshStandardMaterial).color.set(first.sand ? '#e3cf96' : '#8fc069'); // ci-allow: bunker sand
    pad.scale.setScalar(list.length > 1 ? 1.8 : 1);
    bounds = null;
    t = 0;
    lastStep = -1;
    view = first.view ?? 'front';
    placeCamera();
    update();
  };

  return {
    setSwing: (s) => setSwings([{ swing: s }]),
    setSwings,
    setView(v) {
      view = v;
      placeCamera();
    },
    setPlaying(on) {
      playing = on;
    },
    setSpeed(k) {
      speed = k;
    },
    seek(x) {
      t = x;
      update();
      renderer.render(scene, camera);
    },
    onLabel(cb) {
      labelCb = cb;
    },
    closeUp(at, dist = 0.6) {
      close = at ? { at: new THREE.Vector3(...at), dist } : null;
      placeCamera();
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      io?.disconnect();
      // the GPU memory of every shape and material, then the context itself (the canvas is not used again)
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const x of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) x.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
