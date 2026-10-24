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

/**
 * The golf address – the reference posture (Sascha 17.10.2026 23:13: "look at the posture of the head … it has nothing to
 * do with golf"): bent from the hips with a straight back (trunk about 45° forward: pelvis 40°, spine and chest a few
 * degrees), knees flexed about 20° over the balls of the feet (thighs 20° forward, shins 20° back), the arms hanging
 * straight down from the shoulders, the hands a hand width in front of the thighs, the head in line with the spine and
 * the eyes down to the ball – the posture line ear – hip – knee – ankle of TPI (Adam Scott). Training builds its
 * addresses on it (ADDRESS).
 */
export const GOLF: J = {
  pelvis: [40, 0, 0],
  spine: [4, 0, 0],
  chest: [3, 0, 0],
  neck: [-6, 0, 0],
  head: [16, 0, 0],
  hipL: [-60, 0, 4],
  hipR: [-60, 0, -4],
  kneeL: [40, 0, 0],
  kneeR: [40, 0, 0],
  ankleL: [-20, 0, 0],
  ankleR: [-20, 0, 0],
  shoulderL: [-50, 0, -6],
  shoulderR: [-50, 0, 6],
  elbowL: [-8, 0, 0],
  elbowR: [-8, 0, 0],
};
export const golf = (j: J = {}): Pose => P({ ...GOLF, ...j });
/** the reference address for Training (the same as GOLF) */
export const ADDRESS = GOLF;

/** sitting upright on a chair or against the wall (thighs level, knees 90°) */
export const SIT: J = { hipL: [-90, 0, 4], hipR: [-90, 0, -4], kneeL: [90, 0, 0], kneeR: [90, 0, 0] };
export const SIT_Y = -0.42;

export const k = (t: number, pose: Pose, label?: L): Key => ({ t, pose, label });

/** the bottom of the deep squat: the feet where they stood, the knees out over the toes, the pelvis 20 cm back (fitted on
 * the realistic golfer 24.10.2026 – before, the pelvis stayed and the feet slid 21 cm, forward and together) */
/** on the back, knees bent, the feet flat on the floor, and the bridge up: the shoulders and the feet stay where they lie,
 * the pelvis rises between them (fitted on the realistic golfer 24.10.2026 – the feet hung 10 cm over the mat, and lifting
 * the hips slid the shoulders 10 cm towards the feet) */
export const HOOK: J = { hipL: [-49, 0, 6], hipR: [-49, 0, -6], kneeL: [120, 0, 0], kneeR: [120, 0, 0], ankleL: [22, 0, 0], ankleR: [22, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] };
export const BRIDGE_UP: J = { neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [104, 0, 0], kneeR: [104, 0, 0], ankleL: [9, 0, 0], ankleR: [9, 0, 0], shoulderL: [28, 0, 14], shoulderR: [28, 0, -14] };
/** the pelvis turned left / right in golf posture over feet that stay where they stand (the hips turn in, the knees stay
 * over the feet – fitted on the realistic golfer 24.10.2026; before, the legs turned with the pelvis and the feet slid
 * 15 cm) */
