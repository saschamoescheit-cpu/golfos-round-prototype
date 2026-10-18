import * as THREE from 'three';
import { applyPose, BODY, buildRig, COLORS, SHAFT_IN_HAND, type Pose, type Rig, type Rot } from '../../mobility/anim3d/rig';
import type { L, Shot } from '../types';
import { ballFlight } from '../motion';

// The 3D swing videos of Training (Sascha 17.10.2026: "3D animated videos would be better than still pictures").
// The golfer of the Agility 3D videos (same figure, same stage, same camera views), here holding a club with both
// hands: the trunk turns by key poses, the hands and the club move on the swing arc, and the arms and legs are solved
// to reach them (two-bone inverse kinematics) – so both hands stay on the grip and the feet stay on the ground.
//
// World: y up, the player faces +z (the ball lies in front of the toes), the target is +x (to the right face-on).

export type View = 'front' | 'side' | 'angle' | 'above' | 'face';
export type Club3D = 'iron' | 'wedge' | 'driver' | 'putter' | 'hybrid';
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
  /** the stance at this key (metres between the ankles): the lead foot steps there from the swing's stance */
  stance?: number;
  /** the lead foot lifted this high (metres) – on its way in a step */
  step?: number;
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
  /** lift: the flight higher (uphill, the slope adds loft) or flatter (downhill) */
  hit?: { at: number; shot: Shot; scale?: number; lift?: number; side?: { start: number; bend: number }; /** the ball hits something (a branch) at this x and drops */ stop?: number };
  /** a lie on a slope (degrees): up – the ground rises towards the target (uphill +, downhill −); side – it rises
   *  towards the ball (ball above the feet +, below the feet −) */
  slope?: { up?: number; side?: number };
  /** the club gripped shorter (metres), as above the feet */
  choke?: number;
  /** the ball flight laws at impact (degrees, + right of the target): the club's path and where the face looks –
   *  drawn as two arrows on the ground at the ball (green the path, white the face) from impact on */
  laws?: { path: number; face: number };
  /** more balls from the same spot, each with its own start line and bend (the nine ball flights) */
  fan?: { start: number; bend: number }[];
  /** offer the close view of the clubface: where the ball met it, marked from impact on */
  faceView?: boolean;
  /** a landing spot and a hole (metres along the target line from the ball): a ring of 1 m where the ball should land,
   *  the hole where it should stop – the ball drops in when it gets there */
  landing?: { carry: number; hole?: number };
  /** the ball sits this deep in the ground (m): plugged in the sand (fried egg), in an old divot */
  sunk?: number;
  /** the trail foot pulled back and up on its toes – the weight on the lead foot (bunker drill) */
  trailToe?: boolean;
  /** the ball sits on a tee (driver) */
  tee?: boolean;
  /** only the lead hand on the club – the trail hand rests on the chest */
  oneHand?: boolean;
  /** played from sand (bunker) */
  sand?: boolean;
  /** drill aids: a stick in the ground outside the trail hip, a towel under both arms, a stick held with the grip */
  props?: ('stickHip' | 'towel' | 'stickGrip' | 'stickSeat' | 'teeGate' | 'startGate' | 'groundLine' | 'teeAfter' | 'teeFlies' | 'secondTee' | 'insideGate' | 'headcover' | 'impactBag' | 'sandLine' | 'sandFrame' | 'trees' | 'oldDivot' | 'faceSand')[];
  /** the ball very low on its tee (fairway wood off a tee) */
  lowTee?: boolean;
  /** no ball: a drill swung into an impact bag */
  noBall?: boolean;
  view?: View;
}

