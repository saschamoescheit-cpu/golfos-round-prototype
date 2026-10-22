import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The surroundings of the realistic golfer (19.10.2026): grass with mowing stripes, uneven tone and blades, a sky that
// fades to the horizon and a line of trees far behind – worked out in the shader and in a few shapes, nothing to load.

const NOISE = /* glsl */ `
float gHash2(vec2 p) { p = fract(p * vec2(0.3183, 0.3679) + 0.1); p *= 17.0; return fract(p.x * p.y * (p.x + p.y)); }
float gNoise2(vec2 x) { vec2 i = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash2(i), gHash2(i + vec2(1, 0)), f.x), mix(gHash2(i + vec2(0, 1)), gHash2(i + vec2(1, 1)), f.x), f.y); }
`;

/** grass: the base colour, darker and lighter patches, mowing stripes along the target line (x), short blades as
 *  bump; `fine` for the tee pad and the green (shorter, smoother) */
export function grassMaterial(color: string, opts: { stripes?: number; fine?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
  const stripes = opts.stripes ?? 0.06;
  const blade = opts.fine ? 0.00015 : 0.0005;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGround;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 g = vGround.xz;
        float gPatch = gNoise2(g * 0.35) * 0.6 + gNoise2(g * 1.7) * 0.4;
        float stripe = step(0.5, fract(g.y / 3.0 + 0.25)) * 2.0 - 1.0;
        diffuseColor.rgb *= 0.9 + gPatch * 0.2 + stripe * ${stripes.toFixed(3)};
        float bladeH = gNoise2(g * vec2(260.0, 90.0)) * 0.6 + gNoise2(g * 520.0) * 0.4;
        diffuseColor.rgb *= 0.94 + bladeH * 0.12;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(bladeH), hy = dFdy(bladeH);
          float fade = 1.0 - smoothstep(0.35, 0.9, abs(hx) + abs(hy));
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 g2 = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - g2 * ${blade.toExponential(3)} * fade);
        }`,
      );
  };
  m.customProgramCacheKey = () => `grass-${opts.fine ? 'fine' : 'rough'}-${stripes}`;
  return m;
}

/** a sky from the horizon (hazy, light) to the zenith (blue) */
export function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7fb2dc');
  grad.addColorStop(0.55, '#b9d7ee');
  grad.addColorStop(1, '#e4eef3');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a line of trees around the range, far away (the fog makes it hazy): each crown a few lumpy clumps of leaves, in
 *  slightly different greens with lighter and darker patches, on a thin trunk – all of them in two instanced meshes
 *  (two draw calls for 80 trees) */
export function treeLine(): THREE.Group {
  const g = new THREE.Group();
  // the same trees every time (no randomness in a video)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // one lumpy clump, reused: an icosphere pushed in and out at two scales
  // (the icosphere comes with its corners split: joined, the crown shades round and soft instead of in facets)
  const clump = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute('normal').deleteAttribute('uv'));
  const cp = clump.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(cp, i);
    const k = 1 + 0.16 * Math.sin(v.x * 4.1 + v.y * 2.3) * Math.cos(v.z * 3.7 - v.y * 1.9) + 0.07 * Math.sin(v.x * 11 + v.z * 9) * Math.cos(v.y * 12);
    cp.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  clump.computeVertexNormals();
  const leaves = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  leaves.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeaf;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLeaf = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLeaf;
float lHash(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lNoise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(lHash(i), lHash(i + vec3(1,0,0)), f.x), mix(lHash(i + vec3(0,1,0)), lHash(i + vec3(1,1,0)), f.x), f.y), mix(mix(lHash(i + vec3(0,0,1)), lHash(i + vec3(1,0,1)), f.x), mix(lHash(i + vec3(0,1,1)), lHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float lf = lNoise(vLeaf * 2.2) * 0.6 + lNoise(vLeaf * 7.0) * 0.4;
float leafH = lNoise(vLeaf * 18.0);
diffuseColor.rgb *= (0.62 + lf * 0.55) * (0.8 + leafH * 0.35);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // the leaves as bump: little clusters catching the light or lying in shade
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(leafH), hy = dFdy(leafH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.12);
}`,
      );
  };
  leaves.customProgramCacheKey = () => 'tree-leaves';
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3b2a', roughness: 1 });
  // per tree six clumps of the crown and two bushes of undergrowth beside it (a wood's edge, not a row of poles)
  const N = 90, C = 6, B = 2;
  const crowns = new THREE.InstancedMesh(clump, leaves, N * (C + B));
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 7), bark, N);
  const greens = ['#3f6b31', '#4a7a36', '#36602b', '#557f3c', '#476f30'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd() * 0.04;
    const r = 40 + rnd() * 12;
    const h = 9 + rnd() * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    m.compose(new THREE.Vector3(x, h * 0.27, z), q, new THREE.Vector3(1.3, h * 0.55, 1.3));
    trunks.setMatrixAt(i, m);
    const w = 2.6 + rnd() * 1.8;
    for (let c = 0; c < C; c++) {
      const s2 = w * (0.5 + rnd() * 0.4);
      q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
      m.compose(new THREE.Vector3(x + (rnd() - 0.5) * w * 1.1, h * (0.42 + rnd() * 0.48), z + (rnd() - 0.5) * w * 1.1), q, new THREE.Vector3(s2, s2 * (0.75 + rnd() * 0.3), s2));
      crowns.setMatrixAt(k, m);
      crowns.setColorAt(k, greens[Math.floor(rnd() * greens.length)]);
      k++;
    }
    for (let b = 0; b < B; b++) {
      const ab = a + ((b + 0.5) / B) * (Math.PI * 2 / N), rb = r + (rnd() - 0.3) * 3;
      const s2 = 1.2 + rnd() * 1.4;
      q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
      m.compose(new THREE.Vector3(Math.cos(ab) * rb, s2 * 0.45, Math.sin(ab) * rb), q, new THREE.Vector3(s2 * 1.3, s2 * 0.8, s2 * 1.3));
      crowns.setMatrixAt(k, m);
      crowns.setColorAt(k, greens[Math.floor(rnd() * greens.length)].clone().multiplyScalar(0.85));
      k++;
    }
    q.identity();
  }
  // the instances are spread round the range: the bounds of one shape at the origin would cull them all
  trunks.frustumCulled = crowns.frustumCulled = false;
  g.add(trunks, crowns);
  return g;
}
