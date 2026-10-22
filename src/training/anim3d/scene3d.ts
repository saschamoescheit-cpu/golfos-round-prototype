import * as THREE from 'three';

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

/** a line of trees around the range, far away (the fog makes it hazy) */
export function treeLine(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#3d6a33', roughness: 1 });
  const trunk = new THREE.MeshStandardMaterial({ color: '#4a3b2a', roughness: 1 });
  // the same trees every time (no randomness in a video)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rnd() * 0.05;
    const r = 36 + rnd() * 6;
    const h = 6 + rnd() * 6;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
    crown.scale.set(1.6 + rnd() * 1.4, h * 0.45, 1.6 + rnd() * 1.4);
    crown.position.set(Math.cos(a) * r, h * 0.62, Math.sin(a) * r);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h * 0.45, 6), trunk);
    t.position.set(Math.cos(a) * r, h * 0.22, Math.sin(a) * r);
    g.add(crown, t);
  }
  return g;
}
