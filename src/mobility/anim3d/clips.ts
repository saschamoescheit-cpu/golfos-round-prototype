import { L } from '../../training/types';
import type { JointId, Pose, Rot } from './rig';
import type { Clip, Key } from './scene';
import type { TestId } from '../types';

// The 3D videos of the 15 Agility tests: each a loop of key poses with the step shown below the video. The angles are
// worked out from the body angles the test text asks for (e.g. deep squat: thighs 10° past horizontal, shins 35°
// forward, the trunk parallel to the shins, the arms in line with the trunk). Signs: see rig.ts.

export type J = Partial<Record<JointId, Rot>>;
export const P = (j: J, extra: Omit<Pose, 'j'> = {}): Pose => ({ j, ...extra });

// ---------- building blocks ----------
/** arms hanging relaxed beside the body */
export const ARMS_DOWN: J = { shoulderL: [0, 0, 7], shoulderR: [0, 0, -7], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] };
/** arms crossed on the chest (relative to the chest) */
export const ARMS_CROSSED: J = { shoulderL: [-30, -80, 5], shoulderR: [-30, 80, -5], elbowL: [-115, 0, 0], elbowR: [-115, 0, 0] };
/** hands on the hips, elbows out */
export const HANDS_ON_HIPS: J = { shoulderL: [10, -40, 35], shoulderR: [10, 40, -35], elbowL: [-100, 0, 0], elbowR: [-100, 0, 0] };

/** standing tall */
export const stand = (j: J = {}, extra: Omit<Pose, 'j'> = {}): Pose => P({ ...ARMS_DOWN, hipL: [0, 0, 2], hipR: [0, 0, -2], ...j }, extra);

/** golf posture: hip hinge 35°, knees soft, trunk 40° forward, eyes down */
export const GOLF: J = {
  pelvis: [35, 0, 0],
  spine: [3, 0, 0],
  chest: [2, 0, 0],
  neck: [-4, 0, 0],
  head: [14, 0, 0],
  hipL: [-50, 0, 4],
  hipR: [-50, 0, -4],
  kneeL: [30, 0, 0],
  kneeR: [30, 0, 0],
  ankleL: [-15, 0, 0],
  ankleR: [-15, 0, 0],
  shoulderL: [-40, 0, -6],
  shoulderR: [-40, 0, 6],
  elbowL: [-8, 0, 0],
  elbowR: [-8, 0, 0],
};
export const golf = (j: J = {}): Pose => P({ ...GOLF, ...j });

/** sitting upright on a chair or against the wall (thighs level, knees 90°) */
export const SIT: J = { hipL: [-90, 0, 4], hipR: [-90, 0, -4], kneeL: [90, 0, 0], kneeR: [90, 0, 0] };
export const SIT_Y = -0.42;

export const k = (t: number, pose: Pose, label?: L): Key => ({ t, pose, label });

/** a joint list with left and right swapped (the other side of a test) */
export function mirrorJ(j: J): J {
  const out: J = {};
  for (const [id, r] of Object.entries(j) as [JointId, Rot][]) {
    const m = id.endsWith('L') ? (id.slice(0, -1) + 'R') as JointId : id.endsWith('R') ? (id.slice(0, -1) + 'L') as JointId : id;
    out[m] = [r[0], -r[1], -r[2]];
  }
  return out;
}

