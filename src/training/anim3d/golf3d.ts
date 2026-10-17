import * as THREE from 'three';
import { applyPose, BODY, buildRig, COLORS, type Pose, type Rig, type Rot } from '../../mobility/anim3d/rig';
import type { L } from '../types';

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
  hit?: { at: number; roll?: number; fly?: boolean };
  /** the ball sits on a tee (driver) */
  tee?: boolean;
  /** played from sand (bunker) */
  sand?: boolean;
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
  const m = (c: string, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.2 });
  const len = CLUB_LEN[kind];
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.27, 10), m(COLORS.grip, 0.8));
  grip.position.y = 0.135;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.004, len - 0.27, 8), m(COLORS.shaft, 0.3));
  shaft.position.y = 0.27 + (len - 0.27) / 2;
  let head: THREE.Mesh;
  if (kind === 'driver') {
    head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), m(COLORS.clubHead, 0.35));
    head.scale.set(1, 0.6, 1.2);
    head.position.set(0, len, 0.05);
  } else if (kind === 'putter') {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.11), m(COLORS.clubHead, 0.35));
    head.position.set(0, len, 0.03);
  } else {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.085), m(COLORS.clubHead, 0.35));
    head.position.set(0, len, 0.035);
  }
  for (const x of [grip, shaft, head]) {
    x.castShadow = true;
    g.add(x);
  }
  return g;
}

