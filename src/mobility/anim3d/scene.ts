import * as THREE from 'three';
import { applyPose, buildRig, COLORS, mixPose, type Pose, type Rig } from './rig';
import { loadRealisticBody, realisticBodyReady } from './rigSkin';
import type { L } from '../../training/types';

// The stage of the 3D test videos: the golfer, the floor, light with soft shadows, the props of a test (chair, wall,
// mat, stick, club, table) and a camera from the front, the side or at an angle. A clip is a list of key poses with
// times; between them every joint is eased, the clip loops. Rendering runs only while the video is visible.

export type View = 'front' | 'side' | 'angle' | 'above';
export type PropId = 'chair' | 'wall' | 'wallFront' | 'mat' | 'barHands' | 'band' | 'barChest' | 'clubR' | 'clubLineR' | 'table' | 'sideTable' | 'book' | 'bench' | 'benchFront';

export interface Key {
  t: number;
  pose: Pose;
  /** the step shown below the video from this key on */
  label?: L;
}

export interface Clip {
  keys: Key[];
  /** loop length in seconds (default: the last key) */
  length?: number;
  view: View;
  /** views the player can switch to (default front, side, angle) */
  views?: View[];
  /** set the feet on the floor (standing tests); 'all' also knees, hands, elbows (drills on the floor) */
  ground?: boolean | 'all';
  props?: PropId[];
  /** where the camera looks and how far it is (default 0.9 m high, 3.6 m) */
  focus?: [number, number, number];
  dist?: number;
}

/** the realistic golfer of Training (23.10.2026, for Sascha to judge first): on with ?real3d=1, off with ?real3d=0 – the
 * same switch as Training's swing videos (localStorage golfos.real3d) */
export function wantRealistic(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('real3d');
    if (q === '1') localStorage.setItem('golfos.real3d', '1');
    if (q === '0') localStorage.removeItem('golfos.real3d');
    return localStorage.getItem('golfos.real3d') === '1';
  } catch {
    return false;
  }
}
const skin = () => (wantRealistic() && realisticBodyReady() ? 'realistic' : 'classic');

/** The lowest point of the realistic golfer's skin (its bones applied; every n-th vertex), or null for the classic one.
 * Its contact points were placed for the classic figure: knees, ankles and hands of the realistic body reach further. */
export function skinLow(rig: Rig, every = 7): number | null {
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let low = Infinity;
  rig.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) {
      v.fromBufferAttribute(pos, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      if (v.y < low) low = v.y;
    }
  });
  return Number.isFinite(low) ? low : null;
}

/** How much a clip lifts (or lowers) the realistic golfer so its skin, not the classic contact points, rests on the floor:
 * 24 moments of the loop, eased between (null: nothing to do – the classic figure, or a clip not on the floor). */
export function skinFloor(rig: Rig, clip: Clip): number[] | null {
  if (!rig.root.userData.lengths || clip.ground === false) return null;
  const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
  const out: number[] = [];
  for (let i = 0; i < 24; i++) {
    applyPose(rig, sample(clip, (len * i) / 24).pose, clip.ground ?? true);
    out.push(-(skinLow(rig) ?? 0));
  }
  return out;
}
export function floorAt(offs: number[], clip: Clip, t: number): number {
  const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
  const x = ((((t % len) + len) % len) / len) * offs.length;
  const i = Math.floor(x) % offs.length;
  return offs[i] + (offs[(i + 1) % offs.length] - offs[i]) * (x - Math.floor(x));
}

const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);

/** The pose of a clip at time t (s), and the label that applies. */
export function sample(clip: Clip, t: number): { pose: Pose; label?: L; step: number } {
  const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
  const tt = ((t % len) + len) % len;
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= tt) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const k = b.t > a.t ? ease((tt - a.t) / (b.t - a.t)) : 0;
  let label: L | undefined;
  let step = 0;
  for (let n = 0; n <= i; n++)
    if (keys[n].label) {
      label = keys[n].label;
      step++;
    }
  return { pose: mixPose(a.pose, b.pose, k), label, step };
}