const PELVIS_LEFT: J = { pelvis: [40, 32, 0], chest: [3, -30, 0], hipL: [-62, -35, -12], hipR: [-52, -37, -15], ankleL: [-20, -10, 0], ankleR: [-20, -4, 0] };
const PELVIS_RIGHT: J = { pelvis: [40, -32, 0], chest: [3, 30, 0], hipL: [-52, 37, 16], hipR: [-62, 35, 12], ankleL: [-20, 4, 0], ankleR: [-20, 11, 0] };
const SQUAT_DEEP: J ={ pelvis: [30, 0, 0], spine: [5, 0, 0], chest: [5, 0, 0], head: [-20, 0, 0], hipL: [-130, -16, 5], hipR: [-130, 16, -5], kneeL: [135, 0, 0], kneeR: [135, 0, 0], ankleL: [-35, -5, 0], ankleR: [-35, 5, 0], shoulderL: [-178, 0, 12], shoulderR: [-178, 0, -12] };

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
    plant: ['ankleL', 'ankleR'],
    views: ['angle', 'above', 'front'],
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, arms crossed', 'Golfhaltung, Arme verschränkt')),
      k(1.2, golf(ARMS_CROSSED)),
      k(2.4, golf({ ...ARMS_CROSSED, ...PELVIS_LEFT }), L('Turn the hips to the left – the chest stays', 'Hüfte nach links drehen – die Brust bleibt')),
      k(3.2, golf({ ...ARMS_CROSSED, ...PELVIS_LEFT })),
      k(4.4, golf({ ...ARMS_CROSSED, ...PELVIS_RIGHT }), L('… and to the right', '… und nach rechts')),
      k(5.2, golf({ ...ARMS_CROSSED, ...PELVIS_RIGHT })),
      k(6.4, golf(ARMS_CROSSED)),
    ],
  },
  'lower-quarter': {
    view: 'front',
    plant: ['ankleL', 'ankleR'],
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
    plant: ['ankleL', 'ankleR'],
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
    plant: ['ankleL', 'ankleR'],
    props: ['barHands'],
    keys: [
      k(0, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] }), L('Arms straight up, a stick in the hands', 'Arme gestreckt nach oben, Stab in den Händen')),
      k(1.2, stand({ shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] })),
      k(3.2, P({ ...SQUAT_DEEP }, { at: [0, -0.2] }), L('Squat as deep as you can – heels down, arms stay up', 'So tief wie möglich in die Hocke – Fersen unten, Arme bleiben oben')),
      k(4.4, P({ ...SQUAT_DEEP }, { at: [0, -0.2] })),
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
    plant: ['ankleL', 'ankleR'],
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P(HOOK, { tip: -90 }), L('On your back, knees bent, feet flat', 'Rückenlage, Knie gebeugt, Füße flach')),
      k(1.2, P(HOOK, { tip: -90 })),
      k(2.6, P(BRIDGE_UP, { tip: -114 }), L('Lift the hips: knees, hips and shoulders in one line', 'Hüfte heben: Knie, Hüfte und Schultern in einer Linie')),
      k(3.4, P(BRIDGE_UP, { tip: -114 })),
      k(4.6, P({ ...BRIDGE_UP, kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -114 }), L('Stretch one leg, thighs parallel – hold 10 s', 'Ein Bein strecken, Oberschenkel parallel – 10 s halten')),
      k(6.6, P({ ...BRIDGE_UP, kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -114 })),
      k(7.6, P(BRIDGE_UP, { tip: -114 })),
      k(8.8, P(HOOK, { tip: -90 }), L('Down – then the other leg', 'Ablegen – dann das andere Bein')),
      k(9.6, P(HOOK, { tip: -90 })),
    ],
  },
  'pelvic-tilt': {
    view: 'side',
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, arms crossed', 'Golfhaltung, Arme verschränkt')),
      k(1.0, golf(ARMS_CROSSED)),
      k(2.2, golf({ ...ARMS_CROSSED, pelvis: [58, 0, 0], spine: [-14, 0, 0], hipL: [-78, 0, 4], hipR: [-78, 0, -4] }), L('Tilt the pelvis forward – hollow back', 'Becken nach vorn kippen – Hohlkreuz')),
      k(2.8, golf({ ...ARMS_CROSSED, pelvis: [58, 0, 0], spine: [-14, 0, 0], hipL: [-78, 0, 4], hipR: [-78, 0, -4] })),
      k(4.2, golf({ ...ARMS_CROSSED, pelvis: [22, 0, 0], spine: [22, 0, 0], hipL: [-42, 0, 4], hipR: [-42, 0, -4] }), L('… and back – flat back. The chest stays still', '… und zurück – flacher Rücken. Die Brust bleibt ruhig')),
      k(4.8, golf({ ...ARMS_CROSSED, pelvis: [22, 0, 0], spine: [22, 0, 0], hipL: [-42, 0, 4], hipR: [-42, 0, -4] })),
      k(6.0, golf(ARMS_CROSSED)),
    ],
  },
  'reach-roll-lift': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-143, 0, -10], elbowL: [-15, 0, 0], elbowR: [-55, 0, 0] }), L('Kneel, sit back on the heels, forehead down', 'Knien, auf die Fersen setzen, Stirn unten')),
      k(1.4, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] }), L('Right arm stretched forward, thumb up', 'Rechten Arm nach vorn strecken, Daumen oben')),
      k(2.2, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] })),
      k(3.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-200, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] }), L('Lift the straight arm – up to ear height', 'Den gestreckten Arm heben – bis auf Ohrhöhe')),
      k(4.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-200, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] })),
      k(5.8, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] }), L('Down – then the other arm', 'Ablegen – dann der andere Arm')),
      k(6.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-170, 0, -6], elbowL: [-15, 0, 0], elbowR: [0, 0, 0] })),
      k(7.6, P({ pelvis: [80, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [10, 0, 0], hipL: [-148, 0, 8], hipR: [-148, 0, -8], kneeL: [158, 0, 0], kneeR: [158, 0, 0], ankleL: [60, 0, 0], ankleR: [60, 0, 0], shoulderL: [-153, 0, 18], shoulderR: [-143, 0, -10], elbowL: [-15, 0, 0], elbowR: [-55, 0, 0] })),
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
