import * as THREE from 'three';
import { COLORS, SHAFT_R, type Rig } from './rig';
import { surfaceMaterial, type Surface } from './skinMaterials';

// The realistic hull of the shared 3D golfer (Sascha 19.10.2026: "the most realistic that is technically possible"):
// instead of the soft capsules a smooth human body – Blender Foundation's CC0 "Human Base Meshes" (realistic male), its
// skin bound to OUR skeleton (realisticBody.data.ts, built by a script from the Blender file). The skeleton, its joint
// names, setGrip, hands, shafts and markers stay the same; only the pivots move to the joints of that body and the
// fingers get three parts each (the thumb too). Agility's clips and Training's golf swings drive it unchanged.
//
// Binding: every bone is a THREE.Bone on its pivot (identity), its inverse bind matrix the bind frame of that joint in
// the body's own pose (an A-pose) – a joint frame whose −y runs along the limb, as the pivots' do. So the skin follows the
// pivots whatever pose the rig takes.

type Meta = {
  vertices: number;
  indices: number;
  bones: string[];
  frames: Record<string, { o: number[]; x: number[]; y: number[]; z: number[] }>;
  groups: [number, number, number][];
  lengths: number[];
  fingers: Record<string, number[]>;
};
type Body = { meta: Meta; pos: Float32Array; idx: Uint16Array; sIdx: Uint8Array; sW: Uint8Array };

let body: Body | null = null;
let loading: Promise<void> | null = null;

/** Loads the realistic body (≈ 400 kB, a module of its own – only with the 3D videos). */
export function loadRealisticBody(): Promise<void> {
  if (body) return Promise.resolve();
  loading ??= import('./realisticBody.data').then(({ BODY_META, BODY_DATA }) => {
    const bin = Uint8Array.from(atob(BODY_DATA), (c) => c.charCodeAt(0));
    const m = BODY_META as unknown as Meta;
    let at = 0;
    const take = <T>(make: (b: ArrayBuffer, o: number, n: number) => T, n: number, bytes: number) => {
      const copy = bin.slice(at, at + n * bytes).buffer;
      at += n * bytes;
      return make(copy, 0, n);
    };
    const p16 = take((b, o, n) => new Int16Array(b, o, n), m.vertices * 3, 2);
    const pos = new Float32Array(p16.length);
    for (let i = 0; i < p16.length; i++) pos[i] = p16[i] / 10000;
    const idx = take((b, o, n) => new Uint16Array(b, o, n), m.indices, 2);
    const sIdx = take((b, o, n) => new Uint8Array(b, o, n), m.vertices * 4, 1);
    const sW = take((b, o, n) => new Uint8Array(b, o, n), m.vertices * 4, 1);
    body = { meta: m, pos, idx, sIdx, sW };
  });
  return loading;
}
export const realisticBodyReady = () => !!body;

/** the bind frame of a joint as a matrix (columns x, y, z, origin) */
const frameM = (f: Meta['frames'][string]) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z)).setPosition(new THREE.Vector3(...f.o));

// the colours of the regions of the mesh (see build-body.mjs): skin, shirt, trousers, shoe, sole, glove, cap, hair, belt,
// eye, iris, the visor's underside
const REGION = (): [Surface, string, number][] => [
  ['skin', '#c8946f', 0.55],
  ['pique', COLORS.shirt, 0.85],
  ['twill', COLORS.trousers, 0.8],
  ['shoe', COLORS.shoe, 0.42],
  ['sole', COLORS.sole, 0.8],
  ['glove', COLORS.glove, 0.62],
  ['cap', COLORS.cap, 0.75],
  ['hair', '#3a2b20', 0.85],
  ['belt', '#23282c', 0.45],
  ['plain', '#f2efe8', 0.15],
  ['plain', '#2a221c', 0.1],
  ['cap', '#4f6a24', 0.85],
  ['plain', '#f4f2ec', 0.35],
  ['pique', COLORS.shirt, 0.85],
];