function mat(color: string, rough = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}
function box(w: number, h: number, d: number, color: string, at: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(...at);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildProp(id: PropId, rig: Rig): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (id) {
    case 'chair': {
      // seat 0.46 m high, behind the figure's seat point
      g.add(box(0.46, 0.04, 0.42, '#8a6a4a', [0, 0.44, -0.08]));
      for (const [x, z] of [[-0.2, -0.27], [0.2, -0.27], [-0.2, 0.11], [0.2, 0.11]]) g.add(box(0.035, 0.44, 0.035, '#6f5439', [x, 0.22, z]));
      g.add(box(0.46, 0.42, 0.035, '#8a6a4a', [0, 0.67, -0.29]));
      return g;
    }
    case 'wall':
      g.add(box(2.4, 2.2, 0.08, '#e9eef0', [0, 1.1, -0.16]));
      return g;
    case 'wallFront':
      // a wall in front of the player (knee to wall)
      g.add(box(2.4, 2.2, 0.08, '#e9eef0', [0, 1.1, 0.62]));
      return g;
    case 'benchFront':
      // a bench in front of a kneeling player (elbows on it)
      g.add(box(0.9, 0.05, 0.4, '#8a6a4a', [0, 0.45, 0.78]));
      g.add(box(0.05, 0.43, 0.35, '#6f5439', [-0.4, 0.215, 0.78]));
      g.add(box(0.05, 0.43, 0.35, '#6f5439', [0.4, 0.215, 0.78]));
      return g;
    case 'mat': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.012, 1.9), mat('#3d6e8c', 0.95));
      m.position.set(0, 0.006, 0);
      m.receiveShadow = true;
      g.add(m);
      g.name = 'mat'; // placed under the body when the clip is set (fitMat)
      return g;
    }
    case 'table':
      g.add(box(0.8, 0.04, 0.6, '#9a7b5a', [0.38, 0.86, 0.32]));
      g.add(box(0.05, 0.84, 0.05, '#7d6047', [0.72, 0.42, 0.56]));
      g.add(box(0.05, 0.84, 0.05, '#7d6047', [0.72, 0.42, 0.08]));
      return g;
    case 'sideTable':
      // a table at the right of a seated player, its front edge at the wrist, the top under the forearm
      g.add(box(0.3, 0.035, 0.55, '#9a7b5a', [-0.3, 0.665, -0.005]));
      for (const [x, z] of [[-0.42, -0.25], [-0.18, -0.25], [-0.42, 0.24], [-0.18, 0.24]]) g.add(box(0.03, 0.65, 0.03, '#7d6047', [x, 0.325, z]));
      return g;
    case 'bench':
      g.add(box(0.5, 0.05, 0.9, '#8a6a4a', [0, 0.45, 0.95]));
      g.add(box(0.45, 0.43, 0.05, '#6f5439', [0, 0.215, 0.6]));
      g.add(box(0.45, 0.43, 0.05, '#6f5439', [0, 0.215, 1.3]));
      return g;
    case 'book':
      g.add(box(0.2, 0.045, 0.28, '#a2342b', [0, 0.022, 0.16]));
      return g;
    case 'barChest': {
      // a club across the front of the shoulders (arms crossed over it)
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.0, 10), mat(COLORS.shaft, 0.4));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.15, 0.13);
      bar.castShadow = true;
      rig.joints.chest.add(bar);
      return null;
    }
    case 'clubR':
    case 'clubLineR': {
      // a club in the right hand: clubR held like a club (pointing to the thumb side – upright when the thumb is up),
      // clubLineR in line with the forearm (the wrist hinge test)
      const club = new THREE.Group();
      if (id === 'clubR') club.rotation.x = -Math.PI / 2;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.92, 10), mat(COLORS.shaft, 0.35));
      shaft.position.y = -0.38;
      shaft.castShadow = true;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.26, 10), mat(COLORS.grip, 0.6));
      grip.position.y = 0.0;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), mat(COLORS.clubHead, 0.4));
      head.position.set(0, -0.84, 0.035);
      head.castShadow = true;
      club.add(shaft, grip, head);
      // through the middle of the curled fingers (the club points along the hand's +z there)
      rig.shafts.R.add(club);
      return null;
    }
    case 'barHands':
    case 'band':
      return null; // drawn every frame between the hands (see update)
  }
}

