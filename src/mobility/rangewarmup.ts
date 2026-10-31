import { L, type L as Text } from '../training/types';
import type { AreaState } from './profile';
import type { Area } from './types';

// The range warm-up (Sascha 31.10.2026: "from the results, an individual warm-up of 5–7 min for the range, so you warm
// up your movement limits in particular and so improve the golf swing"). Dynamic moves, standing, with a club – no
// floor, no band, no camera (the phone is in the hand or the bag): the app leads by voice and clock. Built like a
// coach's ramp: a turn for the whole body first, then the moves for the areas with the biggest gap to the goal, then
// swings from half to full. Replaces the decision of 19.10.2026 ("no warm-up before the round in Rounds"): it lives in
// Agility, where the results are. REVIEW(golf): Chris – the moves, the times.

export type WarmMoveId = 'rw-turn' | 'rw-hips' | 'rw-squat' | 'rw-hinge' | 'rw-reach' | 'rw-balance' | 'rw-neck' | 'rw-wrists' | 'rw-swing-half' | 'rw-swing-full';

export interface WarmMove {
  id: WarmMoveId;
  name: Text;
  /** said and shown, 1–2 short steps */
  steps: Text[];
  /** how long, in seconds */
  seconds: number;
  /** left then right: the side changes at half time */
  sides?: boolean;
  /** the areas it warms up */
  areas: Area[];
  /** a 3D swing of Training instead of a clip (the swings at the end) */
  swing?: 'half' | 'full';
}

export const WARM_MOVES: Record<WarmMoveId, WarmMove> = {
  'rw-turn': {
    id: 'rw-turn',
    name: L('Turn with the club across the chest', 'Rumpf drehen mit Schläger vor der Brust'),
    steps: [L('Golf posture, the club across the chest.', 'Golfhaltung, den Schläger quer vor der Brust.'), L('Turn back and through, a little further each time – the head stays.', 'Zurück und durch drehen, jedes Mal etwas weiter – der Kopf bleibt.')],
    seconds: 45,
    areas: ['spine', 'shoulders'],
  },
  'rw-hips': {
    id: 'rw-hips',
    name: L('Hips turn in golf posture', 'Hüfte drehen in Golfhaltung'),
    steps: [L('Golf posture, the club across the chest.', 'Golfhaltung, den Schläger quer vor der Brust.'), L('Turn only the hips left and right – the chest stays still.', 'Nur die Hüfte nach links und rechts drehen – die Brust bleibt ruhig.')],
    seconds: 45,
    areas: ['hips'],
  },
  'rw-squat': {
    id: 'rw-squat',
    name: L('Squat with the club overhead', 'Kniebeuge mit Schläger über dem Kopf'),
    steps: [L('The club overhead, arms straight, feet hip-wide.', 'Schläger über den Kopf, Arme gestreckt, Füße hüftbreit.'), L('Squat slowly as deep as is easy – heels down.', 'Langsam so tief in die Hocke, wie es leicht geht – Fersen unten.')],
    seconds: 45,
    areas: ['legs', 'hips'],
  },
  'rw-hinge': {
    id: 'rw-hinge',
    name: L('Hip hinge', 'Hüftbeuge'),
    steps: [L('Stand tall, arms crossed, knees soft.', 'Aufrecht stehen, Arme verschränkt, Knie locker.'), L('Bend from the hips with a long back and come up again.', 'Mit langem Rücken aus der Hüfte beugen und wieder aufrichten.')],
    seconds: 40,
    areas: ['legs', 'spine'],
  },
  'rw-reach': {
    id: 'rw-reach',
    name: L('Club overhead, lean to the side', 'Schläger hoch, zur Seite neigen'),
    steps: [L('The club overhead, arms straight.', 'Schläger über den Kopf, Arme gestreckt.'), L('Lean left and right, long through the flank.', 'Nach links und rechts neigen, lang durch die Flanke.')],
    seconds: 40,
    areas: ['shoulders', 'spine'],
  },
  'rw-balance': {
    id: 'rw-balance',
    name: L('Golf posture on one leg', 'Golfhaltung auf einem Bein'),
    steps: [L('Golf posture, arms crossed.', 'Golfhaltung, Arme verschränkt.'), L('Lift one foot and hold the posture still – then the other.', 'Einen Fuß anheben und die Haltung ruhig halten – dann den anderen.')],
    seconds: 40,
    sides: true,
    areas: ['stability'],
  },
  'rw-neck': {
    id: 'rw-neck',
    name: L('Head turn', 'Kopf drehen'),
    steps: [L('Stand tall, the shoulders still.', 'Aufrecht stehen, die Schultern ruhig.'), L('Turn the chin slowly to each shoulder.', 'Das Kinn langsam zu jeder Schulter drehen.')],
    seconds: 25,
    areas: ['neck'],
  },
  'rw-wrists': {
    id: 'rw-wrists',
    name: L('Hinge the club with the wrists', 'Schläger mit den Handgelenken kippen'),
    steps: [L('The club in one hand, the arm in front of you.', 'Den Schläger in einer Hand, den Arm vor dir.'), L('Tip the club up and down from the wrist – then the other hand.', 'Den Schläger aus dem Handgelenk auf und ab kippen – dann die andere Hand.')],
    seconds: 30,
    sides: true,
    areas: ['wrists'],
  },
  'rw-swing-half': {
    id: 'rw-swing-half',
    name: L('Half swings', 'Halbe Schwünge'),
    steps: [L('Without a ball: swing to hip height and back, easy.', 'Ohne Ball: bis Hüfthöhe hin und her schwingen, locker.'), L('Let the body turn the club.', 'Lass den Körper den Schläger drehen.')],
    seconds: 40,
    areas: [],
    swing: 'half',
  },
  'rw-swing-full': {
    id: 'rw-swing-full',
    name: L('Full swings, faster each time', 'Ganze Schwünge, jedes Mal schneller'),
    steps: [L('Full swings to the finish.', 'Ganze Schwünge bis ins Finish.'), L('From half speed up to your speed.', 'Von halbem Tempo bis zu deinem Tempo.')],
    seconds: 45,
    areas: [],
    swing: 'full',
  },
};