/** the pivot of a bone of the body */
function pivotOf(rig: Rig, name: string): THREE.Object3D {
  const s = name.endsWith('L') ? 'L' : 'R';
  const m = /^(index|middle|ring|little|thumb)([012])[LR]$/.exec(name);
  if (m) {
    const f = rig.fingers[s][['index', 'middle', 'ring', 'little', 'thumb'].indexOf(m[1])];
    return [f.base, f.mid, f.tip!][Number(m[2])];
  }
  return rig.joints[name as keyof Rig['joints']];
}

/** Turns a rig into the realistic one (when the body is loaded): the capsules go, the pivots move to the body's joints,
 *  the skin goes on. Returns false when the body is not loaded yet. */
export function applyRealisticSkin(rig: Rig): boolean {
  if (!body) return false;
  const { meta } = body;
  const F = meta.frames;
  const M = (n: string) => frameM(F[n]);
  // away with the soft shapes (the markers are plain objects and stay)
  const shapes: THREE.Object3D[] = [];
  rig.root.traverse((o) => (o as THREE.Mesh).isMesh && shapes.push(o));
  for (const o of shapes) {
    o.removeFromParent();
    const m = o as THREE.Mesh;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
  }
  rig.eyes.length = 0;
  // the pivots at the body's joints: torso and head as they are (upright), limbs along their own −y
  const J = rig.joints;
  const rel = (child: string, parent: string) => new THREE.Vector3(...F[child].o).sub(new THREE.Vector3(...F[parent].o));
  J.pelvis.position.set(...(F.pelvis.o as [number, number, number]));
  J.spine.position.copy(rel('spine', 'pelvis'));
  J.chest.position.copy(rel('chest', 'spine'));
  J.neck.position.copy(rel('neck', 'chest'));
  J.head.position.copy(rel('head', 'neck'));
  const [upperArm, forearm, thigh, shin] = meta.lengths;
  for (const s of ['L', 'R'] as const) {
    J[`shoulder${s}`].position.copy(rel(`shoulder${s}`, 'chest'));
    J[`elbow${s}`].position.set(0, -upperArm, 0);
    J[`wrist${s}`].position.set(0, -forearm, 0);
    J[`hip${s}`].position.copy(rel(`hip${s}`, 'pelvis'));
    J[`knee${s}`].position.set(0, -thigh, 0);
    J[`ankle${s}`].position.set(0, -shin, 0);
  }
  rig.root.userData.lengths = { upperArm, forearm, thigh, shin, ankleH: F.ankleL.o[1] };
  // the fingers: three parts each, placed and turned as in the body's hand; open = as the body's hand rests
  const wristInv = (s: string) => M(`wrist${s}`).invert();
  for (const s of ['L', 'R'] as const) {
    rig.fingers[s].forEach((f, k) => {
      const name = ['index', 'middle', 'ring', 'little', 'thumb'][k];
      if (!f.tip) {
        const tip = new THREE.Object3D();
        f.mid.add(tip);
        f.tip = tip;
      }
      const seg = [0, 1, 2].map((i) => M(`${name}${i}${s}`));
      const parent = [M(`wrist${s}`), seg[0], seg[1]];
      const piv = [f.base, f.mid, f.tip];
      f.rest = [];
      for (let i = 0; i < 3; i++) {
        const local = parent[i].clone().invert().multiply(seg[i]);
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        local.decompose(p, q, sc);
        piv[i].position.copy(p);
        f.rest.push(q);
      }
      f.open = [0, 0, 0];
      f.lengths = meta.fingers[name + s];
    });
    // where a closed hand holds the shaft (the grip of a golfer): not straight across, but diagonally – for the lead
    // hand from under the heel pad (below the little finger) to the middle of the index finger's first part; the trail
    // hand holds it more in the fingers, across their roots
    const w = wristInv(s);
    const at = (name: string) => new THREE.Vector3(...F[name].o).applyMatrix4(w);
    const palm = s === 'L' ? -1 : 1;
    const lead = s === 'L';
    // the lead hand: the butt end lies in the heel pad, 4 cm below the wrist; the trail hand: at the root of the little finger
    const little = at(`little0${s}`);
    const heel = lead ? new THREE.Vector3(little.x + palm * (SHAFT_R + 0.017), -0.045, little.z - 0.004) : new THREE.Vector3(little.x + palm * (SHAFT_R + 0.012), -0.06, little.z - 0.004);
    const index = at(`index0${s}`).lerp(at(`index1${s}`), lead ? 0.55 : 0.5).add(new THREE.Vector3(palm * (SHAFT_R + 0.0095), 0, 0));
    const dir = index.clone().sub(heel).normalize();
    rig.shafts[s].position.copy(heel.clone().lerp(index, 0.5));
    rig.shafts[s].userData.dir = dir;
  }
  computeClosed(rig);
  // the skin
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(body.pos, 3));
  g.setIndex(new THREE.BufferAttribute(body.idx, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(body.sIdx), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(body.sW, (x) => x / 255), 4));
  g.computeVertexNormals();
  const mats: THREE.Material[] = REGION().map(([kind, color, roughness]) => surfaceMaterial(kind, color, roughness));
  mats[6].side = THREE.DoubleSide;
  // the collar: a single band, seen from both sides
  mats[13].side = THREE.DoubleSide;
  for (const [r, start, n] of meta.groups) g.addGroup(start, n, r);
  const mesh = new THREE.SkinnedMesh(g, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bones = meta.bones.map((n) => {
    const b = new THREE.Bone();
    b.name = n;
    pivotOf(rig, n).add(b);
    return b;
  });
  const inverses = meta.bones.map((n) => M(n).invert());
  rig.root.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  rig.root.userData.realistic = true;
  return true;
}