export interface Viewer {
  setClip(c: Clip): void;
  setView(v: View): void;
  /** play from where it is, or hold */
  setPlaying(on: boolean): void;
  /** 1 = normal, 0.4 = slow motion */
  setSpeed(k: number): void;
  /** jump to a time (QA, pause) */
  seek(t: number): void;
  /** the label and step at the current time */
  onLabel(cb: (label: L | undefined, step: number) => void): void;
  resize(): void;
  dispose(): void;
}

/** pixelRatio: lower for a small picture over the camera (the phone also runs the body tracking) */
export function createViewer(canvas: HTMLCanvasElement, opts: { pixelRatio?: number } = {}): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe6f5');
  scene.fog = new THREE.Fog('#cfe6f5', 7, 14);

  const hemi = new THREE.HemisphereLight('#ffffff', '#7cb257', 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(2.2, 4.5, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -2.5;
  sun.shadow.camera.right = 2.5;
  sun.shadow.camera.top = 2.5;
  sun.shadow.camera.bottom = -2.5;
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dfefff', 0.6);
  fill.position.set(-3, 2.5, -2);
  scene.add(fill);

  // the floor: grass green like the sketches, a lighter round where the player stands
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), mat('#7cb257', 1));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), mat('#8fc069', 1));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.001;
  pad.receiveShadow = true;
  scene.add(pad);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  let rig = buildRig({ skin: skin() });
  scene.add(rig.root);
  let propGroup = new THREE.Group();
  scene.add(propGroup);
  let bar: THREE.Mesh | null = null;

  let clip: Clip | null = null;
  /** the realistic golfer: lifted so its skin rests on the floor (see skinFloor) */
  let floorOffs: number[] | null = null;
  const place = (c: Clip, tt: number) => {
    const s = sample(c, tt);
    applyPose(rig, s.pose, c.ground ?? true);
    if (floorOffs) rig.root.position.y += floorAt(floorOffs, c, tt);
    return s;
  };
  let view: View = 'front';
  let playing = true;
  let speed = 1;
  let t = 0;
  let last = performance.now();
  let raf = 0;
  let visible = true;
  let labelCb: ((l: L | undefined, step: number) => void) | null = null;
  let lastStep = -1;

  /** where the camera looks from (unit vector from the subject to the camera) */
  const DIRS: Record<View, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.12, 1).normalize(),
    side: new THREE.Vector3(-1, 0.12, 0).normalize(),
    angle: new THREE.Vector3(-0.72, 0.3, 0.72).normalize(),
    above: new THREE.Vector3(0, 0.95, 0.62).normalize(),
  };
  // everything the clip ever shows (all moments, the props): the camera fits it into the picture
  let bounds: THREE.Box3 | null = null;
  const clipBounds = () => {
    if (!clip) return null;
    const box = new THREE.Box3();
    const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
    for (let i = 0; i <= 16; i++) {
      place(clip, (len * i) / 16);
      rig.root.updateMatrixWorld(true);
      box.expandByObject(rig.root);
    }
    if (propGroup.children.length) box.expandByObject(propGroup);
    return box;
  };
  /** the mat under the whole body: centre of what the clip shows, the long side along the body */
  const fitMat = () => {
    const m = propGroup.getObjectByName('mat');
    if (!m || !clip) return;
    const box = new THREE.Box3();
    const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
    for (let i = 0; i <= 8; i++) {
      place(clip, (len * i) / 8);
      rig.root.updateMatrixWorld(true);
      box.expandByObject(rig.root);
    }
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    m.position.set(c.x, 0, c.z);
    m.rotation.y = size.x > size.z ? Math.PI / 2 : 0;
  };
  const placeCamera = () => {
    bounds ??= clipBounds();
    const dir = DIRS[view];
    if (!bounds || bounds.isEmpty()) {
      camera.position.set(0, 1.2, 3.6);
      camera.lookAt(0, 0.9, 0);
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3());
    if (clip?.focus) center.set(...clip.focus);
    // the picture plane of this view: right and up
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
    camera.position.copy(center).addScaledVector(dir, Math.max(1.2, clip?.dist ?? d));
    camera.lookAt(center);
  };

  const rebuild = () => {
    scene.remove(rig.root);
    scene.remove(propGroup);
    if (bar) scene.remove(bar);
    rig = buildRig({ skin: skin() });
    scene.add(rig.root);
    floorOffs = clip ? skinFloor(rig, clip) : null;
    // (for the checks: which golfer is shown)
    canvas.dataset.body = rig.root.userData.lengths ? 'realistic' : 'classic';
    propGroup = new THREE.Group();
    scene.add(propGroup);
    bar = null;
    for (const p of clip?.props ?? []) {
      const o = buildProp(p, rig);
      if (o) propGroup.add(o);
      if (p === 'barHands' || p === 'band') {
        // a stick (orange) or an elastic band (green, thin, only between the hands)
        bar = new THREE.Mesh(new THREE.CylinderGeometry(p === 'band' ? 0.008 : 0.012, p === 'band' ? 0.008 : 0.012, 1, 10), mat(p === 'band' ? '#79a128' : COLORS.stick, 0.5));
        bar.userData.extra = p === 'band' ? 0 : 0.6;
        bar.castShadow = true;
        scene.add(bar);
      }
    }
  };

  const update = () => {
    if (!clip) return;
    const s = place(clip, t);
    // hands around what they hold (a stick, a band, the club in the right hand) unless the clip says otherwise
    const props = clip.props ?? [];
    const both = props.includes('barHands') || props.includes('band');
    if (s.pose.gripL == null && s.pose.gripR == null && (both || props.includes('clubR') || props.includes('clubLineR'))) rig.setGrip(both ? 1 : 0.25, 1);
    rig.root.updateMatrixWorld(true);
    if (bar) {
      // a stick held in both hands, 30 cm longer on each side
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      rig.shafts.L.getWorldPosition(a);
      rig.shafts.R.getWorldPosition(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = a.clone().sub(b);
      const len = dir.length() + (bar.userData.extra ?? 0.6);
      bar.position.copy(mid);
      bar.scale.set(1, len, 1);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
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
  };

  // render only while on screen (battery)
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => (visible = es.some((e) => e.isIntersecting))) : null;
  io?.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  // the realistic body loads on its own (≈ 400 kB, once): the classic figure shows meanwhile, then the clip is set up again
  let disposed = false;
  if (wantRealistic() && !realisticBodyReady())
    loadRealisticBody().then(() => {
      if (disposed) return;
      rebuild();
      bounds = null;
      fitMat();
      placeCamera();
      update();
    });

  return {
    setClip(c) {
      clip = c;
      t = 0;
      lastStep = -1;
      view = c.view;
      rebuild();
      bounds = null;
      fitMat();
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
    setSpeed(x) {
      speed = x;
    },
    seek(x) {
      t = x;
      update();
      renderer.render(scene, camera);
    },
    onLabel(cb) {
      labelCb = cb;
    },
    resize() {
      resize();
      placeCamera();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io?.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose?.();
      });
      renderer.dispose();
      // give the WebGL context back now, not when the garbage collector gets to it (WebKit has only a few)
      renderer.forceContextLoss();
    },
  };
}