/** The moves for each area, the best first (a tight area gets its move, a very tight one a second). */
export const AREA_MOVES: Record<Area, WarmMoveId[]> = {
  hips: ['rw-hips', 'rw-squat'],
  spine: ['rw-turn', 'rw-reach'],
  shoulders: ['rw-reach', 'rw-turn'],
  stability: ['rw-balance'],
  legs: ['rw-squat', 'rw-hinge'],
  neck: ['rw-neck'],
  wrists: ['rw-wrists'],
};

/** Without a screening, or when everything sits: a general ramp. */
export const GENERAL: WarmMoveId[] = ['rw-hips', 'rw-squat', 'rw-reach', 'rw-hinge', 'rw-balance'];

export const WARMUP_MIN = 5 * 60;
export const WARMUP_MAX = 7 * 60;
const SWINGS: WarmMoveId[] = ['rw-swing-half', 'rw-swing-full'];

export interface Warmup {
  moves: WarmMove[];
  /** the areas it is made for (the biggest gap first) */
  areas: Area[];
  seconds: number;
}

/**
 * The warm-up for the areas (the pillar, biggest gap first): the turn for the whole body, then a move for each area
 * below the goal (the focus areas first), a second move for the biggest gaps while time is left, filled up to at least
 * 5 min with the general ramp, and the swings at the end – 5 to 7 min.
 */
export function buildWarmup(areas: AreaState[]): Warmup {
  const below = areas.filter((a) => a.gap > 0).sort((a, b) => b.gap - a.gap);
  const ids: WarmMoveId[] = ['rw-turn'];
  const swing = SWINGS.reduce((s, id) => s + WARM_MOVES[id].seconds, 0);
  const time = () => ids.reduce((s, id) => s + WARM_MOVES[id].seconds, 0) + swing;
  const add = (id: WarmMoveId) => {
    if (ids.includes(id) || time() + WARM_MOVES[id].seconds > WARMUP_MAX) return;
    ids.push(id);
  };
  for (let round = 0; round < 2; round++) for (const a of below) if (round === 0 || a.focus) { const id = AREA_MOVES[a.area][round]; if (id) add(id); }
  for (const id of GENERAL) if (time() < WARMUP_MIN) add(id);
  const moves = [...ids, ...SWINGS].map((id) => WARM_MOVES[id]);
  return { moves, areas: below.map((a) => a.area), seconds: moves.reduce((s, m) => s + m.seconds, 0) };
}
