import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyPose, buildRig, type JointId } from './rig';
import { floorAt, plantShift, sample, type Clip } from './scene';
import { CLIPS } from './clips';
import { DRILL_CLIPS, RETEST_CLIPS } from './drills';

// The figure is placed by its pelvis: a pose that moves the hips (a squat, rocking back on all fours) slid the feet, hands
// or knees over the floor. Clips name their planted parts (plant) and the body moves over them (24.10.2026).
const ALL = { ...CLIPS, ...DRILL_CLIPS, ...RETEST_CLIPS } as Record<string, Clip>;
const rig = buildRig();

/** how far each planted part moves along the floor while it rests on it (cm), the clip as the scene shows it */
function slide(clip: Clip, parts: JointId[]): Record<string, number> {
  const shift = plantShift(rig, clip);
  const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
  const track: Record<string, THREE.Vector3[]> = {};
  for (let i = 0; i <= 60; i++) {
    const t = (len * i) / 60;
    applyPose(rig, sample(clip, t).pose, clip.ground ?? true);
    if (shift) {
      rig.root.position.x += floorAt(shift.x, clip, t);
      rig.root.position.z += floorAt(shift.z, clip, t);
    }
    rig.root.updateMatrixWorld(true);
    for (const n of parts) (track[n] ??= []).push(rig.joints[n].getWorldPosition(new THREE.Vector3()));
  }
  const out: Record<string, number> = {};
  for (const n of parts) {
    const ps = track[n];
    const low = Math.min(...ps.map((p) => p.y));
    if (low > 0.12) continue;
    // the runs on the floor: the farthest from where the run began
    let from: THREE.Vector3 | null = null;
    let worst = 0;
    for (const p of ps) {
      if (p.y > low + 0.02) {
        from = null;
        continue;
      }
      from ??= p;
      worst = Math.max(worst, Math.hypot(p.x - from.x, p.z - from.z));
    }
    out[n] = Math.round(worst * 100);
  }
  return out;
}

describe('planted parts stay where they are', () => {
  it('every clip that names planted parts keeps them within 5 cm', () => {
    for (const [id, clip] of Object.entries(ALL)) {
      if (!clip.plant?.length) continue;
      for (const [n, cm] of Object.entries(slide(clip, clip.plant))) expect(cm, `${id} ${n}`).toBeLessThanOrEqual(5);
    }
  });

  it('the deep squat: the pelvis goes back, the feet stay (they slid 21 cm)', () => {
    const s = slide(CLIPS['deep-squat'], ['ankleL', 'ankleR']);
    expect(s.ankleL).toBeLessThanOrEqual(3);
    expect(s.ankleR).toBeLessThanOrEqual(3);
  });

  it('nothing planted: no shift', () => {
    expect(plantShift(rig, CLIPS['toe-touch'])).toBeNull();
  });

  it('the shift closes the loop (no jump when the clip starts again)', () => {
    for (const [id, clip] of Object.entries(ALL)) {
      const s = plantShift(rig, clip);
      if (!s) continue;
      expect(Math.abs(s.x[0]), id).toBeLessThan(1e-9);
      const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
      expect(Math.abs(floorAt(s.z, clip, len - 1e-6) - floorAt(s.z, clip, 0)), id).toBeLessThan(0.01);
    }
  });

  it('the cat and the cow keep the hands where they are on the floor', () => {
    const s = slide(DRILL_CLIPS['mob-cat-camel'], ['wristL', 'wristR', 'kneeL', 'kneeR']);
    for (const [n, cm] of Object.entries(s)) expect(cm, n).toBeLessThanOrEqual(5);
  });
});
