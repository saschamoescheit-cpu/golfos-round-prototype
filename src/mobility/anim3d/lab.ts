// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1, one pose: qa/mobility-3d.mjs lab:<name>).
import type { Clip } from './scene';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'side'): Clip => ({ view, ground: 'all', props: ['mat'], keys: [{ t: 0, pose: { j } }, { t: 1, pose: { j } }] });
const BACK: J = { hipR: [0, 0, -90], kneeR: [90, 0, 0] };
export const LAB: [string, Clip][] = [
  ['front y+90', still({ ...BACK, hipL: [-90, 90, 0], kneeL: [90, 0, 0] }, 'angle')],
  ['front y-90', still({ ...BACK, hipL: [-90, -90, 0], kneeL: [90, 0, 0] }, 'angle')],
  ['front y-90 above', still({ ...BACK, hipL: [-90, -90, 0], kneeL: [90, 0, 0] }, 'above')],
  ['front y+90 above', still({ ...BACK, hipL: [-90, 90, 0], kneeL: [90, 0, 0] }, 'above')],
];
