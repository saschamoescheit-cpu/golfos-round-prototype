// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1, one pose: qa/mobility-3d.mjs lab:<name>).
import type { Clip } from './scene';
import { GOLF } from './clips';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'side', props: Clip['props'] = []): Clip => ({ view, props, keys: [{ t: 0, pose: { j, gripL: 1, gripR: 1 } }, { t: 1, pose: { j, gripL: 1, gripR: 1 } }] });
export const LAB: [string, Clip][] = [
  ['golf', still(GOLF)],
  ['addr', still({ ...GOLF, pelvis: [40, 0, 0], spine: [4, 0, 0], chest: [3, 0, 0], neck: [-6, 0, 0], head: [16, 0, 0], hipL: [-60, 0, 4], hipR: [-60, 0, -4], kneeL: [40, 0, 0], kneeR: [40, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0], shoulderL: [-50, 0, -8], shoulderR: [-50, 0, 8] }, 'side', ['clubR'])],
];
