import * as THREE from 'three';
import type { Club3D } from './golf3d';

// The clubs of the realistic golfer (19.10.2026, Sascha: "the club does not look like a club"): shaped after real ones –
// a cavity-back iron with a rounded toe, a top line rising to the toe, a wider sole and grooves on the face, the loft of
// the club (7-iron 34°, wedge 56°, driver 10.5°, putter 3°); a hosel with its black ferrule; a stepped steel shaft (a
// graphite one for the woods); a rubber grip with its cap. Polished steel needs something to mirror – the viewer gives
// the scene an environment when the realistic golfer is on.
//
// The same frame as the simple clubs: the club along +y of its group (the butt at 0, the shaft's end at `len`); the head
// group at the shaft's end, tilted by the lie; in it +z runs from the heel to the toe, −x is where the face looks, +y
// towards the sole.

const LOFT: Record<Club3D, number> = { iron: 34, wedge: 56, driver: 10.5, hybrid: 21, putter: 3 };
/** the lie: the sole flat on the ground with the shaft this steep (a little flatter than the catalogue, as the hands of
 *  the realistic golfer hang lower at address) */
const LIE: Record<Club3D, number> = { iron: 58, wedge: 60, driver: 54, hybrid: 56, putter: 70 };

const mat = (color: string, roughness: number, metalness: number) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** an outline (heel→toe along z, up = −y) as a shape: [z, up] points */
const outline = (pts: [number, number][]) => {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
};
/** extrudes an outline back from the face (x from x0, depth d), the outline in the head frame (z, −y) */
const slab = (shape: THREE.Shape, x0: number, d: number, bevel: number, m: THREE.Material) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  // the shape lies in x/y with depth along z: turn it so x→z (heel→toe), y→−y (up), z→x (back from the face)
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)));
  g.translate(x0, 0, 0);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
};
/** a smooth curve of points through the given ones (for the iron's outline) */
const smooth = (pts: [number, number][], n = 8): [number, number][] => {
  const c = new THREE.CatmullRomCurve3(pts.map(([a, b]) => new THREE.Vector3(a, b, 0)), true, 'centripetal');
  return c.getPoints(pts.length * n).map((p) => [p.x, p.y] as [number, number]);
};