// ---------- the swing at a time ----------
const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpRot = (a: Rot | undefined, b: Rot | undefined, k: number): Rot => {
  const x = a ?? [0, 0, 0];
  const y = b ?? [0, 0, 0];
  return [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
};

interface Prepared {
  keys: (SwingKey & { clubLocal: THREE.Vector3 })[];
  length: number;
}

export interface Viewer {
  setSwing(s: Swing): void;
  setView(v: View): void;
  setPlaying(on: boolean): void;
  setSpeed(k: number): void;
  seek(t: number): void;
  onLabel(cb: (label: L | undefined, step: number) => void): void;
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
  scene.fog = new THREE.Fog('#cfe6f5', 7, 14);
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
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), floorMat('#7cb257'));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), floorMat('#8fc069'));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.001;
  pad.receiveShadow = true;
  scene.add(pad);
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0215, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.04, 8), new THREE.MeshStandardMaterial({ color: '#f2f4f3', roughness: 0.6 }));
  tee.visible = false;
  scene.add(tee);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  let rig: Rig = buildRig();
  scene.add(rig.root);
  let club = buildClub('iron');
  scene.add(club);

  let swing: Swing | null = null;
  let prep: Prepared | null = null;
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

  const ballPos = () => {
    const b = swing?.ball ?? [0, 0.6];
    return new THREE.Vector3(b[0], swing?.tee ? 0.06 : 0.0215, b[1]);
  };

  /** the trunk of a key (or between two) put on the rig, the limbs left for the solver */
  const poseTrunk = (body: SwingKey['body'], shift: number, drop: number) => {
    const p: Pose = { j: { ...body }, at: [shift, 0], y: drop };
    applyPose(rig, p, false);
    rig.root.updateMatrixWorld(true);
  };

  const chestQ = () => rig.joints.chest.getWorldQuaternion(new THREE.Quaternion());
  const chestPos = () => rig.joints.chest.getWorldPosition(new THREE.Vector3());

  /** each key's club direction in the chest frame – 'ball' worked out with the key's own trunk */
  const prepare = (s: Swing): Prepared => {
    const keys = s.keys.map((k) => {
      poseTrunk(k.body, k.shift ?? 0, -(k.drop ?? 0.05));
      let hands = new THREE.Vector3(...k.hands).applyQuaternion(chestQ()).add(chestPos());
      const head = ballPos().add(new THREE.Vector3(0, 0.005, -0.03));
      const dir = k.club === 'ball' ? head.clone().sub(hands).normalize() : new THREE.Vector3(...k.club).normalize();
      // at the ball the clubhead sits exactly behind it: the hands slide along the shaft to the club's length
      if (k.club === 'ball') hands = head.clone().addScaledVector(dir, -(CLUB_LEN[s.club] - 0.05));
      const local = hands.clone().sub(chestPos()).applyQuaternion(chestQ().invert());
      return { ...k, hands: [local.x, local.y, local.z] as V3, clubLocal: dir.applyQuaternion(chestQ().invert()) };
    });
    return { keys, length: keys[keys.length - 1].t };
  };

  /** the figure and the club at a time of the swing */
  const place = (time: number) => {
    if (!prep || !swing) return { label: undefined as L | undefined, step: 0 };
    const keys = prep.keys;
    const tt = Math.min(Math.max(time, 0), prep.length);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= tt) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const k = b.t > a.t ? ease((tt - a.t) / (b.t - a.t)) : 0;
    const body: SwingKey['body'] = {};
    for (const id of ['pelvis', 'spine', 'chest', 'neck', 'head'] as const) body[id] = lerpRot(a.body[id], b.body[id], k);
    poseTrunk(body, lerp(a.shift ?? 0, b.shift ?? 0, k), -lerp(a.drop ?? 0.05, b.drop ?? 0.05, k));
    // the eyes on the ball until the club has passed it, then the head turns with the body
    const look = lerp(a.free ? 0 : 1, b.free ? 0 : 1, k);
    if (look > 0) {
      const head = rig.joints.head;
      const keyed = head.quaternion.clone();
      head.lookAt(ballPos());
      // lookAt points the face (+z) at the ball; tilt it down a little more – the eyes, not the nose
      head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(12)));
      head.quaternion.copy(keyed.slerp(head.quaternion, look));
      head.updateMatrixWorld(true);
    }
    const q = chestQ();
    const handsL = new THREE.Vector3(lerp(a.hands[0], b.hands[0], k), lerp(a.hands[1], b.hands[1], k), lerp(a.hands[2], b.hands[2], k)).applyQuaternion(q).add(chestPos());
    // the club turns on the shortest way between the two keys
    const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clubLocal);
    const qb = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clubLocal);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(qa.slerp(qb, k)).applyQuaternion(q).normalize();
    const handsR = handsL.clone().addScaledVector(dir, 0.09);

    // arms: the wrists 6 cm before the grip points, the hands along the shaft
    const wristL = handsL.clone().addScaledVector(dir, -0.06);
    const wristR = handsR.clone().addScaledVector(dir, -0.06);
    const J = rig.joints;
    const chestP = chestPos();
    // elbows point down and a little out, away from the body
    const poleL = chestP.clone().add(new THREE.Vector3(0.5, -1, 0.1).applyQuaternion(q));
    const poleR = chestP.clone().add(new THREE.Vector3(-0.5, -1, 0.1).applyQuaternion(q));
    twoBone(J.shoulderL, J.elbowL, BODY.upperArm, BODY.forearm, wristL, poleL);
    twoBone(J.shoulderR, J.elbowR, BODY.upperArm, BODY.forearm, wristR, poleR);
    aim(J.wristL, wristL, wristL.clone().add(dir));
    aim(J.wristR, wristR, wristR.clone().add(dir));

    // legs: the ankles stay where they stand; the trail heel comes up in the finish
    const half = (swing.stance ?? 0.36) / 2;
    const heel = lerp(a.heel ?? 0, b.heel ?? 0, k);
    const ankleL = new THREE.Vector3(half, BODY.ankleH, 0);
    const ankleR = new THREE.Vector3(-half + heel * 0.06, BODY.ankleH + heel * 0.11, -heel * 0.03);
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
    club.position.copy(handsL).addScaledVector(dir, -0.05);
    club.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    club.updateMatrixWorld(true);

    let label: L | undefined;
    let step = 0;
    for (let n = 0; n <= i; n++)
      if (keys[n].label) {
        label = keys[n].label;
        step++;
      }
    return { label, step };
  };

  const DIRS: Record<View, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.12, 1).normalize(),
    side: new THREE.Vector3(-1, 0.12, 0).normalize(),
    angle: new THREE.Vector3(-0.72, 0.3, 0.72).normalize(),
    above: new THREE.Vector3(0, 0.95, 0.62).normalize(),
  };
  const swingBounds = () => {
    if (!prep) return null;
    const box = new THREE.Box3();
    for (let i = 0; i <= 16; i++) {
      place((prep.length * i) / 16);
      box.expandByObject(rig.root);
      box.expandByObject(club);
    }
    box.expandByObject(ballMesh);
    return box;
  };
  const placeCamera = () => {
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

  /** the ball: still until the club arrives, then rolling to a stop or flying away towards the target */
  const placeBall = (time: number) => {
    const p = ballPos();
    const h = swing?.hit;
    ballMesh.visible = true;
    if (h && time > h.at) {
      const s = time - h.at;
      if (h.fly) {
        p.x += 9 * s;
        p.y += 4.5 * s - 3 * s * s;
        ballMesh.visible = s < 0.8;
      } else p.x += (h.roll ?? 1) * (1 - Math.exp(-2.2 * s));
    }
    ballMesh.position.copy(p);
  };

  const update = () => {
    if (!prep) return;
    // the loop: the swing, a rest in the finish, again
    const loop = prep.length + 1.2;
    const tt = ((t % loop) + loop) % loop;
    const s = place(tt);
    placeBall(tt);
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

  return {
    setSwing(s) {
      swing = s;
      scene.remove(club);
      club = buildClub(s.club);
      scene.add(club);
      scene.remove(rig.root);
      rig = buildRig();
      scene.add(rig.root);
      ballMesh.position.copy(ballPos());
      tee.visible = !!s.tee;
      (pad.material as THREE.MeshStandardMaterial).color.set(s.sand ? '#e3cf96' : '#8fc069');
      tee.position.set(ballPos().x, 0.02, ballPos().z);
      prep = prepare(s);
      bounds = null;
      t = 0;
      lastStep = -1;
      view = s.view ?? 'front';
      placeCamera();
      update();
    },
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
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      io?.disconnect();
      renderer.dispose();
    },
  };
}
