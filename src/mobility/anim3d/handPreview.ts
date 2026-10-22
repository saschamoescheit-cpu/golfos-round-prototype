// Development only (hand-preview.html): one realistic hand closed around a grip, from six sides – to fit the fingers
// and the thumb. Query: ?side=L|R&grip=0..1
import * as THREE from 'three';
import { buildRig, SHAFT_R } from './rig';
import { loadRealisticBody } from './rigSkin';

const q = new URLSearchParams(location.search);
const side = (q.get('side') ?? 'L') as 'L' | 'R';
const grip = Number(q.get('grip') ?? 1);
await loadRealisticBody();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const out = document.getElementById('out')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(400, 400, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfdde6');
scene.add(new THREE.HemisphereLight('#ffffff', '#88aa77', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(1, 2, 1.5);
scene.add(sun);
const rig = buildRig({ skin: 'realistic' });
scene.add(rig.root);
rig.setGrip(grip, grip);
// the arm lifted forward, out of the way of the body
rig.joints[side === 'L' ? 'shoulderL' : 'shoulderR'].rotation.x = -Math.PI / 2;
rig.root.position.x = side === 'L' ? -0.4 : 0.4;
rig.root.updateMatrixWorld(true);
// the grip in the hand: along the shaft direction through the shaft point
const sh = rig.shafts[side];
const dir = ((sh.userData.dir as THREE.Vector3) ?? new THREE.Vector3(0, 0, 1)).clone();
const wrist = rig.joints[side === 'L' ? 'wristL' : 'wristR'];
const cyl = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 0.3, 24), new THREE.MeshStandardMaterial({ color: '#1b2024', roughness: 0.8 }));
cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
cyl.position.copy(sh.position);
wrist.add(cyl);
rig.root.updateMatrixWorld(true);
const centre = sh.getWorldPosition(new THREE.Vector3());
const wq = wrist.getWorldQuaternion(new THREE.Quaternion());
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
// six views in the wrist's frame: palm side, back, thumb side, little-finger side, from the fingertips, from the wrist
const views: [string, THREE.Vector3][] = [
  ['Handfläche', new THREE.Vector3(side === 'L' ? -1 : 1, 0, 0)],
  ['Handrücken', new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0)],
  ['Daumenseite', new THREE.Vector3(0, 0, 1)],
  ['Kleinfingerseite', new THREE.Vector3(0, 0, -1)],
  ['von den Fingerspitzen', new THREE.Vector3(0, -1, 0.2)],
  ['schräg', new THREE.Vector3(side === 'L' ? -0.6 : 0.6, -0.4, 0.7)],
];
for (const [name, d] of views) {
  const dw = d.clone().normalize().applyQuaternion(wq);
  camera.position.copy(centre).addScaledVector(dw, 0.32);
  camera.up.set(0, 1, 0).applyQuaternion(wq);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const f = document.createElement('figure');
  f.style.margin = '0';
  f.innerHTML = `<img src="${canvas.toDataURL('image/png')}"><figcaption>${side} · ${name}</figcaption>`;
  out.appendChild(f);
}
// the skinned skin of each finger against the grip: per part (0 base … 2 tip) the vertices' mean and least distance
// from the grip's axis in mm (the grip's surface at SHAFT_R)
let skinned: THREE.SkinnedMesh | null = null;
rig.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
if (skinned) {
  const sm = skinned as THREE.SkinnedMesh;
  sm.skeleton.update();
  const axisW = dir.clone().applyQuaternion(wq).normalize();
  const si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
  const stats: Record<string, number[]> = {};
  const v = new THREE.Vector3();
  for (let i = 0; i < si.count; i++) {
    let bi = 0, bw = -1;
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); bi = si.getComponent(i, c); }
    const name = sm.skeleton.bones[bi].name;
    if (!/^(index|middle|ring|little)\d/.test(name) || !name.endsWith(side)) continue;
    sm.getVertexPosition(i, v);
    v.applyMatrix4(sm.matrixWorld);
    const d = v.clone().sub(centre);
    const r = d.sub(axisW.clone().multiplyScalar(d.dot(axisW))).length() * 1000;
    (stats[name] ??= []).push(r);
  }
  const pre = document.createElement('pre');
  pre.id = 'stats';
  pre.textContent = Object.entries(stats).sort().map(([n, a]) => `${n.padEnd(9)} mean ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}  min ${Math.min(...a).toFixed(1)}  max ${Math.max(...a).toFixed(1)}  n ${a.length}`).join('\n') + `\ngrip r ${(SHAFT_R * 1000).toFixed(1)}`;
  document.body.appendChild(pre);
}
document.body.dataset.done = '1';
