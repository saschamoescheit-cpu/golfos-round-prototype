// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1, one pose: qa/mobility-3d.mjs lab:<name>).
import type { Clip } from './scene';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'angle', grip = 0.25, props: Clip['props'] = []): Clip => ({ view, props, focus: [0.1, 1.2, 0.45], dist: 1.2, keys: [{ t: 0, pose: { j, gripL: grip, gripR: grip } }, { t: 1, pose: { j, gripL: grip, gripR: grip } }] });
const FWD: J = { shoulderL: [-70, 0, 8], shoulderR: [-70, 0, -8] };
export const LAB: [string, Clip][] = [
  ['open', still(FWD, 'angle', 0)],
  ['relaxed', still({}, 'front', 0.25)],
  ['closed', still(FWD, 'angle', 1)],
  ['club', still({ shoulderR: [-60, 0, -8], elbowR: [-20, 0, 0] }, 'angle', 1, ['clubR'])],
];
