import * as THREE from 'three';

// The surfaces of the realistic golfer (19.10.2026): no image textures to load – the fine structure of each material is
// worked out in the shader from the body's own rest position (the vertex before skinning), so the pattern sticks to the
// body as it moves: the piqué knit of the polo, the twill of the trousers, the pores and the uneven tone of the skin,
// the perforation of the glove, the knit of the cap, the strands of the hair. Bump mapping from the screen derivatives
// of that height (no tangents needed); the pattern fades out where it would flicker (finer than a pixel).

export type Surface = 'skin' | 'pique' | 'twill' | 'shoe' | 'sole' | 'glove' | 'cap' | 'hair' | 'belt' | 'plain';

const NOISE = /* glsl */ `
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i + vec3(0, 0, 0)), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// the height of each surface at a rest position p (metres) and its colour variation (−1 … 1)
const HEIGHT: Record<Surface, string> = {
  // fine skin and a soft uneven tone
  skin: `h = gNoise(p * 500.0) * 0.5 + gNoise(p * 160.0) * 0.5; tone = gNoise(p * 45.0) * 2.0 - 1.0;`,
  // the polo: soft folds that hang down (the knit itself is finer than a pixel)
  pique: `h = gNoise(vec3(p.x * 32.0, p.y * 9.0, p.z * 32.0)) * 0.8 + gNoise(p * 90.0) * 0.2; tone = gNoise(p * 30.0) * 2.0 - 1.0;`,
  // the trousers: creases across the legs and long folds
  twill: `h = gNoise(vec3(p.x * 14.0, p.y * 40.0, p.z * 14.0)) * 0.7 + gNoise(vec3(p.x * 30.0, p.y * 6.0, p.z * 30.0)) * 0.3; tone = gNoise(p * 25.0) * 2.0 - 1.0;`,
  // leather grain
  shoe: `h = gNoise(p * 220.0); tone = gNoise(p * 60.0) * 2.0 - 1.0;`,
  sole: `h = step(0.5, fract(p.z * 120.0)) * 0.6; tone = 0.0;`,
  // glove leather with soft wrinkles
  glove: `h = gNoise(p * 260.0) * 0.6 + gNoise(vec3(p.x * 60.0, p.y * 20.0, p.z * 60.0)) * 0.4; tone = gNoise(p * 50.0) * 2.0 - 1.0;`,
  // a cotton twill cap
  cap: `h = gNoise(p * 140.0) * 0.6 + gNoise(vec3(p.x * 30.0, p.y * 30.0, p.z * 6.0)) * 0.4; tone = gNoise(p * 30.0) * 2.0 - 1.0;`,
  // short hair: strands along the head
  hair: `h = gNoise(vec3(p.x * 700.0, p.y * 90.0, p.z * 700.0)); tone = gNoise(p * 120.0) * 2.0 - 1.0;`,
  belt: `h = gNoise(p * 1200.0) * 0.5; tone = 0.0;`,
  plain: `h = 0.0; tone = 0.0;`,
};

/** strength of the bump (metres of height for h = 1) and of the colour variation */
const AMOUNT: Record<Surface, [number, number]> = {
  skin: [0.00012, 0.05],
  pique: [0.0022, 0.05],
  twill: [0.0028, 0.05],
  shoe: [0.0003, 0.03],
  sole: [0.0006, 0],
  glove: [0.0006, 0.03],
  cap: [0.0006, 0.04],
  hair: [0.0005, 0.2],
  belt: [0.0002, 0],
  plain: [0, 0],
};

export function surfaceMaterial(kind: Surface, color: string, roughness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const physical = kind === 'skin' || kind === 'pique' || kind === 'twill' || kind === 'cap';
  const m = physical
    ? new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, ...(kind === 'skin' ? { sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd9c4') } : { sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35) }), ...extra })
    : new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const [bump, toneAmt] = AMOUNT[kind];
  if (!bump && !toneAmt) return m;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest;\n${NOISE}\nvoid surfaceAt(vec3 p, out float h, out float tone) { ${HEIGHT[kind]} }`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sH; float sTone; surfaceAt(vRest, sH, sTone);
        diffuseColor.rgb *= 1.0 + sTone * ${toneAmt.toFixed(4)};`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump from the screen derivatives of the height; faded where the pattern is finer than a pixel
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(sH), hy = dFdy(sH);
          float fade = 1.0 - smoothstep(0.35, 0.9, abs(hx) + abs(hy));
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 g2 = sign(det) * (hx * r1 + hy * r2);
          // the height in metres: the slope is its change over the pixel's size in view space
          normal = normalize(abs(det) * normal - g2 * ${bump.toExponential(3)} * fade);
        }`,
      );
  };
  m.customProgramCacheKey = () => `surface-${kind}`;
  return m;
}
