import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyPose, buildRig, type Rig } from './rig';
import { loadRealisticBody } from './rigSkin';
import { floorAt, sample, skinFloor, type Clip } from './scene';
import { CLIPS } from './clips';
import { DRILL_CLIPS, RETEST_CLIPS } from './drills';
import { WARMUP_CLIPS } from './warmup';

// No body part through another one (06.11.2026): on the realistic golfer, the skin of each part (hand, forearm, upper
// arm, thigh, shin, foot, trunk, head) against the inner core of every part it is not joined to – a capsule along the
// bone, its radius in five steps along it the inner quarter of that part's own skin there. Skin lying on skin (the thighs
// on the shins when kneeling back, the feet together, a hand on a thigh) presses up to 4 cm into such a core; an arm
// through a leg or a hand in the head goes deeper. Found so: the arms crossed on the chest 6 cm in the thighs at the
// 90/90 switch, the hands behind the head 4 cm in it, the arms of the prone Y along and in the head.
const LIMIT = 0.05;
const ALL = { ...CLIPS, ...DRILL_CLIPS, ...RETEST_CLIPS, ...WARMUP_CLIPS } as Record<string, Clip>;

type Part = { name: string; bones: RegExp; a: () => THREE.Vector3; b: () => THREE.Vector3 };
type Vx = { m: THREE.SkinnedMesh; i: number };
const BINS = 5;

function setup(rig: Rig) {
  const J = (n: string) => () => rig.joints[n as 'kneeL'].getWorldPosition(new THREE.Vector3());
  const local = (n: string, v: [number, number, number]) => () => rig.joints[n as 'kneeL'].localToWorld(new THREE.Vector3(...v));
  // the hand's axis: from the wrist to the middle of the four knuckles
  const knuckles = (s: 'L' | 'R') => () => {
    const f = rig.fingers[s].filter((x) => !x.thumb);
    return f.reduce((m, x) => m.add(x.base.getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).multiplyScalar(1 / f.length);
  };
  const parts: Part[] = [];
  for (const s of ['L', 'R'] as const)
    parts.push(
      { name: `upperArm${s}`, bones: new RegExp(`^shoulder${s}$`), a: J(`shoulder${s}`), b: J(`elbow${s}`) },
      { name: `forearm${s}`, bones: new RegExp(`^elbow${s}$`), a: J(`elbow${s}`), b: J(`wrist${s}`) },
      { name: `hand${s}`, bones: new RegExp(`^(wrist${s}|(index|middle|ring|little)[012]${s})$`), a: J(`wrist${s}`), b: knuckles(s) },
      { name: `thigh${s}`, bones: new RegExp(`^hip${s}$`), a: J(`hip${s}`), b: J(`knee${s}`) },
      { name: `shin${s}`, bones: new RegExp(`^knee${s}$`), a: J(`knee${s}`), b: J(`ankle${s}`) },
      { name: `foot${s}`, bones: new RegExp(`^ankle${s}$`), a: local(`ankle${s}`, [0, -0.05, -0.04]), b: local(`ankle${s}`, [0, -0.05, 0.15]) },
    );
  parts.push(
    // the trunk as one (its bones share the skin), the skull without the neck
    { name: 'trunk', bones: /^(pelvis|spine|chest)$/, a: J('pelvis'), b: J('neck') },
    { name: 'head', bones: /^head$/, a: local('head', [0, 0.06, 0]), b: local('head', [0, 0.13, 0]) },
  );
  // parts that meet at a joint never count against each other
  const joined = new Set(
    [['upperArm', 'forearm'], ['forearm', 'hand'], ['thigh', 'shin'], ['shin', 'foot']]
      .flatMap(([x, y]) => ['L', 'R'].map((s) => `${x}${s}|${y}${s}`))
      .concat(['L', 'R'].flatMap((s) => [`upperArm${s}|trunk`, `upperArm${s}|head`, `thigh${s}|trunk`]))
      .concat(['trunk|head', 'thighL|thighR']),
  );
  // the vertices that clearly belong to one part (every 8th)
  const verts: Record<string, Vx[]> = {};
  rig.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const si = m.geometry.attributes.skinIndex;
    const sw = m.geometry.attributes.skinWeight;
    const names = m.skeleton.bones.map((b) => b.name);
    for (let i = 0; i < m.geometry.attributes.position.count; i += 8)
      for (const part of parts) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (part.bones.test(names[si.getComponent(i, k)] ?? '')) w += sw.getComponent(i, k);
        if (w >= 0.9) (verts[part.name] ??= []).push({ m, i });
      }
  });
  const v = new THREE.Vector3();
  const world = (x: Vx) => {
    v.fromBufferAttribute(x.m.geometry.attributes.position, x.i);
    x.m.applyBoneTransform(x.i, v);
    return v.applyMatrix4(x.m.matrixWorld).clone();
  };
  // the core radius in five steps along each part, in the rest pose (the skin beyond the ends says nothing of it)
  applyPose(rig, { j: {} }, true);
  rig.root.updateMatrixWorld(true);
  const core: Record<string, number[]> = {};
  for (const p of parts) {
    const a = p.a();
    const b = p.b();
    const by: number[][] = Array.from({ length: BINS }, () => []);
    for (const x of verts[p.name] ?? []) {
      const { t, raw, d } = seg(world(x), a, b);
      if (raw >= 0 && raw <= 1) by[bin(t)].push(d);
    }
    core[p.name] = by.map((d) => (d.sort((x, y) => x - y), d.length >= 4 ? d[Math.floor(d.length * 0.25)] : 0));
  }
  return { parts, verts, world, core, joined: (x: string, y: string) => joined.has(`${x}|${y}`) || joined.has(`${y}|${x}`) };
}
function seg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const raw = p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq());
  const t = Math.max(0, Math.min(1, raw));
  return { t, raw, d: p.distanceTo(a.clone().addScaledVector(ab, t)) };
}
const bin = (t: number) => Math.min(BINS - 1, Math.floor(t * BINS));

describe('realistic golfer: no body part through another one', () => {
  it('in every Agility clip, at 12 moments, nothing deeper than 5 cm in a part it is not joined to', async () => {
    await loadRealisticBody();
    const rig = buildRig({ skin: 'realistic' });
    expect(rig.root.userData.realistic).toBe(true);
    const { parts, verts, world, core, joined } = setup(rig);
    const bad: string[] = [];
    for (const [id, clip] of Object.entries(ALL)) {
      const offs = skinFloor(rig, clip);
      const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
      for (let i = 0; i < 12; i++) {
        const t = (len * i) / 12;
        applyPose(rig, sample(clip, t).pose, clip.ground ?? true);
        if (offs) rig.root.position.y += floorAt(offs, clip, t);
        rig.root.updateMatrixWorld(true);
        const pos: Record<string, THREE.Vector3[]> = {};
        for (const p of parts) pos[p.name] = (verts[p.name] ?? []).map(world);
        for (const q of parts) {
          const r = core[q.name];
          if (!r.some((x) => x > 0)) continue;
          const a = q.a();
          const b = q.b();
          for (const p of parts) {
            if (p === q || joined(p.name, q.name)) continue;
            let deepest = 0;
            for (const x of pos[p.name]) {
              const s = seg(x, a, b);
              deepest = Math.max(deepest, r[bin(s.t)] - s.d);
            }
            if (deepest > LIMIT) bad.push(`${id} ${t.toFixed(1)} s: ${p.name} ${(deepest * 100).toFixed(0)} cm in ${q.name}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120000);
});