/** the closed hand, worked out once (the same body every time): per side, per finger the three turns */
const closedCache: Record<string, THREE.Quaternion[][]> = {};

/** The closed fingers (19.10.2026): each finger turns at its three joints, about each part's own z (towards the palm),
 *  so that its parts lie on the grip – points along every part as close to the grip's surface as can be, none inside
 *  it; a coarse search, then a finer one around the best. The thumb: see fitThumb. Done once per side and kept. */
function computeClosed(rig: Rig) {
  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? 1 : -1;
    const shaft = rig.shafts[s].position.clone();
    const axis = (rig.shafts[s].userData.dir as THREE.Vector3 | undefined) ?? new THREE.Vector3(0, 0, 1);
    const cached = closedCache[s];
    rig.fingers[s].forEach((f, k) => {
      if (cached) { f.closedQ = cached[k].map((q) => q.clone()); return; }
      f.closedQ = k === 4 ? fitThumb(f, shaft, axis, side) : fitFinger(f, shaft, axis, side);
    });
    if (!cached) closedCache[s] = rig.fingers[s].map((f) => f.closedQ!.map((q) => q.clone()));
  }
}

const Z = new THREE.Vector3(0, 0, 1);
/** the distance of a point from the grip's axis */
const axisDist = (p: THREE.Vector3, shaft: THREE.Vector3, axis: THREE.Vector3) => {
  const d = p.clone().sub(shaft);
  return d.sub(axis.clone().multiplyScalar(d.dot(axis))).length();
};
/** points along a finger's three parts (in the wrist frame) for its joint turns */
function fingerPoints(f: Rig['fingers']['L'][number], qs: THREE.Quaternion[]): THREE.Vector3[] {
  const piv = [f.base, f.mid, f.tip!];
  let m = new THREE.Matrix4();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i++) {
    m = m.multiply(new THREE.Matrix4().compose(piv[i].position, qs[i], new THREE.Vector3(1, 1, 1)));
    for (const t of [0.35, 0.7, 1]) out.push(new THREE.Vector3(0, -f.lengths![i] * t, 0).applyMatrix4(m));
  }
  return out;
}
function fitFinger(f: Rig['fingers']['L'][number], shaft: THREE.Vector3, axis: THREE.Vector3, side: number): THREE.Quaternion[] {
  const D = THREE.MathUtils.degToRad;
  // the finger's own thickness: the part lies on the grip with its middle a finger's radius off the surface
  const R = SHAFT_R + 0.0085;
  const pose = (a: number[]) => [0, 1, 2].map((i) => f.rest![i].clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z, D(-side * a[i]))));
  const cost = (a: number[]) => {
    let c = 0;
    for (const p of fingerPoints(f, pose(a))) {
      const d = axisDist(p, shaft, axis);
      c += d > R ? (d - R) ** 2 : 25 * (R - d) ** 2;
    }
    // a little preference for even curls (as a finger closes), so the search does not find odd zigzags
    return c + 1e-7 * ((a[0] - a[1]) ** 2 + (a[1] - a[2]) ** 2);
  };
  let best = [0, 0, 0], bc = Infinity;
  for (let a = 0; a <= 100; a += 5) for (let b = 0; b <= 110; b += 5) for (let c = 0; c <= 90; c += 5) {
    const k = cost([a, b, c]);
    if (k < bc) { bc = k; best = [a, b, c]; }
  }
  const c0 = best.slice();
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) {
    const t = [c0[0] + a, c0[1] + b, c0[2] + c];
    const k = cost(t);
    if (k < bc) { bc = k; best = t; }
  }
  return pose(best);
}

