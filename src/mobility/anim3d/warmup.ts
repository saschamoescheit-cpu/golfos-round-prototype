import { L } from '../../training/types';
import type { Clip } from './scene';
import { ARMS_CROSSED, CLIPS, golf, k, P, PELVIS_LEFT, PELVIS_RIGHT, stand, type J } from './clips';
import { DRILL_CLIPS } from './drills';

// The 3D videos of the range warm-up (31.10.2026): standing, with a club, the golf posture of the tests – the moves
// a player does next to the bag before the first ball. Moves that are a test or drill reuse its clip; the rest are
// built from the same fitted positions (the pelvis turning over feet that stay, PELVIS_LEFT/RIGHT).

/** the trunk turned as in the backswing / to the finish: the pelvis turns over the feet, the chest further, the head
 *  stays with the ball (the neck turns back) */
const BACK: J = { ...PELVIS_RIGHT, ...ARMS_CROSSED, spine: [4, -8, 0], chest: [3, -18, 0], neck: [-6, 34, 0] };
const THROUGH: J = { ...PELVIS_LEFT, ...ARMS_CROSSED, spine: [4, 8, 0], chest: [3, 18, 0], neck: [-6, -26, 0] };

/** the hip hinge: bent forward from the hips with a long back, the knees soft (the thighs a little forward) */
const HINGE: J = { ...ARMS_CROSSED, pelvis: [68, 0, 0], spine: [4, 0, 0], chest: [3, 0, 0], neck: [-16, 0, 0], hipL: [-78, 0, 3], hipR: [-78, 0, -3], kneeL: [22, 0, 0], kneeR: [22, 0, 0], ankleL: [-12, 0, 0], ankleR: [-12, 0, 0] };

/** the club held overhead with straight arms */
const OVERHEAD: J = { shoulderL: [-172, 0, 12], shoulderR: [-172, 0, -12], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6] };

/** golf posture on one leg: the other foot a hand high, the knee bent */
const LIFT_R: J = { ...ARMS_CROSSED, hipR: [-74, 0, -4], kneeR: [76, 0, 0], ankleR: [-10, 0, 0] };
const LIFT_L: J = { ...ARMS_CROSSED, hipL: [-74, 0, 4], kneeL: [76, 0, 0], ankleL: [-10, 0, 0] };

export const WARMUP_CLIPS: Record<string, Clip> = {
  'rw-turn': {
    view: 'angle',
    views: ['angle', 'above', 'front'],
    plant: ['ankleL', 'ankleR'],
    props: ['barChest'],
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, a club across the chest', 'Golfhaltung, Schläger quer vor der Brust')),
      k(1.0, golf(ARMS_CROSSED)),
      k(2.4, golf(BACK), L('Turn back like the backswing – the head stays', 'Zurückdrehen wie im Rückschwung – der Kopf bleibt')),
      k(3.0, golf(BACK)),
      k(4.6, golf(THROUGH), L('… and through to the finish', '… und durchdrehen zum Finish')),
      k(5.2, golf(THROUGH)),
      k(6.4, golf(ARMS_CROSSED)),
    ],
  },
  'rw-hips': DRILL_CLIPS['mob-pelvic-turn'],
  'rw-squat': {
    ...CLIPS['deep-squat'],
    keys: CLIPS['deep-squat'].keys.map((x, i) => (i === 0 ? { ...x, label: L('A club overhead, arms straight', 'Schläger über dem Kopf, Arme gestreckt') } : x)),
  },
  'rw-hinge': {
    view: 'side',
    views: ['side', 'angle', 'front'],
    plant: ['ankleL', 'ankleR'],
    keys: [
      k(0, stand(ARMS_CROSSED), L('Stand tall, arms crossed', 'Aufrecht stehen, Arme verschränkt')),
      k(1.0, stand(ARMS_CROSSED)),
      k(2.6, P(HINGE), L('Bend from the hips, the back long – feel the back of the thighs', 'Aus der Hüfte beugen, der Rücken lang – Zug hinten im Oberschenkel')),
      k(3.4, P(HINGE)),
      k(5.0, stand(ARMS_CROSSED), L('Up again, the hips forward', 'Wieder hoch, die Hüfte nach vorn')),
      k(5.8, stand(ARMS_CROSSED)),
    ],
  },
  'rw-reach': {
    view: 'front',
    views: ['front', 'angle', 'side'],
    plant: ['ankleL', 'ankleR'],
    props: ['barHands'],
    keys: [
      k(0, stand(OVERHEAD), L('The club overhead, arms straight', 'Schläger über den Kopf, Arme gestreckt')),
      k(1.0, stand(OVERHEAD)),
      k(2.6, stand({ ...OVERHEAD, spine: [0, 0, 12], chest: [0, 0, 12] }), L('Lean to the side – long through the flank', 'Zur Seite neigen – lang durch die Flanke')),
      k(3.4, stand({ ...OVERHEAD, spine: [0, 0, 12], chest: [0, 0, 12] })),
      k(4.6, stand(OVERHEAD)),
      k(6.0, stand({ ...OVERHEAD, spine: [0, 0, -12], chest: [0, 0, -12] }), L('… and to the other side', '… und zur anderen Seite')),
      k(6.8, stand({ ...OVERHEAD, spine: [0, 0, -12], chest: [0, 0, -12] })),
      k(8.0, stand(OVERHEAD)),
    ],
  },
  'rw-balance': {
    view: 'angle',
    views: ['angle', 'front', 'side'],
    plant: ['ankleL', 'ankleR'],
    keys: [
      k(0, golf(ARMS_CROSSED), L('Golf posture, arms crossed', 'Golfhaltung, Arme verschränkt')),
      k(1.0, golf(ARMS_CROSSED)),
      k(2.0, golf(LIFT_R), L('Lift the right foot – hold the posture still', 'Rechten Fuß anheben – die Haltung ruhig halten')),
      k(4.0, golf(LIFT_R)),
      k(5.0, golf(ARMS_CROSSED)),
      k(6.0, golf(LIFT_L), L('… then on the right leg', '… dann auf dem rechten Bein')),
      k(8.0, golf(LIFT_L)),
      k(9.0, golf(ARMS_CROSSED)),
    ],
  },
  'rw-neck': { ...CLIPS.neck, keys: CLIPS.neck.keys.map((x, i) => (i === 0 ? { ...x, label: L('Stand tall, arms crossed', 'Aufrecht stehen, Arme verschränkt') } : x)) },
  'rw-wrists': CLIPS['wrist-hinge'],
};