const CLUB_LEN: Record<Club3D, number> = { driver: 1.06, iron: 0.86, wedge: 0.82, putter: 0.8, hybrid: 0.96 };
/** the middle of the face from the hosel towards the toe (metres) – that point meets the ball, not the heel */
const SWEET: Record<Club3D, number> = { driver: 0.055, iron: 0.04, wedge: 0.04, putter: 0.045, hybrid: 0.045 };

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
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.045, 10), kind === 'driver' || kind === 'hybrid' ? m('#2a3136', 0.4, 0.3) : steel);
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
  } else if (kind === 'hybrid') {
    // a small wood: a flat, rounded head
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.045, 22, 14), m('#2a3136', 0.32, 0.4));
    crown.scale.set(0.85, 0.55, 1.1);
    crown.position.set(0.01, -0.016, 0.045);
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
  g.userData.head = head;
  // the face's plane in the head's frame (where a ball mark sits)
  g.userData.faceX = kind === 'driver' ? -0.042 : kind === 'hybrid' ? -0.028 : kind === 'putter' ? -0.0105 : -0.0068;
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
  // the ground: flat, or one tilted plane through the players' feet for a lie on a slope
  const ground = new THREE.Group();
  scene.add(ground);
  let groundQ = new THREE.Quaternion();
  let groundN = new THREE.Vector3(0, 1, 0);
  /** the height of the ground at a place (0 on the flat) */
  const heightAt = (x: number, z: number) => -(groundN.x * x + groundN.z * z) / groundN.y;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat('#7cb257'));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  ground.add(floor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), floorMat('#8fc069'));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.001;
  pad.receiveShadow = true;
  ground.add(pad);
  // the target: a flag on a small green down the target line – from behind it shows where the ball is meant to go
  const green = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), floorMat('#93c86c'));
  green.rotation.x = -Math.PI / 2;
  green.position.set(6.4, 0.002, 0.3);
  ground.add(green);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 8), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.5 }));
  pin.position.set(6.4, 1.05, 0.3);
  scene.add(pin);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: '#79a128', roughness: 0.8, side: THREE.DoubleSide }));
  cloth.position.set(6.4, 1.92, 0.3 - 0.25);
  cloth.rotation.y = Math.PI / 2;
  scene.add(cloth);

  /** things of the scene itself, rebuilt with every video: two trees with a branch across the gap (the punch) */
  const sceneProps = new THREE.Group();
  scene.add(sceneProps);

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
    /** drill aids the club sends flying */
    aids: { m: THREE.Object3D; from: THREE.Vector3; delay: number }[];
    /** the other balls of a fan, each with its tracer */
    fan: { ball: THREE.Mesh; side: { start: number; bend: number }; tracer: Player['tracer'] }[];
    /** the arrows of the ball flight laws */
    laws: THREE.Group | null;
    /** the ball's mark on the face */
    mark: THREE.Mesh | null;
    /** the ball's flight drawn behind it, as the tracer on television – so the curve is seen even when the ball is small */
    tracer: { mesh: THREE.Mesh; times: number[]; share: number[] } | null;
    /** a putt's hole and the moment the ball drops in (none when it misses) */
    cup: { at: THREE.Vector3; drop: number | null } | null;
    /** the sand thrown out when the club enters the sand behind the ball (a bunker shot) */
    splash: THREE.InstancedMesh | null;
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
    return new THREE.Vector3(p.x + b[0], (p.swing.tee ? (p.swing.lowTee ? 0.04 : 0.06) : 0.0215 - (p.swing.sunk ?? 0)) + heightAt(p.x + b[0], p.z + b[1]), p.z + b[1]);
  };

  /** the trunk of a key (or between two) put on the rig, the limbs left for the solver */
  const poseTrunk = (p: { rig: Rig; x: number; z: number; swing?: Swing }, body: SwingKey['body'], shift: number, drop: number, push = 0) => {
    // on a slope: the shoulders parallel to it (leaning away from the target uphill, towards it downhill); with the
    // ball above the feet more upright, below the feet more bent at the hips and the knees; the body as high as the
    // ground under its feet
    const up = p.swing?.slope?.up ?? 0;
    const side = p.swing?.slope?.side ?? 0;
    const j = { ...body };
    if (up || side) {
      const add = (id: keyof typeof j, d: [number, number, number]) => {
        const r = j[id] ?? [0, 0, 0];
        j[id] = [r[0] + d[0], r[1] + d[1], r[2] + d[2]];
      };
      add('pelvis', [side > 0 ? -side * 1.1 : -side * 0.9, 0, up * 0.6]);
      add('spine', [0, 0, up * 0.4]);
    }
    const knees = side < 0 ? -side * 0.006 : 0;
    // both hands closed around the grip (the fingers of the Agility figure)
    const pose: Pose = { j, at: [p.x + shift, p.z + push - 0.06], y: drop - knees + heightAt(p.x + shift, p.z), gripL: 1, gripR: 1 };
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
      const head = ballPos(p).add(new THREE.Vector3(-0.04, 0.005, -SWEET[s.club])).add(new THREE.Vector3(...(k.miss ?? [0, 0, 0])));
      const dir = k.club === 'ball' ? head.clone().sub(hands).normalize() : new THREE.Vector3(...k.club).normalize();
      // at the ball the clubhead sits exactly behind it: the hands slide along the shaft to the club's length
      if (k.club === 'ball') hands = head.clone().addScaledVector(dir, -(CLUB_LEN[s.club] - 0.05 - (s.choke ?? 0)));
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

    // the hands on the grip: the fingers of the shared figure close around a shaft that runs along the hand's z axis
    // through SHAFT_IN_HAND (Agility 18.10.2026) – so each hand turns about the shaft until its wrist points to its
    // shoulder (the least bend at the wrist); along the shaft z points to the butt, so the back of the lead hand and the
    // palm of the trail hand face where the clubface looks
    const J = rig.joints;
    const handQ = (grip: THREE.Vector3, shoulder: THREE.Object3D) => {
      const z = dir.clone().multiplyScalar(-1);
      const y = shoulder.getWorldPosition(new THREE.Vector3()).sub(grip);
      y.sub(z.clone().multiplyScalar(y.dot(z))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    const handLQ = handQ(handsL, J.shoulderL);
    const handRQ = handQ(handsR, J.shoulderR);
    // the right hand is the mirror of the left: its shaft point lies on the other side of the palm
    const wristL = handsL.clone().sub(new THREE.Vector3(SHAFT_IN_HAND[0], SHAFT_IN_HAND[1], SHAFT_IN_HAND[2]).applyQuaternion(handLQ));
    const wristR = handsR.clone().sub(new THREE.Vector3(-SHAFT_IN_HAND[0], SHAFT_IN_HAND[1], SHAFT_IN_HAND[2]).applyQuaternion(handRQ));
    const setHand = (wrist: THREE.Object3D, hq: THREE.Quaternion) => {
      wrist.parent!.getWorldQuaternion(tmpQ);
      wrist.quaternion.copy(tmpQ.clone().invert().multiply(hq));
      wrist.updateMatrixWorld(true);
    };
    // elbows point down and a little out, away from the body
    const poleL = chestP.clone().add(new THREE.Vector3(0.5, -1, 0.1).applyQuaternion(q));
    const poleR = chestP.clone().add(new THREE.Vector3(-0.5, -1, 0.1).applyQuaternion(q));
    twoBone(J.shoulderL, J.elbowL, BODY.upperArm, BODY.forearm, wristL, poleL);
    // one-handed: the trail hand rests flat on the chest
    const rest = chestP.clone().add(new THREE.Vector3(0.02, 0.1, 0.17).applyQuaternion(q));
    twoBone(J.shoulderR, J.elbowR, BODY.upperArm, BODY.forearm, swing.oneHand ? rest : wristR, poleR);
    setHand(J.wristL, handLQ);
    // one-handed the trail hand lies open on the chest
    if (swing.oneHand) rig.setGrip(1, 0.1);
    if (swing.oneHand) aim(J.wristR, rest, rest.clone().add(new THREE.Vector3(1, 0.3, 0).applyQuaternion(q)));
    else setHand(J.wristR, handRQ);

    // legs: the ankles stay where they stand; the trail heel comes up in the finish
    const s0 = swing.stance ?? 0.36;
    const half = s0 / 2;
    const wide = mix((x) => x.stance ?? s0);
    const lift = Math.max(0, mix((x) => x.step ?? 0));
    const heel = swing.trailToe ? 1 : lerp(a.heel ?? 0, b.heel ?? 0, k);
    const back = swing.trailToe ? 0.2 : 0;
    const ankleL = new THREE.Vector3(p.x - half + wide, BODY.ankleH + lift + heightAt(p.x - half + wide, p.z), p.z);
    const ankleR = new THREE.Vector3(p.x - half + heel * 0.06, BODY.ankleH + heel * 0.11 + heightAt(p.x - half, p.z), p.z - heel * 0.03 - back);
    const pelvisP = J.pelvis.getWorldPosition(new THREE.Vector3());
    twoBone(J.hipL, J.kneeL, BODY.thigh, BODY.shin, ankleL, pelvisP.clone().add(new THREE.Vector3(0.25, 0, 1)));
    twoBone(J.hipR, J.kneeR, BODY.thigh, BODY.shin, ankleR, pelvisP.clone().add(new THREE.Vector3(-0.25 + heel * 0.5, 0, 1)));
    // feet flat, toes a little out; the trail foot up on its toes
    // the soles flat on the ground, also on a slope
    const footQ = (yaw: number, pitch: number) => groundQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ')));
    for (const [joint, wq] of [
      [J.ankleL, footQ(14, 0)],
      [J.ankleR, footQ(-14 + heel * 30, heel * 50)],
    ] as const) {
      joint.parent!.getWorldQuaternion(tmpQ);
      joint.quaternion.copy(tmpQ.clone().invert().multiply(wq));
    }
    rig.root.updateMatrixWorld(true);

    // the club in the hands
    p.club.position.copy(handsL).addScaledVector(dir, -0.05 - (swing.choke ?? 0));
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
    d.mark.position.copy(at).addScaledVector(dir, d.from + (d.len * u) / 2);
    d.mark.position.y = heightAt(d.mark.position.x, d.mark.position.z) + 0.003;
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
      b.position.copy(at).addScaledVector(dir, d.from + 0.05 + vx * tt);
      b.position.y = heightAt(b.position.x, b.position.z) + Math.max(0.006, 0.01 + vy * tt - 4.9 * tt * tt);
      b.position.z += vz * tt;
      b.rotation.set(k * 9 * (i + 1), k * 5, k * 7);
      if (k >= land) b.rotation.set(0, i, 0);
    });
  };

  /** the splash: grains of sand flying forward and up from where the club enters, falling back within a second */
  const SPLASH = 40;
  const grain = (i: number, k: number) => {
    const r = (n: number) => Math.abs(Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
    return { vx: 0.5 + 1.8 * r(1), vy: 0.9 + 1.9 * r(2), vz: (r(3) - 0.5) * 1.1, size: 0.6 + 0.8 * r(4), k };
  };
  const tmpM = new THREE.Matrix4();
  const placeSplash = (p: Player, time: number) => {
    const sp = p.splash;
    const h = p.swing.hit;
    if (!sp || !h) return;
    const k = time - (h.at - 0.02);
    sp.visible = k > 0 && k < 1.3;
    if (!sp.visible) return;
    const at = ballPos(p);
    for (let i = 0; i < SPLASH; i++) {
      const g = grain(i, k);
      const y = 0.01 + g.vy * k - 4.9 * k * k;
      const s = y < 0 ? 0 : g.size * Math.max(0.2, 1 - k / 1.3);
      tmpM.makeScale(s, s, s).setPosition(at.x - 0.04 + g.vx * k, Math.max(0, y), at.z + g.vz * k);
      sp.setMatrixAt(i, tmpM);
    }
    sp.instanceMatrix.needsUpdate = true;
  };

  /** a tee standing in the ground: `above` metres of it show */
  const teeMesh = (above: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.003, 0.054, 10), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.6 }));
    m.castShadow = true;
    m.userData.above = above;
    return m;
  };
  const standAt = (m: THREE.Object3D, x: number, z: number, above = 0.04) => m.position.set(x, heightAt(x, z) + above - 0.027, z);
  /** the drill aids around the ball (18.10.2026): tee gates, a line on the grass, a tee after the ball, a headcover,
   *  an impact bag; `fly` are the ones the club sends flying (with the time after the hit they start) */
  const buildAids = (p: Player) => {
    const props = p.swing.props ?? [];
    const bp = ballPos(p);
    const fly: { m: THREE.Object3D; from: THREE.Vector3; delay: number }[] = [];
    const add = (m: THREE.Object3D) => (p.extras.add(m), m);
    // a plugged ball: a ring of sand thrown up around it (the fried egg); an old divot: a bare, sunken strip
    if (p.swing.sunk && p.swing.sand) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.01, 8, 24), new THREE.MeshStandardMaterial({ color: '#e3cf96', roughness: 1 })); // ci-allow: bunker sand
      rim.rotation.x = Math.PI / 2;
      rim.position.set(bp.x, heightAt(bp.x, bp.z) + 0.002, bp.z);
      add(rim);
    }
    if (props.includes('oldDivot')) {
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.004, 0.06), new THREE.MeshStandardMaterial({ color: '#6e5a3c', roughness: 1 }));
      hole.position.set(bp.x + 0.02, heightAt(bp.x, bp.z) + 0.001, bp.z);
      hole.receiveShadow = true;
      add(hole);
    }
    if (props.includes('teeGate')) {
      // just outside the putter's heel and toe at address – the head passes between them
      standAt(add(teeMesh(0.04)), bp.x - 0.04, bp.z - 0.064);
      standAt(add(teeMesh(0.04)), bp.x - 0.04, bp.z + 0.064);
    }
    if (props.includes('startGate')) {
      // 40 cm in front of the ball on the start line, a little more than a ball apart
      standAt(add(teeMesh(0.04)), bp.x + 0.4, bp.z - 0.031);
      standAt(add(teeMesh(0.04)), bp.x + 0.4, bp.z + 0.031);
    }
    if (props.includes('insideGate')) {
      // behind the ball outside, in front of it inside: only a path from the inside passes
      standAt(add(teeMesh(0.045)), bp.x - 0.15, bp.z + 0.05);
      standAt(add(teeMesh(0.045)), bp.x + 0.15, bp.z - 0.05);
    }
    if (props.includes('secondTee')) standAt(add(teeMesh(0.01)), bp.x + 0.25, bp.z);
    if (props.includes('groundLine')) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.8), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 1 }));
      line.quaternion.copy(groundQ);
      line.position.set(bp.x, heightAt(bp.x, bp.z) + 0.002, bp.z);
      line.receiveShadow = true;
      add(line);
    }
    // lines drawn in the sand with the rake handle: a line across the stance 4 cm behind the ball, or a banknote frame
    // (15 × 6 cm) around it with the ball in its front half
    const groove = (len: number, wide: number, x: number, z: number, along: boolean) => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(along ? len : wide, 0.002, along ? wide : len), new THREE.MeshStandardMaterial({ color: '#9c8a62', roughness: 1 }));
      g.quaternion.copy(groundQ);
      g.position.set(x, heightAt(x, z) + 0.002, z);
      g.receiveShadow = true;
      add(g);
    };
    if (props.includes('sandLine')) groove(0.8, 0.012, bp.x - 0.04, bp.z, false);
    if (props.includes('sandFrame')) {
      groove(0.15, 0.008, bp.x - 0.025, bp.z - 0.03, true);
      groove(0.15, 0.008, bp.x - 0.025, bp.z + 0.03, true);
      groove(0.068, 0.008, bp.x - 0.1, bp.z, false);
      groove(0.068, 0.008, bp.x + 0.05, bp.z, false);
    }
    if (props.includes('teeAfter')) {
      // pushed in all the way 6 cm in front of the ball – the divot cuts it out
      const m = add(teeMesh(0.004));
      standAt(m, bp.x + 0.065, bp.z, 0.004);
      fly.push({ m, from: m.position.clone(), delay: 0.03 });
    }
    if (props.includes('teeFlies')) fly.push({ m: p.tee, from: p.tee.position.clone(), delay: 0.005 });
    if (props.includes('headcover')) {
      // 10 cm outside and 10 cm behind the ball – where a path from the outside would come in
      const cover = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 6, 12), new THREE.MeshStandardMaterial({ color: '#3f5f73', roughness: 0.9 }));
      cover.rotation.z = Math.PI / 2;
      cover.position.set(bp.x - 0.1, heightAt(bp.x - 0.1, bp.z + 0.1) + 0.045, bp.z + 0.1);
      cover.castShadow = true;
      add(cover);
    }
    if (props.includes('impactBag')) {
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 24), new THREE.MeshStandardMaterial({ color: '#4a5560', roughness: 0.95 }));
      bag.rotation.z = Math.PI / 2;
      bag.position.set(bp.x + 0.2, heightAt(bp.x + 0.2, bp.z) + 0.17, bp.z);
      bag.castShadow = true;
      add(bag);
    }
    return fly;
  };
  /** a tee the club meets flies forward, tumbling, and lies where it lands */
  const placeAids = (p: Player, time: number) => {
    const h = p.swing.hit;
    for (const a of p.aids) {
      const k = h ? time - h.at - a.delay : -1;
      if (k <= 0) {
        a.m.position.copy(a.from);
        a.m.rotation.set(0, 0, 0);
        continue;
      }
      const land = (2 * 1.3) / 9.81;
      const tt = Math.min(k, land);
      a.m.position.set(a.from.x + 1.4 * tt, Math.max(heightAt(a.from.x + 1.4 * tt, a.from.z) + 0.006, a.from.y + 1.3 * tt - 4.9 * tt * tt), a.from.z);
      a.m.rotation.set(0, 0, k >= land ? Math.PI / 2 : -k * 14);
    }
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
  const ballAt = (p: { swing: Swing; x: number; z: number }, s: number, sideOf?: { start: number; bend: number }) => {
    const at = ballPos(p);
    const h = { ...p.swing.hit!, ...(sideOf ? { side: sideOf } : {}) };
    const [dx, dy] = ballFlight(h.shot, s);
    const k = h.scale ?? 1;
    const start = at.y - heightAt(at.x, at.z);
    at.x += dx * k;
    if (h.side) at.z += (h.side.start * dx + h.side.bend * dx * dx) * k;
    at.y = heightAt(at.x, at.z) + start + dy * k * (h.lift ?? 1);
    if (h.stop != null && at.x > h.stop) {
      // blocked: find when it got there, then it bounces back a little and drops to the ground
      let lo = 0;
      let hi = s;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (ballAt({ ...p, swing: { ...p.swing, hit: { ...h, stop: undefined } } }, mid).x > h.stop) hi = mid;
        else lo = mid;
      }
      const hitAt = ballAt({ ...p, swing: { ...p.swing, hit: { ...h, stop: undefined } } }, lo, sideOf);
      const t = s - lo;
      at.set(hitAt.x - 0.6 * (1 - Math.exp(-3 * t)), 0, hitAt.z);
      at.y = Math.max(heightAt(at.x, at.z) + 0.0215, hitAt.y - 4.9 * t * t);
    }
    return at;
  };
  /** the tracer: the flight of a shot through the air (no putt, no ball that stays near) as a thin white tube, drawn up
   *  to the ball while it flies */
  const buildTracer = (p: Player, sideOf?: { start: number; bend: number }): Player['tracer'] => {
    const h = p.swing.hit;
    if (!h || h.shot === 'putt' || p.swing.noBall) return null;
    const times: number[] = [];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const sec = (2.2 * i) / 80;
      const at = ballAt(p, sec, sideOf);
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
    p.ball.visible = !p.swing.noBall;
    if (h && time > h.at) {
      const s = time - h.at;
      // the same flights as the drawings: rolling, low with roll, high and soft, out of the sand, long away
      at.copy(ballAt(p, s));
      p.ball.visible = !p.swing.noBall && at.x - ballPos(p).x < 12;
      if (p.cup?.drop != null && s >= p.cup.drop) at.set(p.cup.at.x, Math.max(-0.05, 0.0215 - (s - p.cup.drop) * 0.6), p.cup.at.z);
    }
    p.ball.position.copy(at);
  };

  const DIRS: Record<View, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.12, 1).normalize(),
    side: new THREE.Vector3(-1, 0.12, 0).normalize(),
    angle: new THREE.Vector3(-0.72, 0.3, 0.72).normalize(),
    above: new THREE.Vector3(0, 0.95, 0.62).normalize(),
    face: new THREE.Vector3(1, 0.18, 0.08).normalize(),
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
    // the face: close at the first golfer's ball, looking back from the target at the clubface
    if (view === 'face' && players.length) {
      const at = ballPos(players[0]).add(new THREE.Vector3(-0.03, 0.02, 0));
      camera.position.copy(at).addScaledVector(DIRS.face, 0.65);
      camera.lookAt(at);
      return;
    }
    bounds ??= swingBounds();
    // two golfers seen from behind (one beside the other across the target line): from above they are looked at from
    // behind as well, so the fault stays on the left as the words say
    const behindPair = players.length > 1 && players.some((p) => p.z !== players[0].z);
    const dir = view === 'above' && behindPair ? new THREE.Vector3(-0.62, 0.95, 0).normalize() : DIRS[view];
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
    // room above and below for the buttons over the picture (pause, slow motion at the top, the views at the bottom)
    const d = Math.max((hy * 1.28) / Math.tan(vf), (hx * 1.12) / Math.tan(hf)) + depth;
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
      placeSplash(p, tt);
      placeAids(p, tt);
      const h = p.swing.hit;
      const sh = h ? tt - h.at : -1;
      for (const f of p.fan) {
        f.ball.position.copy(sh > 0 ? ballAt(p, sh, f.side) : ballPos(p));
        f.ball.visible = sh <= 0 || f.ball.position.x - ballPos(p).x < 12;
        if (f.tracer) {
          let i = 0;
          while (i < f.tracer.times.length - 1 && f.tracer.times[i + 1] <= sh) i++;
          const k = sh <= 0 ? 0 : Math.floor(f.tracer.share[i] * 160);
          f.tracer.mesh.visible = k > 0;
          f.tracer.mesh.geometry.setDrawRange(0, k * 5 * 6);
        }
      }
      if (p.laws) p.laws.visible = sh > -0.02;
      if (p.mark) p.mark.visible = sh >= 0;
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
    // the ground of this video: flat or the slope of its first swing (the pair stands on the same hill)
    const sl = list[0].swing.slope;
    groundQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-(sl?.side ?? 0)), 0, THREE.MathUtils.degToRad(sl?.up ?? 0), 'XYZ'));
    groundN = new THREE.Vector3(0, 1, 0).applyQuaternion(groundQ);
    ground.quaternion.copy(groundQ);
    pin.position.y = 1.05 + heightAt(pin.position.x, pin.position.z);
    cloth.position.y = 1.92 + heightAt(pin.position.x, pin.position.z);
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
        mark.quaternion.copy(groundQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, dv.yaw, 0, 'YXZ'))));
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
      tee.position.set(at.x, (swing.lowTee ? 0 : 0.02) + heightAt(at.x, at.z), at.z);
      scene.add(rig.root, club, ball, tee, extras);
      return { rig, club, ball, tee, extras, divot, trace: null, tracer: null, cup: null, splash: null, aids: [], fan: [], laws: null, mark: null, swing, x, z, prep: prepare({ rig, swing, x, z }) } as Player;
    });
    const alongLine = players.some((p) => p.x !== players[0].x);
    for (const p of players) {
      p.trace = buildTrace(p);
      if (p.trace) p.extras.add(p.trace.mesh);
      p.aids = buildAids(p);
      // the ball's mark on the face: as far from the hosel as the ball met it (the sweet spot, or towards toe or heel)
      if (p.swing.faceView && p.swing.hit) {
        const hk = p.swing.keys.find((k) => Math.abs(k.t - p.swing.hit!.at) < 1e-6);
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 20), new THREE.MeshBasicMaterial({ color: '#2b3238', side: THREE.DoubleSide }));
        m.rotation.y = -Math.PI / 2;
        m.position.set(p.club.userData.faceX - 0.0004, -0.014, SWEET[p.swing.club] - (hk?.miss?.[2] ?? 0));
        m.visible = false;
        (p.club.userData.head as THREE.Object3D).add(m);
        p.mark = m;
      }
      // a little sand lying on the open face – it stays there while the face stays open
      if (p.swing.props?.includes('faceSand')) {
        const geo = new THREE.SphereGeometry(0.022, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        geo.scale(1, 0.5, 1.4);
        const pile = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#e3cf96', roughness: 1 })); // ci-allow: bunker sand
        pile.rotation.z = Math.PI / 2;
        pile.position.set(p.club.userData.faceX - 0.0005, -0.016, SWEET[p.swing.club]);
        (p.club.userData.head as THREE.Object3D).add(pile);
      }
      // the fan: more balls from the same spot, each with its own flight and tracer
      for (const side of p.swing.fan ?? []) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
        ball.castShadow = true;
        p.extras.add(ball);
        const tracer = buildTracer(p, side);
        if (tracer) p.extras.add(tracer.mesh);
        p.fan.push({ ball, side, tracer });
      }
      // the laws: two arrows lying at the ball – the path (green, like the clubhead's line) and the face (white, like
      // the ball's line, which starts mostly where the face looks)
      if (p.swing.laws) {
        const g = new THREE.Group();
        const arrow = (deg: number, color: string, len: number) => {
          const a = new THREE.Group();
          const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
          const shaft = new THREE.Mesh(new THREE.BoxGeometry(len, 0.004, 0.035), mat);
          shaft.position.x = len / 2 - 0.35;
          const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), mat);
          head.rotation.z = -Math.PI / 2;
          head.position.x = len - 0.35 + 0.08;
          a.add(shaft, head);
          // + right of the target: for a right-hander that is away from the player (+z); the angles drawn three times
          // as large – a few degrees would not be seen
          a.rotation.y = -THREE.MathUtils.degToRad(deg * 3);
          a.renderOrder = 2;
          return a;
        };
        g.add(arrow(p.swing.laws.path, '#79a128', 1.6), arrow(p.swing.laws.face, '#ffffff', 1.3));
        const bp = ballPos(p);
        g.position.set(bp.x, heightAt(bp.x, bp.z) + 0.006, bp.z);
        g.quaternion.premultiply(groundQ);
        g.visible = false;
        p.extras.add(g);
        p.laws = g;
      }
      // golfers side by side along the target line: the left one's ball flies past the right one – no tracer there
      p.tracer = alongLine ? null : buildTracer(p);
      if (p.tracer) p.extras.add(p.tracer.mesh);
      // a bunker shot: the club enters the sand behind the ball and throws it out with the sand
      const hk = p.swing.hit && p.swing.keys.find((k) => Math.abs(k.t - p.swing.hit!.at) < 1e-6);
      if (p.swing.sand && p.swing.hit?.shot === 'bunker' && (hk?.miss?.[0] ?? 0) < -0.02) {
        p.splash = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 6, 4), new THREE.MeshStandardMaterial({ color: '#cbb88f', roughness: 1 }), SPLASH);
        p.splash.visible = false;
        p.splash.frustumCulled = false;
        p.extras.add(p.splash);
      }
      // a putt rolls to a hole just short of where it would stop: dark, with the white liner at its edge; the ball drops in
      // when it reaches it (a pushed or pulled putt rolls past and stops beside it)
      const h = p.swing.hit;
      // the landing ring of a chip or pitch: 1 m across, flat on the grass where the ball should come down
      if (p.swing.landing) {
        const bp = ballPos(p);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 48), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.7 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(bp.x + p.swing.landing.carry, heightAt(bp.x + p.swing.landing.carry, bp.z) + 0.012, bp.z);
        ring.receiveShadow = true;
        p.extras.add(ring);
      }
      if (h && ((h.shot === 'putt' && p.swing.club === 'putter') || p.swing.landing?.hole)) {
        const at = ballPos(p);
        at.x += p.swing.landing?.hole ?? 1.74 * (h.scale ?? 1);
        at.y = heightAt(at.x, at.z) + 0.003;
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
    // the gap between two trees, 3 m wide, with a branch at head height – a punch stays under it
    sceneProps.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const y of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) y.dispose();
    });
    sceneProps.clear();
    if (players.some((p) => p.swing.props?.includes('trees'))) {
      const zs = players.map((p) => p.z);
      const mid = (Math.min(...zs) + Math.max(...zs)) / 2 + 0.6;
      const half = Math.max(1.5, (Math.max(...zs) - Math.min(...zs)) / 2 + 1.2);
      const bark = new THREE.MeshStandardMaterial({ color: '#6b5638', roughness: 1 });
      const leaves = new THREE.MeshStandardMaterial({ color: '#3f7a2e', roughness: 1 });
      const x = 5.2;
      for (const z of [mid - half, mid + half]) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 10), bark);
        trunk.position.set(x, heightAt(x, z) + 1.3, z);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), leaves);
        crown.scale.set(1, 0.85, 1);
        crown.position.set(x, heightAt(x, z) + 2.9, z);
        trunk.castShadow = crown.castShadow = true;
        sceneProps.add(trunk, crown);
      }
      // the branch across the gap at head height, with leaves along it
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, half * 2, 8), bark);
      branch.rotation.x = Math.PI / 2;
      branch.position.set(x, heightAt(x, mid) + 1.9, mid);
      const leafy = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, half * 2 - 0.6, 10), leaves);
      leafy.rotation.x = Math.PI / 2;
      leafy.position.set(x, heightAt(x, mid) + 2.12, mid);
      leafy.scale.set(1, 1, 0.6);
      sceneProps.add(branch, leafy);
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