/** The closed thumb: lying on the grip along the shaft, its tip towards the clubhead – a coarse, then a fine search over
 *  the turn at its base and the bend of its two joints. */
function fitThumb(f: Rig['fingers']['L'][number], shaft: THREE.Vector3, axis: THREE.Vector3, _side: number): THREE.Quaternion[] {
  // the side of the grip the thumb lies on: where its base is (it lies along the grip there, it does not wrap round)
  const b0 = f.base.position.clone().sub(shaft);
  const onSide = b0.sub(axis.clone().multiplyScalar(b0.dot(axis))).normalize();
  const piv = [f.base, f.mid, f.tip!];
  const D = THREE.MathUtils.degToRad;
  const dist = (p: THREE.Vector3) => {
    const d = p.clone().sub(shaft);
    return d.sub(axis.clone().multiplyScalar(d.dot(axis))).length();
  };
  const pose = (e: number[]) => {
    const q0 = f.rest![0].clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(D(e[0]), D(e[1]), D(e[2]))));
    const q1 = f.rest![1].clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), D(e[3])));
    const q2 = f.rest![2].clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), D(e[4])));
    return [q0, q1, q2];
  };
  const ends = (qs: THREE.Quaternion[]) => {
    let m = new THREE.Matrix4();
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      m = m.multiply(new THREE.Matrix4().compose(piv[i].position, qs[i], new THREE.Vector3(1, 1, 1)));
      out.push(new THREE.Vector3(0, -f.lengths![i], 0).applyMatrix4(m));
    }
    return out;
  };
  const R = SHAFT_R + 0.0105;
  const cost = (e: number[]) => {
    const [, ip, tip] = ends(pose(e));
    const run = tip.clone().sub(ip).normalize();
    const sideOf = (p: THREE.Vector3) => { const d = p.clone().sub(shaft); return d.sub(axis.clone().multiplyScalar(d.dot(axis))).normalize().dot(onSide); };
    return ((dist(ip) - R) ** 2 + (dist(tip) - R) ** 2) * 1e4 + (1 - run.dot(axis)) * 0.6 + (2 - sideOf(ip) - sideOf(tip)) * 0.4;
  };
  let best = [0, 0, 0, 0, 0];
  let bc = cost(best);
  const search = (centre: number[], span: number, step: number) => {
    const c0 = centre.slice();
    for (let a = -span; a <= span; a += step)
      for (let b = -span; b <= span; b += step)
        for (let c = -span; c <= span; c += step)
          for (let m = 0; m <= 50; m += step >= 10 ? 10 : 5)
            for (let t = 0; t <= 40; t += step >= 10 ? 10 : 5) {
              const e = [c0[0] + a, c0[1] + b, c0[2] + c, m, t];
              const k = cost(e);
              if (k < bc) { bc = k; best = e; }
            }
  };
  search([0, 0, 0], 60, 15);
  search(best, 12, 4);
  return pose(best);
}
