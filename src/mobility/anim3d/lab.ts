// Development only: poses side by side to tune joint angles (anim3d-preview.html?lab=1).
import type { Clip } from './scene';
import type { JointId, Rot } from './rig';

type J = Partial<Record<JointId, Rot>>;
const still = (j: J, view: Clip['view'] = 'front', extra: Partial<Clip> = {}): Clip => ({ view, keys: [{ t: 0, pose: { j } }, { t: 1, pose: { j } }], ...extra });
const down: J = { shoulderL: [0, 0, 7], shoulderR: [0, 0, -7] };
export const LAB: [string, Clip][] = [
  ['crossed A', still({ shoulderL: [-25, -60, -12], shoulderR: [-25, 60, 12], elbowL: [-120, 0, 0], elbowR: [-120, 0, 0] }, 'angle')],
  ['crossed B', still({ shoulderL: [-20, 60, -15], shoulderR: [-20, -60, 15], elbowL: [-120, 0, 0], elbowR: [-120, 0, 0] }, 'angle')],
  ['crossed C', still({ shoulderL: [-30, -80, 5], shoulderR: [-30, 80, -5], elbowL: [-115, 0, 0], elbowR: [-115, 0, 0] }, 'front')],
  ['hips A', still({ shoulderL: [10, 40, 35], shoulderR: [10, -40, -35], elbowL: [-100, 0, 0], elbowR: [-100, 0, 0] }, 'front')],
  ['hips B', still({ shoulderL: [10, -40, 35], shoulderR: [10, 40, -35], elbowL: [-100, 0, 0], elbowR: [-100, 0, 0] }, 'front')],
  ['hips C', still({ shoulderL: [20, 70, 30], shoulderR: [20, -70, -30], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] }, 'angle')],
  ['clubR elbow90', still({ ...down, shoulderR: [0, 0, -4], elbowR: [-90, 0, 0] }, 'angle', { props: ['clubR'] })],
  ['9090 y-90', still({ ...down, shoulderR: [0, -90, -88], elbowR: [-90, 0, 0] }, 'angle')],
  ['9090 y+90', still({ ...down, shoulderR: [0, 90, -88], elbowR: [-90, 0, 0] }, 'angle')],
  ['9090 y0', still({ ...down, shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] }, 'angle')],
];
