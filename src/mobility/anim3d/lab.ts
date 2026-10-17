// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1, one pose: qa/mobility-3d.mjs lab:<name>).
import type { Clip } from './scene';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'side'): Clip => ({ view, ground: 'all', keys: [{ t: 0, pose: { j } }, { t: 1, pose: { j } }] });
export const LAB: [string, Clip][] = [
  ['stand', still({})],
  ['kneel', still({ hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0] })],
];