export function buildRealClub(kind: Club3D, len: number): THREE.Group {
  const g = new THREE.Group();
  const chrome = mat('#dfe5ea', 0.18, 1);
  const satin = mat('#c3cad0', 0.38, 1);
  const black = mat('#15191c', 0.55, 0.1);
  const rubber = mat('#1b2024', 0.85, 0);
  const wood = kind === 'driver' || kind === 'hybrid';
  // the grip: 27 cm of rubber, a little thicker at the butt, with its cap and a lighter band near the cap
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0108, 0.27, 24, 1), rubber);
  grip.position.y = 0.135;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0146, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), rubber);
  cap.scale.y = 0.35;
  cap.rotation.x = Math.PI;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.01465, 0.0145, 0.012, 24), mat('#3c464d', 0.7, 0));
  band.position.y = 0.022;
  // the shaft: steel with step-downs (irons), graphite (woods); narrowing to the hosel
  const sLen = len - 0.27 - (wood ? 0.03 : 0.06);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0047, sLen, 16), wood ? mat('#2c3338', 0.35, 0.2) : chrome);
  shaft.position.y = 0.27 + sLen / 2;
  g.add(grip, cap, band, shaft);
  if (!wood)
    for (let i = 0; i < 6; i++) {
      const y = 0.31 + i * 0.075;
      const r = 0.0075 - ((y - 0.27) / sLen) * 0.0028;
      const step = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0006, 6, 20), chrome);
      step.rotation.x = Math.PI / 2;
      step.position.y = y;
      g.add(step);
    }
  // the hosel with the black ferrule above it
  const hLen = wood ? 0.03 : 0.06;
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, kind === 'putter' ? 0.0062 : 0.0085, hLen, 18), wood ? mat('#1e2428', 0.3, 0.4) : chrome);
  hosel.position.y = len - hLen / 2;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0066, 0.0064, 0.011, 18), black);
  ferrule.position.y = len - hLen - 0.0055;
  g.add(hosel, ferrule);

  const head = new THREE.Group();
  head.position.y = len;
  head.rotation.x = -THREE.MathUtils.degToRad(90 - LIE[kind]);
  // the face leans back by the loft, about the leading edge
  const face = new THREE.Group();
  face.rotation.z = THREE.MathUtils.degToRad(LOFT[kind]);
  // the leading edge 7 mm below the shaft's end, so the sole sits on the ground
  face.position.y = 0.007;
  head.add(face);
  let faceX = -0.0068;
  if (kind === 'iron' || kind === 'wedge') {
    const w = kind === 'wedge';
    // the outline of the face, heel to toe: a short heel, the sole rising a little to the toe, a round toe, the top line
    const o: [number, number][] = smooth([
      [0.003, 0.006], [0.02, 0.0], [0.045, 0.0], [0.066, 0.003], [0.077, 0.013], [0.079, w ? 0.05 : 0.044], [0.07, w ? 0.056 : 0.05], [0.04, w ? 0.044 : 0.039], [0.012, 0.03], [0.002, 0.022],
    ]);
    const blade = slab(outline(o), 0, 0.0055, 0.0012, satin);
    // the back: a wide sole bar and the cavity rim along the toe and the top
    const sole = slab(outline(smooth([[0.004, 0.004], [0.03, 0.0], [0.065, 0.004], [0.075, 0.012], [0.07, 0.018], [0.03, 0.016], [0.006, 0.014]])), 0.004, w ? 0.022 : 0.018, 0.002, chrome);
    const rim = slab(outline(smooth([[0.068, 0.012], [0.078, 0.02], [0.078, 0.04], [0.068, 0.047], [0.04, 0.037], [0.014, 0.027], [0.012, 0.022], [0.04, 0.031], [0.066, 0.04], [0.071, 0.03], [0.07, 0.016]])), 0.004, 0.006, 0.001, chrome);
    for (const m of [blade, sole, rim]) m.position.y = 0;
    face.add(blade, sole, rim);
    // grooves on the face: thin dark lines across the hitting area
    const gm = mat('#4c555c', 0.6, 0.6);
    for (let i = 0; i < (w ? 14 : 12); i++) {
      const up = 0.005 + i * 0.0029;
      const z0 = 0.012 + up * 0.25, z1 = 0.066 - Math.max(0, up - 0.03) * 0.6;
      const gr = new THREE.Mesh(new THREE.BoxGeometry(0.0004, 0.0008, z1 - z0), gm);
      gr.position.set(-0.0013, -up, (z0 + z1) / 2);
      face.add(gr);
    }
    faceX = -0.0012;
  } else if (wood) {
    // a pear-shaped head: flat face, round back, the crown gloss black, the face dark steel
    const big = kind === 'driver';
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const p = geo.attributes.position;
    const L = big ? 0.06 : 0.046, D = big ? 0.056 : 0.04, H = big ? 0.03 : 0.022;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // the face: the front flattened; pear: wider at the toe and back
      x = Math.max(x, -0.82);
      const toe = (z + 1) / 2;
      p.setXYZ(i, (x + 0.82) * D * (0.85 + 0.25 * toe), -y * H * (0.9 + 0.2 * toe) - H, (z + 1) * L * 0.95 + 0.006);
    }
    geo.computeVertexNormals();
    const crown = new THREE.Mesh(geo, mat('#111517', 0.18, 0.35));
    crown.castShadow = true;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(big ? 0.1 : 0.075, big ? 0.05 : 0.036), mat('#5d666d', 0.3, 0.9));
    plate.rotation.y = -Math.PI / 2;
    plate.position.set(-0.0004, -H, L * 0.98);
    face.add(crown, plate);
    faceX = -0.0004;
  } else {
    // a blade putter: the flange behind, a white sight line on top
    const blade = slab(outline(smooth([[0.004, 0.003], [0.05, 0.0], [0.098, 0.003], [0.1, 0.022], [0.05, 0.024], [0.002, 0.021]])), 0, 0.008, 0.0015, satin);
    const flange = slab(outline(smooth([[0.012, 0.002], [0.05, 0.0], [0.09, 0.002], [0.09, 0.009], [0.05, 0.01], [0.012, 0.009]])), 0.008, 0.02, 0.0015, chrome);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0004, 0.0022), mat('#ffffff', 0.5, 0));
    line.position.set(0.016, -0.0108, 0.05);
    face.add(blade, flange, line);
    faceX = -0.0012;
  }
  g.add(head);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  g.userData.head = face;
  g.userData.faceX = faceX;
  return g;
}
