// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1, one pose: qa/mobility-3d.mjs lab:<name>).
import type { Clip } from './scene';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'angle'): Clip => ({ view, keys: [{ t: 0, pose: { j } }, { t: 1, pose: { j } }] });
export const LAB: [string, Clip][] = [
  ['a', still({ shoulderL: [0, 90, 120], shoulderR: [0, -90, -120], elbowL: [-140, 0, 0], elbowR: [-140, 0, 0] })],
  ['b', still({ shoulderL: [-20, 90, 110], shoulderR: [-20, -90, -110], elbowL: [-150, 0, 0], elbowR: [-150, 0, 0] })],
  ['c', still({ shoulderL: [0, 70, 125], shoulderR: [0, -70, -125], elbowL: [-145, 0, 0], elbowR: [-145, 0, 0] })],
];