// ---------- the clips ----------
export const CLIPS: Record<TestId, Clip> = {
  'pelvic-rotation': {
    view: 'angle',
    views: ['angle', 'above', 'front'],
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, arms crossed', 'Golfhaltung, Arme verschränkt')),
      k(1.2, golf(ARMS_CROSSED)),
      k(2.4, golf({ ...ARMS_CROSSED, pelvis: [35, 32, 0], chest: [2, -30, 0], hipL: [-50, -28, 4], hipR: [-50, -28, -4] }), L('Turn the hips to the left – the chest stays', 'Hüfte nach links drehen – die Brust bleibt')),
      k(3.2, golf({ ...ARMS_CROSSED, pelvis: [35, 32, 0], chest: [2, -30, 0], hipL: [-50, -28, 4], hipR: [-50, -28, -4] })),
      k(4.4, golf({ ...ARMS_CROSSED, pelvis: [35, -32, 0], chest: [2, 30, 0], hipL: [-50, 28, 4], hipR: [-50, 28, -4] }), L('… and to the right', '… und nach rechts')),
      k(5.2, golf({ ...ARMS_CROSSED, pelvis: [35, -32, 0], chest: [2, 30, 0], hipL: [-50, 28, 4], hipR: [-50, 28, -4] })),
      k(6.4, golf(ARMS_CROSSED)),
    ],
  },
  'lower-quarter': {
    view: 'front',
    views: ['front', 'above', 'angle'],
    keys: [
      k(0, stand(HANDS_ON_HIPS), L('Hands on the hips', 'Hände an die Hüfte')),
      k(1.0, stand({ ...HANDS_ON_HIPS, hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0], hipL: [0, 0, -2] }), L('All the weight on the left leg, the right toe only touches', 'Gewicht aufs linke Bein, die rechte Fußspitze tippt nur')),
      k(1.8, stand({ ...HANDS_ON_HIPS, hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0], hipL: [0, 0, -2] })),
      k(3.0, stand({ ...HANDS_ON_HIPS, pelvis: [0, 60, 0], hipL: [0, -60, -2], hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0] }), L('Turn the pelvis as far as you can to the left …', 'Becken so weit wie möglich nach links drehen …')),
      k(3.8, stand({ ...HANDS_ON_HIPS, pelvis: [0, 60, 0], hipL: [0, -60, -2], hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0] })),
      k(5.2, stand({ ...HANDS_ON_HIPS, pelvis: [0, -60, 0], hipL: [0, 60, -2], hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0] }), L('… and to the right – around the standing leg', '… und nach rechts – um das Standbein')),
      k(6.0, stand({ ...HANDS_ON_HIPS, pelvis: [0, -60, 0], hipL: [0, 60, -2], hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0] })),
      k(7.2, stand({ ...HANDS_ON_HIPS, hipR: [-12, 0, -2], kneeR: [28, 0, 0], ankleR: [-8, 0, 0], hipL: [0, 0, -2] })),
      k(8.0, stand(HANDS_ON_HIPS)),
    ],
  },
  'single-leg': {
    view: 'angle',
    views: ['angle', 'front', 'side'],
    keys: [
      k(0, stand(ARMS_CROSSED), L('Arms crossed on the chest', 'Arme vor der Brust verschränken')),
      k(1.2, stand(ARMS_CROSSED)),
      k(2.2, stand({ ...ARMS_CROSSED, hipR: [-88, 0, -2], kneeR: [92, 0, 0], ankleR: [20, 0, 0] }), L('Right knee up to hip height', 'Rechtes Knie auf Hüfthöhe')),
      k(3.0, stand({ ...ARMS_CROSSED, hipR: [-88, 0, -2], kneeR: [92, 0, 0], ankleR: [20, 0, 0], head: [6, 0, 0] }, { eyes: 0 }), L('Eyes closed – stand still for 20 s', 'Augen zu – 20 s ruhig stehen')),
      k(4.5, stand({ ...ARMS_CROSSED, hipR: [-88, 0, -4], kneeR: [92, 0, 0], ankleR: [20, 0, 0], head: [6, 0, 0], pelvis: [0, 0, 2] }, { eyes: 0 })),
      k(6.0, stand({ ...ARMS_CROSSED, hipR: [-88, 0, -1], kneeR: [92, 0, 0], ankleR: [20, 0, 0], head: [6, 0, 0], pelvis: [0, 0, -2] }, { eyes: 0 })),
      k(7.0, stand({ ...ARMS_CROSSED, hipR: [-88, 0, -2], kneeR: [92, 0, 0], ankleR: [20, 0, 0], head: [6, 0, 0] }, { eyes: 0 })),
      k(8.0, stand(ARMS_CROSSED), L('Then the other leg', 'Dann das andere Bein')),
      k(9.0, stand(ARMS_CROSSED)),
    ],
  },
  neck: {
    view: 'front',
    views: ['front', 'above', 'angle'],
    focus: [0, 1.45, 0],
    dist: 2.0,
    keys: [
      k(0, stand(ARMS_CROSSED), L('Look at the phone', 'Zum Handy schauen')),
      k(1.2, stand(ARMS_CROSSED)),
      k(2.4, stand({ ...ARMS_CROSSED, neck: [0, 30, 0], head: [0, 42, 0] }), L('Turn the chin towards the left shoulder', 'Kinn zur linken Schulter drehen')),
      k(3.2, stand({ ...ARMS_CROSSED, neck: [0, 30, 0], head: [0, 42, 0] })),
      k(4.2, stand(ARMS_CROSSED), L('Back to the middle', 'Zurück zur Mitte')),
      k(5.4, stand({ ...ARMS_CROSSED, neck: [0, -30, 0], head: [0, -42, 0] }), L('… then to the right – the shoulders stay still', '… dann nach rechts – die Schultern bleiben ruhig')),
      k(6.2, stand({ ...ARMS_CROSSED, neck: [0, -30, 0], head: [0, -42, 0] })),
      k(7.2, stand(ARMS_CROSSED)),
    ],
  },
  'seated-rotation': {
    view: 'above',
    views: ['above', 'front', 'angle'],
    ground: false,
    props: ['chair', 'barChest'],
    keys: [
      k(0, P({ ...SIT, ...ARMS_CROSSED }, { y: SIT_Y }), L('Sit tall, a club across the shoulders', 'Aufrecht sitzen, Schläger vor den Schultern')),
      k(1.2, P({ ...SIT, ...ARMS_CROSSED }, { y: SIT_Y })),
      k(2.6, P({ ...SIT, ...ARMS_CROSSED, spine: [0, 20, 0], chest: [0, 27, 0], head: [0, -10, 0] }, { y: SIT_Y }), L('Turn the chest to the left – knees and hips stay', 'Brust nach links drehen – Knie und Hüfte bleiben')),
      k(3.4, P({ ...SIT, ...ARMS_CROSSED, spine: [0, 20, 0], chest: [0, 27, 0], head: [0, -10, 0] }, { y: SIT_Y })),
      k(4.6, P({ ...SIT, ...ARMS_CROSSED }, { y: SIT_Y }), L('Back to the middle', 'Zurück zur Mitte')),
      k(6.0, P({ ...SIT, ...ARMS_CROSSED, spine: [0, -20, 0], chest: [0, -27, 0], head: [0, 10, 0] }, { y: SIT_Y }), L('… then to the right', '… dann nach rechts')),
      k(6.8, P({ ...SIT, ...ARMS_CROSSED, spine: [0, -20, 0], chest: [0, -27, 0], head: [0, 10, 0] }, { y: SIT_Y })),
      k(8.0, P({ ...SIT, ...ARMS_CROSSED }, { y: SIT_Y })),
    ],
  },
  'deep-squat': {
    view: 'side',
    props: ['barHands'],
    keys: [
      k(0, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] }), L('Arms straight up, a stick in the hands', 'Arme gestreckt nach oben, Stab in den Händen')),
      k(1.2, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] })),
      k(3.2, P({ pelvis: [30, 0, 0], spine: [5, 0, 0], chest: [5, 0, 0], head: [-20, 0, 0], hipL: [-130, 0, 10], hipR: [-130, 0, -10], kneeL: [135, 0, 0], kneeR: [135, 0, 0], ankleL: [-35, 0, 0], ankleR: [-35, 0, 0], shoulderL: [-178, 0, 12], shoulderR: [-178, 0, -12] }), L('Squat as deep as you can – heels down, arms stay up', 'So tief wie möglich in die Hocke – Fersen unten, Arme bleiben oben')),
      k(4.4, P({ pelvis: [30, 0, 0], spine: [5, 0, 0], chest: [5, 0, 0], head: [-20, 0, 0], hipL: [-130, 0, 10], hipR: [-130, 0, -10], kneeL: [135, 0, 0], kneeR: [135, 0, 0], ankleL: [-35, 0, 0], ankleR: [-35, 0, 0], shoulderL: [-178, 0, 12], shoulderR: [-178, 0, -12] })),
      k(6.2, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] }), L('Stand up again', 'Wieder aufstehen')),
      k(7.0, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] })),
    ],
  },
  'toe-touch': {
    view: 'side',
    keys: [
      k(0, stand({ hipL: [0, 0, -1], hipR: [0, 0, 1] }), L('Feet together, knees straight', 'Füße zusammen, Knie gestreckt')),
      k(1.2, stand({ hipL: [0, 0, -1], hipR: [0, 0, 1] })),
      k(3.2, P({ pelvis: [72, 0, 0], spine: [20, 0, 0], chest: [18, 0, 0], neck: [10, 0, 0], head: [10, 0, 0], hipL: [-74, 0, -1], hipR: [-74, 0, 1], shoulderL: [-118, 0, 4], shoulderR: [-118, 0, -4], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] }), L('Bend forward, fingertips to the toes', 'Nach vorn beugen, Fingerspitzen zu den Zehen')),
      k(4.4, P({ pelvis: [72, 0, 0], spine: [20, 0, 0], chest: [18, 0, 0], neck: [10, 0, 0], head: [10, 0, 0], hipL: [-74, 0, -1], hipR: [-74, 0, 1], shoulderL: [-118, 0, 4], shoulderR: [-118, 0, -4], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] })),
      k(6.2, stand({ hipL: [0, 0, -1], hipR: [0, 0, 1] }), L('Roll up again', 'Wieder aufrichten')),
      k(7.0, stand({ hipL: [0, 0, -1], hipR: [0, 0, 1] })),
    ],
  },
  'shoulder-9090': {
    view: 'angle',
    views: ['angle', 'front', 'side'],
    keys: [
      k(0, golf(), L('Golf posture', 'Golfhaltung')),
      k(1.0, golf()),
      k(2.2, golf({ shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] }), L('Right upper arm out to the side, elbow 90°', 'Rechter Oberarm seitlich, Ellbogen 90°')),
      k(3.0, golf({ shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] })),
      k(4.6, golf({ shoulderR: [0, -90, -88], elbowR: [-90, 0, 0] }), L('Turn the forearm back and up – parallel to the spine', 'Unterarm nach hinten oben drehen – parallel zur Wirbelsäule')),
      k(5.6, golf({ shoulderR: [0, -90, -88], elbowR: [-90, 0, 0] })),
      k(6.8, golf({ shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] })),
      k(7.8, golf(), L('Then the other arm', 'Dann der andere Arm')),
      k(8.4, golf()),
    ],
  },
  lat: {
    view: 'side',
    ground: false,
    props: ['wall'],
    keys: [
      k(0, P({ ...SIT, ...ARMS_DOWN }, { y: SIT_Y }), L('Back flat against the wall, knees almost 90°', 'Rücken flach an der Wand, Knie fast 90°')),
      k(1.0, P({ ...SIT, ...ARMS_DOWN }, { y: SIT_Y })),
      k(2.2, P({ ...SIT, shoulderL: [-90, 0, 8], shoulderR: [-90, 0, -8] }, { y: SIT_Y }), L('Arms straight forward, thumbs up', 'Arme gestreckt nach vorn, Daumen oben')),
      k(2.8, P({ ...SIT, shoulderL: [-90, 0, 8], shoulderR: [-90, 0, -8] }, { y: SIT_Y })),
      k(4.4, P({ ...SIT, shoulderL: [-176, 0, 8], shoulderR: [-176, 0, -8] }, { y: SIT_Y }), L('Raise them overhead to the wall – elbows straight', 'Über den Kopf bis zur Wand heben – Ellbogen gestreckt')),
      k(5.4, P({ ...SIT, shoulderL: [-176, 0, 8], shoulderR: [-176, 0, -8] }, { y: SIT_Y })),
      k(7.0, P({ ...SIT, ...ARMS_DOWN }, { y: SIT_Y })),
    ],
  },
  bridge: {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P({ hipL: [-55, 0, 6], hipR: [-55, 0, -6], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] }, { tip: -90 }), L('On your back, knees bent, feet flat', 'Rückenlage, Knie gebeugt, Füße flach')),
      k(1.2, P({ hipL: [-55, 0, 6], hipR: [-55, 0, -6], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] }, { tip: -90 })),
      k(2.6, P({ neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [112, 0, 0], kneeR: [112, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] }, { tip: -112 }), L('Lift the hips: knees, hips and shoulders in one line', 'Hüfte heben: Knie, Hüfte und Schultern in einer Linie')),
      k(3.4, P({ neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [112, 0, 0], kneeR: [112, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] }, { tip: -112 })),
      k(4.6, P({ neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [0, 0, 0], kneeR: [112, 0, 0], ankleL: [-20, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] }, { tip: -112 }), L('Stretch one leg, thighs parallel – hold 10 s', 'Ein Bein strecken, Oberschenkel parallel – 10 s halten')),
      k(6.6, P({ neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [0, 0, 0], kneeR: [112, 0, 0], ankleL: [-20, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] }, { tip: -112 })),
      k(7.6, P({ neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [112, 0, 0], kneeR: [112, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] }, { tip: -112 })),
      k(8.8, P({ hipL: [-55, 0, 6], hipR: [-55, 0, -6], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] }, { tip: -90 }), L('Down – then the other leg', 'Ablegen – dann das andere Bein')),
      k(9.6, P({ hipL: [-55, 0, 6], hipR: [-55, 0, -6], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] }, { tip: -90 })),
    ],
  },
  'pelvic-tilt': {
    view: 'side',
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, arms crossed', 'Golfhaltung, Arme verschränkt')),
      k(1.0, golf(ARMS_CROSSED)),
      k(2.2, golf({ ...ARMS_CROSSED, pelvis: [53, 0, 0], spine: [-15, 0, 0], hipL: [-68, 0, 4], hipR: [-68, 0, -4] }), L('Tilt the pelvis forward – hollow back', 'Becken nach vorn kippen – Hohlkreuz')),
      k(2.8, golf({ ...ARMS_CROSSED, pelvis: [53, 0, 0], spine: [-15, 0, 0], hipL: [-68, 0, 4], hipR: [-68, 0, -4] })),
      k(4.2, golf({ ...ARMS_CROSSED, pelvis: [17, 0, 0], spine: [21, 0, 0], hipL: [-32, 0, 4], hipR: [-32, 0, -4] }), L('… and back – flat back. The chest stays still', '… und zurück – flacher Rücken. Die Brust bleibt ruhig')),
      k(4.8, golf({ ...ARMS_CROSSED, pelvis: [17, 0, 0], spine: [21, 0, 0], hipL: [-32, 0, 4], hipR: [-32, 0, -4] })),
      k(6.0, golf(ARMS_CROSSED)),
    ],
  },
  'reach-roll-lift': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-150, 0, -10], elbowL: [-20, 0, 0], elbowR: [-60, 0, 0] }), L('Kneel, sit back on the heels, forehead down', 'Knien, auf die Fersen setzen, Stirn unten')),
      k(1.4, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] }), L('Right arm stretched forward, thumb up', 'Rechten Arm nach vorn strecken, Daumen oben')),
      k(2.2, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] })),
      k(3.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-200, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] }), L('Lift the straight arm – up to ear height', 'Den gestreckten Arm heben – bis auf Ohrhöhe')),
      k(4.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-200, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] })),
      k(5.8, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] }), L('Down – then the other arm', 'Ablegen – dann der andere Arm')),
      k(6.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-20, 0, 0], elbowR: [0, 0, 0] })),
      k(7.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-160, 0, 18], shoulderR: [-150, 0, -10], elbowL: [-20, 0, 0], elbowR: [-60, 0, 0] })),
    ],
  },
  forearm: {
    view: 'front',
    views: ['front', 'angle', 'side'],
    props: ['clubR'],
    focus: [-0.1, 1.2, 0.15],
    dist: 3.0,
    keys: [
      k(0, stand({ shoulderR: [0, 0, -4], elbowR: [-90, 0, 0] }), L('Elbow at the side bent 90°, the club upright', 'Ellbogen am Körper 90° gebeugt, Schläger senkrecht')),
      k(1.2, stand({ shoulderR: [0, 0, -4], elbowR: [-90, 0, 0] })),
      k(2.6, stand({ shoulderR: [0, 0, -4], elbowR: [-90, -80, 0] }), L('Turn the palm down – the club tips to the side', 'Handfläche nach unten drehen – der Schläger kippt zur Seite')),
      k(3.4, stand({ shoulderR: [0, 0, -4], elbowR: [-90, -80, 0] })),
      k(5.0, stand({ shoulderR: [0, 0, -4], elbowR: [-90, 80, 0] }), L('… then up – about 80° each way', '… dann nach oben – etwa 80° pro Seite')),
      k(5.8, stand({ shoulderR: [0, 0, -4], elbowR: [-90, 80, 0] })),
      k(7.0, stand({ shoulderR: [0, 0, -4], elbowR: [-90, 0, 0] })),
    ],
  },
  'wrist-hinge': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['clubLineR'],
    keys: [
      k(0, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [0, 0, 0] }), L('Arm straight forward, thumb up, the club in the hand', 'Arm gestreckt nach vorn, Daumen oben, Schläger in der Hand')),
      k(1.2, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [0, 0, 0] })),
      k(2.6, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [-25, 0, 0] }), L('Hinge the club up towards you', 'Den Schläger nach oben zu dir anwinkeln')),
      k(3.4, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [-25, 0, 0] })),
      k(5.0, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [32, 0, 0] }), L('… then down – only the wrist moves', '… dann nach unten – nur das Handgelenk bewegt sich')),
      k(5.8, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [32, 0, 0] })),
      k(7.0, stand({ shoulderR: [-88, 0, -4], elbowR: [-4, 0, 0], wristR: [0, 0, 0] })),
    ],
  },
  'wrist-flex': {
    // seated, the table at the right side: the forearm lies on it, the hand over the front edge
    view: 'side',
    views: ['side', 'angle'],
    ground: false,
    props: ['chair', 'sideTable'],
    keys: [
      k(0, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0] }, { y: SIT_Y }), L('Forearm on the table, the hand over the edge, back of the hand up', 'Unterarm auf dem Tisch, Hand über der Kante, Handrücken oben')),
      k(1.2, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0] }, { y: SIT_Y })),
      k(2.6, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0], wristR: [0, 0, 65] }, { y: SIT_Y }), L('Bend the hand down', 'Hand nach unten beugen')),
      k(3.4, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0], wristR: [0, 0, 65] }, { y: SIT_Y })),
      k(5.0, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0], wristR: [0, 0, -60] }, { y: SIT_Y }), L('… then up – about 60° each way', '… dann nach oben – etwa 60° in jede Richtung')),
      k(5.8, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0], wristR: [0, 0, -60] }, { y: SIT_Y })),
      k(7.0, P({ ...SIT, shoulderL: [0, 0, 7], elbowL: [-60, 0, 0], shoulderR: [0, 0, -6], elbowR: [-90, 90, 0] }, { y: SIT_Y })),
    ],
  },
};
