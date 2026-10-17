import { L, type P, type SideItem, type Sketch, type Video } from '../training/types';
import type { GolferOptions, JointName } from '../training/Golfer';
import { SketchView } from '../training/Sketch';
import { tr } from '../lib/i18n';
import { ForearmTurn, WristFlex, WristHinge } from './pictures';
import type { TestDef, TestId } from './types';

// The 15 tests of the mobility screen, modelled on the golf screen of the Titleist Performance Institute (level 1:
// pelvic tilt, pelvic rotation, torso/seated trunk rotation, overhead deep squat, toe touch, 90/90, single-leg balance,
// lat test, lower quarter rotation, bridge with leg extension, reach roll & lift, cervical rotation, forearm rotation,
// wrist hinge, wrist flexion/extension). Ten are measured by the camera, five the player judges with pictures (the
// phone cannot see a wrist or the pelvis tilting well enough). Not medical advice – pain stops the test.
// Sources: mytpi.com (lat test, lower quarter rotation, bridge with leg extension), TPI seminar notes (seated trunk
// rotation ≥ 45°, lower quarter ≥ 60°, forearm rotation > 80°). REVIEW(golf): Chris checks every limit.

// ---------- sketch helpers (scenes in metres, the ground at y = 0.2, the golfer 1.75 m) ----------
const G0 = 0.2;
const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
const ground = (w: number): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]] });
const fig = (x: number, o: GolferOptions & { y?: number; tilt?: number }): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], ...o });
const co = (on: JointName, t: L, at: P, figIndex?: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
const line = (from: P, to: P, dashed = false): SideItem => ({ k: 'line', from, to, dashed });
const txt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });

/** both sides of the body at the same place (seen from the side), the far one 2 cm behind */
type J = Partial<Record<JointName | 'trailHand', P>>;
const pair = (lead: JointName, trail: JointName, p: P, dx = -0.02): J => ({ [lead]: p, [trail]: [p[0] + dx, p[1]] }) as J;
const legs = (hip: P, knee: P, ankle: P, heel: P, toe: P): J => ({
  ...pair('leadHip', 'trailHip', hip),
  ...pair('leadKnee', 'trailKnee', knee),
  ...pair('leadAnkle', 'trailAnkle', ankle),
  ...pair('leadHeel', 'trailHeel', heel),
  ...pair('leadToe', 'trailToe', toe),
});
const arms = (shoulder: P, elbow: P, hand: P): J => ({ ...pair('leadShoulder', 'trailShoulder', shoulder), ...pair('leadElbow', 'trailElbow', elbow), hands: hand, trailHand: [hand[0] - 0.02, hand[1]] });

/** the golf posture from the side with the arms crossed on the chest */
const POSTURE_CROSSED: J = { ...arms([0.22, 1.29], [0.34, 1.12], [0.24, 1.2]) };

// ---------- the test positions ----------
const squat = S(3, 2.0, [
  ground(3),
  fig(1.2, {
    pose: 'address',
    club: 'none',
    faceOn: false,
    joints: { pelvis: [-0.17, 0.38], neck: [0.14, 0.8], head: [0.24, 0.91], ...legs([-0.17, 0.38], [0.25, 0.44], [0, 0.08], [-0.06, 0.02], [0.18, 0.02]), ...arms([0.12, 0.77], [0.3, 1.01], [0.46, 1.24]) },
  }),
  line([1.2 + 0.25, G0 + 0.44], [1.2 - 0.3, G0 + 0.44], true),
  co('hands', L('arms overhead, in line with the trunk', 'Arme über dem Kopf, in Linie mit dem Rumpf'), [2.4, 1.7]),
  co('pelvis', L('hips below the knees', 'Hüfte unter Kniehöhe'), [0.3, 1.0]),
  co('leadHeel', L('heels stay on the ground', 'Fersen bleiben am Boden'), [0.4, 0.45]),
]);

const toeTouch = S(3, 2.0, [
  ground(3),
  fig(1.3, {
    pose: 'address',
    club: 'none',
    faceOn: false,
    joints: { pelvis: [-0.08, 0.9], neck: [0.17, 0.62], head: [0.27, 0.5], ...legs([-0.08, 0.9], [-0.04, 0.49], [0, 0.08], [-0.06, 0.02], [0.18, 0.02]), ...arms([0.15, 0.6], [0.18, 0.33], [0.19, 0.07]) },
  }),
  co('hands', L('fingertips to the toes', 'Fingerspitzen zu den Zehen'), [2.4, 0.9]),
  co('leadKnee', L('knees straight, feet together', 'Knie gestreckt, Füße zusammen'), [0.3, 1.0]),
]);

const seated = S(3, 2.0, [
  ground(3),
  line([1.0, G0], [1.0, G0 + 0.46]),
  line([1.0, G0 + 0.46], [2.0, G0 + 0.46]),
  line([2.0, G0 + 0.46], [2.0, G0]),
  fig(1.5, {
    pose: 'front',
    club: 'none',
    faceOn: true,
    crossClub: true,
    joints: {
      pelvis: [0, 0.5],
      neck: [0, 1.0],
      head: [0, 1.14],
      leadShoulder: [0.13, 0.97],
      trailShoulder: [-0.16, 0.96],
      leadElbow: [0.08, 0.83],
      trailElbow: [-0.1, 0.83],
      hands: [0.03, 0.93],
      trailHand: [-0.03, 0.93],
      leadHip: [0.12, 0.5],
      trailHip: [-0.12, 0.5],
      leadKnee: [0.15, 0.47],
      trailKnee: [-0.15, 0.47],
      leadAnkle: [0.15, 0.08],
      trailAnkle: [-0.15, 0.08],
    },
  }),
  co('leadShoulder', L('turn the chest – 45° or more each way', 'Brust drehen – 45° oder mehr pro Seite'), [2.5, 1.7]),
  co('leadKnee', L('knees together, the hips stay on the chair', 'Knie zusammen, die Hüfte bleibt auf dem Stuhl'), [2.6, 0.9]),
  co('head', L('look straight ahead', 'Blick geradeaus'), [0.5, 1.7]),
]);

/** face-on golf posture with the arms crossed on the chest */
const frontCrossed: J = { leadElbow: [0.1, 1.17], trailElbow: [-0.12, 1.17], hands: [0.06, 1.3], trailHand: [-0.06, 1.3] };

const pelvicRotation = S(3, 2.1, [
  ground(3),
  fig(1.5, { pose: 'front', club: 'none', joints: frontCrossed }),
  arrow([1.2, 1.03], [1.05, 0.98]),
  arrow([1.8, 1.03], [1.95, 0.98]),
  co('pelvis', L('turn the hips both ways', 'Hüfte zu beiden Seiten drehen'), [2.6, 0.9]),
  co('leadShoulder', L('the chest stays facing the camera', 'die Brust bleibt zur Kamera gerichtet'), [2.6, 1.8]),
]);

const lowerQuarter = S(3, 2.1, [
  ground(3),
  fig(1.5, {
    pose: 'stand',
    joints: { leadElbow: [0.24, 1.08], trailElbow: [-0.24, 1.08], hands: [0.13, 0.94], trailHand: [-0.13, 0.94], trailKnee: [-0.02, 0.5], trailAnkle: [0.02, 0.13], trailHeel: [-0.02, 0.15], trailToe: [0.06, 0.02] },
    faceOn: true,
  }),
  co('hands', L('hands on the hips', 'Hände an der Hüfte'), [2.6, 1.3]),
  co('trailToe', L('the other foot only touches with the toe', 'der andere Fuß berührt nur mit der Spitze'), [0.4, 0.6]),
  co('pelvis', L('turn as far as you can both ways – 60° each', 'so weit wie möglich zu beiden Seiten drehen – je 60°'), [2.6, 0.75]),
]);

const singleLeg = S(3, 2.1, [
  ground(3),
  fig(1.5, {
    pose: 'stand',
    faceOn: true,
    joints: { leadElbow: [0.12, 1.2], trailElbow: [-0.12, 1.2], hands: [0.07, 1.32], trailHand: [-0.07, 1.32], trailKnee: [-0.08, 0.72], trailAnkle: [-0.07, 0.4], trailHeel: [-0.1, 0.38], trailToe: [-0.02, 0.36] },
  }),
  co('head', L('eyes closed', 'Augen zu'), [2.5, 1.95]),
  co('trailKnee', L('knee up to hip height', 'Knie auf Hüfthöhe'), [0.5, 1.0]),
  co('leadAnkle', L('the standing foot does not move – 20 s', 'der Standfuß bewegt sich nicht – 20 s'), [2.6, 0.6]),
]);

const bridge = S(3.2, 1.3, [
  ground(3.2),
  fig(1.4, {
    pose: 'bridge',
    joints: { leadKnee: [0.385, 0.56], leadAnkle: [0.77, 0.73], leadHeel: [0.74, 0.69], leadToe: [0.81, 0.86] },
  }),
  co('pelvis', L('lift the hips, then stretch one leg – hold 10 s', 'Hüfte heben, dann ein Bein strecken – 10 s halten'), [1.2, 1.15]),
  co('leadAnkle', L('the thighs stay parallel', 'die Oberschenkel bleiben parallel'), [2.7, 1.1]),
  co('trailKnee', L('the pelvis must not sink', 'das Becken darf nicht absinken'), [2.8, 0.45]),
]);

const lat = S(3, 2.1, [
  ground(3),
  line([1.08, G0], [1.08, 2.05]),
  txt([1.0, 1.9], L('wall', 'Wand'), 10, 'end'),
  fig(1.2, {
    pose: 'address',
    club: 'none',
    faceOn: false,
    joints: { pelvis: [-0.02, 0.5], neck: [0.0, 0.98], head: [0.03, 1.12], ...legs([-0.02, 0.5], [0.44, 0.49], [0.44, 0.08], [0.38, 0.02], [0.62, 0.02]), ...arms([0.0, 0.95], [-0.03, 1.25], [-0.05, 1.52]) },
  }),
  line([1.2, G0 + 0.95], [1.2 + 0.55, G0 + 0.95 + 0.32], true),
  txt([1.82, G0 + 1.3], L('120° = nose', '120° = Nase'), 10, 'start'),
  co('hands', L('straight arms overhead to the wall', 'gestreckte Arme über den Kopf zur Wand'), [2.4, 1.95]),
  co('pelvis', L('low back flat on the wall, knees almost 90°', 'unterer Rücken flach an der Wand, Knie fast 90°'), [2.4, 0.6]),
]);

const shoulder = S(3, 2.1, [
  ground(3),
  fig(1.2, {
    pose: 'address',
    club: 'none',
    joints: { leadElbow: [0.25, 1.26], hands: [0.41, 1.48], trailElbow: [0.24, 1.04], trailHand: [0.3, 0.82] },
  }),
  line([1.2 - 0.1, G0 + 0.88], [1.2 + 0.32, G0 + 1.46], true),
  co('hands', L('forearm parallel to the spine', 'Unterarm parallel zur Wirbelsäule'), [2.4, 1.95]),
  co('leadElbow', L('upper arm out to the side, elbow 90°', 'Oberarm seitlich, Ellbogen 90°'), [2.5, 1.2]),
  co('pelvis', L('keep the golf posture', 'Golfhaltung halten'), [0.3, 1.2]),
]);

const neck = S(3, 2.1, [
  ground(3),
  fig(1.5, { pose: 'stand', faceOn: true, joints: frontCrossed }),
  co('head', L('turn the chin towards the shoulder – 70° each way', 'Kinn Richtung Schulter drehen – 70° pro Seite'), [2.6, 1.95]),
  co('leadShoulder', L('the shoulders stay still', 'die Schultern bleiben ruhig'), [2.6, 1.3]),
]);

const pelvicTilt = (arrows: 'both' | 'one' | 'none'): Sketch =>
  S(3, 2.0, [
    ground(3),
    fig(1.3, { pose: 'address', club: 'none', joints: POSTURE_CROSSED }),
    ...(arrows !== 'none' ? [arrow([1.0, 1.25], [0.92, 1.42])] : []),
    ...(arrows === 'both' ? [arrow([1.0, 1.25], [1.08, 1.06])] : []),
    co('pelvis', arrows === 'both' ? L('tilts forward and back', 'kippt vor und zurück') : arrows === 'one' ? L('only one way', 'nur in eine Richtung') : L('the chest moves instead', 'die Brust bewegt sich mit'), [0.35, 0.9]),
    co('neck', L('the chest stays still', 'die Brust bleibt ruhig'), [2.4, 1.85]),
  ]);

/** kneeling, sitting back on the heels, chest on the thighs; the near arm forward, lifted by `lift` (0 down … 1 ear) */
const reachRoll = (lift: number): Sketch =>
  S(3.2, 1.3, [
    ground(3.2),
    fig(1.2, {
      pose: 'address',
      club: 'none',
      faceOn: false,
      joints: {
        pelvis: [-0.05, 0.42],
        neck: [0.45, 0.4],
        head: [0.6, 0.3],
        ...legs([-0.05, 0.42], [0.38, 0.1], [-0.12, 0.1], [-0.2, 0.12], [-0.35, 0.04]),
        ...pair('leadShoulder', 'trailShoulder', [0.43, 0.38]),
        leadElbow: [0.7, 0.3 + 0.12 * lift],
        hands: [0.95, 0.22 + 0.32 * lift],
        trailElbow: [0.55, 0.12],
        trailHand: [0.4, 0.06],
      },
    }),
    co('hands', lift >= 0.9 ? L('the arm lifts to ear height', 'der Arm hebt bis auf Ohrhöhe') : lift > 0.2 ? L('between the floor and the ear', 'zwischen Boden und Ohr') : L('the arm does not come off the floor', 'der Arm hebt nicht vom Boden ab'), [2.7, 1.1]),
    co('pelvis', L('sit back on the heels, forehead down', 'auf die Fersen setzen, Stirn unten'), [0.4, 1.1]),
  ]);

const picture = (s: Sketch, label: L) => () => <SketchView sketch={s} label={tr(label.en, label.de)} />;

const v = (id: string, title: string, channel: string, lang: 'en' | 'de' = 'en'): Video => ({ id, title, channel, lang });

export const TESTS: TestDef[] = [
  // ---------- front view, standing ----------
  {
    id: 'pelvic-rotation',
    name: L('Pelvic rotation', 'Beckenrotation'),
    area: 'hips',
    why: L('Can the hips turn on their own? They have to lead the downswing.', 'Kann die Hüfte allein drehen? Sie muss den Abschwung anführen.'),
    sides: false,
    mode: 'camera',
    view: 'front',
    metric: 'pelvicRotation',
    quick: true,
    setup: L('Face the phone in golf posture, arms crossed on the chest.', 'Stell dich in Golfhaltung zum Handy, Arme vor der Brust verschränkt.'),
    steps: [L('Hold still for a moment.', 'Kurz still halten.'), L('Then turn the hips left and right a few times – the chest stays facing the phone.', 'Dann die Hüfte ein paar Mal nach links und rechts drehen – die Brust bleibt zum Handy gerichtet.')],
    target: L('Hips 30° or more, the chest stays still', 'Hüfte 30° oder mehr, die Brust bleibt ruhig'),
    sketch: pelvicRotation,
    drills: ['mob-pelvic-turn', 'hip-9090', 'pallof-press'],
    video: v('rwN_KO1S4yU', 'Pelvic rotation test: hip isolation and stabilisation', 'Advanced Physical Therapy'),
  },
  {
    id: 'lower-quarter',
    name: L('Hip rotation on one leg', 'Hüftrotation auf einem Bein'),
    area: 'hips',
    why: L('Inner rotation of the hips: the trail hip in the backswing, the lead hip in the downswing.', 'Innenrotation der Hüfte: die hintere im Rückschwung, die vordere im Abschwung.'),
    sides: true,
    mode: 'camera',
    view: 'front',
    metric: 'lowerQuarter',
    quick: false,
    setup: L('Face the phone, all your weight on one leg, hands on the hips.', 'Stell dich zum Handy, das ganze Gewicht auf einem Bein, Hände an der Hüfte.'),
    steps: [L('The other foot only touches the floor with the toe.', 'Der andere Fuß berührt den Boden nur mit der Spitze.'), L('Turn the pelvis as far as you can to one side, then to the other – around the standing leg.', 'Das Becken so weit wie möglich zu einer Seite drehen, dann zur anderen – um das Standbein.')],
    target: L('60° or more in each direction', '60° oder mehr in jede Richtung'),
    sketch: lowerQuarter,
    drills: ['hip-9090', 'mob-hip-ir'],
    video: v('nJpKkoMqKmo', 'Lower quarter rotation test: mobility of the lower quarter', 'Advanced Physical Therapy'),
  },
  {
    id: 'single-leg',
    name: L('Single-leg balance', 'Einbeinstand'),
    area: 'stability',
    why: L('Balance keeps the body centred – without it the hips sway and slide.', 'Gleichgewicht hält den Körper über dem Ball – ohne weicht die Hüfte zur Seite aus.'),
    sides: true,
    mode: 'camera',
    view: 'front',
    metric: 'balance',
    quick: true,
    setup: L('Face the phone, arms crossed on the chest.', 'Stell dich zum Handy, Arme vor der Brust verschränkt.'),
    steps: [L('Lift one knee to hip height.', 'Ein Knie auf Hüfthöhe heben.'), L('When you hear “eyes closed”, close your eyes and stand still.', 'Bei „Augen zu“ die Augen schließen und ruhig stehen.')],
    target: L('20 seconds with the eyes closed', '20 Sekunden mit geschlossenen Augen'),
    sketch: singleLeg,
    drills: ['single-leg-balance', 'mob-single-leg-reach', 'mob-clamshell'],
    video: v('RsQ57NufuR0', 'Single leg balance test: balance is key', 'Advanced Physical Therapy'),
  },
  {
    id: 'neck',
    name: L('Head turn', 'Kopfdrehung'),
    area: 'neck',
    why: L('The head stays still while the shoulders turn under it.', 'Der Kopf bleibt ruhig, während sich die Schultern darunter drehen.'),
    sides: true,
    mode: 'camera',
    view: 'front',
    metric: 'neck',
    quick: false,
    setup: L('Stand upright facing the phone, arms crossed on the chest.', 'Stell dich aufrecht zum Handy, Arme vor der Brust verschränkt.'),
    steps: [L('Look at the phone for a moment.', 'Kurz zum Handy schauen.'), L('Turn the chin towards the shoulder as far as you can – the shoulders stay still.', 'Das Kinn so weit wie möglich zur Schulter drehen – die Schultern bleiben ruhig.')],
    target: L('70° or more each way', '70° oder mehr pro Seite'),
    sketch: neck,
    drills: ['mob-neck-turn'],
    video: v('o2GGakuDidM', 'Cervical rotation test for golfers', 'CSC Performance Coaching'),
  },
  // ---------- front view, seated ----------
  {
    id: 'seated-rotation',
    name: L('Seated trunk rotation', 'Rumpfrotation im Sitzen'),
    area: 'spine',
    why: L('The turn of the upper back – the engine of the backswing.', 'Die Drehung des oberen Rückens – der Motor des Rückschwungs.'),
    sides: true,
    mode: 'camera',
    view: 'front',
    metric: 'trunkRotation',
    quick: true,
    needs: L('a chair, a club', 'einen Stuhl, einen Schläger'),
    setup: L('Sit upright on a chair facing the phone, a club across the front of the shoulders.', 'Setz dich aufrecht auf einen Stuhl zum Handy, ein Schläger quer vor den Schultern.'),
    steps: [L('Look at the phone for a moment.', 'Kurz zum Handy schauen.'), L('Turn the chest as far as you can – the knees and hips stay still. Then back to the middle.', 'Die Brust so weit wie möglich drehen – Knie und Hüfte bleiben ruhig. Dann zurück zur Mitte.')],
    target: L('45° or more each way', '45° oder mehr pro Seite'),
    sketch: seated,
    drills: ['open-books', 'mob-thread-needle', 'seated-rotation'],
    video: v('fXd4ozI-Ojk', 'Seated thoracic rotation test: spine rotational mobility', 'Advanced Physical Therapy'),
  },
  // ---------- side view, standing ----------
  {
    id: 'deep-squat',
    name: L('Overhead deep squat', 'Tiefe Kniebeuge mit Armen oben'),
    area: 'legs',
    why: L('Hips, ankles and upper back together – a failed squat is the most common reason golfers stand up in the downswing.', 'Hüfte, Sprunggelenke und oberer Rücken zusammen – wer hier scheitert, richtet sich im Abschwung meistens auf.'),
    sides: false,
    mode: 'camera',
    view: 'side',
    metric: 'squat',
    quick: true,
    setup: L('Stand side-on to the phone, feet shoulder-width, arms straight up overhead.', 'Stell dich seitlich zum Handy, Füße schulterbreit, Arme gestreckt über dem Kopf.'),
    steps: [L('Squat down as deep as you can – heels on the floor, arms stay up.', 'So tief wie möglich in die Hocke – Fersen am Boden, Arme bleiben oben.'), L('Stand up again.', 'Wieder aufstehen.')],
    target: L('Hips below the knees, heels down, arms in line', 'Hüfte unter Kniehöhe, Fersen unten, Arme in Linie'),
    sketch: squat,
    drills: ['mob-ankle-wall', 'deep-squat', 'mob-wall-angels'],
    video: v('U5qlAYuZzCg', 'Overhead deep squat test: full-body evaluation', 'Advanced Physical Therapy'),
  },
  {
    id: 'toe-touch',
    name: L('Toe touch', 'Zehen berühren'),
    area: 'spine',
    why: L('Hamstrings and low back – they decide how well you hold your posture.', 'Hintere Oberschenkel und unterer Rücken – sie entscheiden, wie gut du deine Haltung hältst.'),
    sides: false,
    mode: 'camera',
    view: 'side',
    metric: 'toeTouch',
    quick: true,
    setup: L('Stand side-on to the phone, feet together.', 'Stell dich seitlich zum Handy, Füße zusammen.'),
    steps: [L('Bend forward with straight knees and reach for your toes.', 'Mit gestreckten Knien nach vorn beugen und zu den Zehen greifen.'), L('Stand up again.', 'Wieder aufrichten.')],
    target: L('Fingertips reach the toes, knees straight', 'Fingerspitzen erreichen die Zehen, Knie gestreckt'),
    sketch: toeTouch,
    drills: ['mob-toe-touch', 'mob-cat-camel'],
    video: v('S-22BJX3-NM', 'The toe touch test: improving flexibility', 'Advanced Physical Therapy'),
  },
  {
    id: 'shoulder-9090',
    name: L('90/90 shoulder turn', '90/90-Schulterdrehung'),
    area: 'shoulders',
    why: L('Outer rotation of the shoulder: the trail arm at the top, the lead arm in the finish.', 'Außenrotation der Schulter: der hintere Arm am Top, der vordere im Finish.'),
    sides: true,
    mode: 'camera',
    view: 'side',
    metric: 'shoulder9090',
    quick: false,
    setup: L('Golf posture, the tested arm towards the phone.', 'Golfhaltung, der getestete Arm zum Handy.'),
    steps: [L('Lift the upper arm out to the side, elbow bent 90°.', 'Den Oberarm seitlich anheben, Ellbogen 90° gebeugt.'), L('Turn the forearm back and up as far as you can – keep the posture.', 'Den Unterarm so weit wie möglich nach hinten oben drehen – Haltung halten.')],
    target: L('Forearm parallel to the spine', 'Unterarm parallel zur Wirbelsäule'),
    sketch: shoulder,
    drills: ['mob-9090-stretch', 'mob-band-er'],
    video: v('blKJBavenDs', 'The 90/90 test: external shoulder rotation', 'Advanced Physical Therapy'),
  },
  {
    id: 'lat',
    name: L('Lat test at the wall', 'Lat-Test an der Wand'),
    area: 'shoulders',
    why: L('Tight lats pull the arms down and the back into a hollow – they cost posture and arm height.', 'Ein verkürzter Latissimus zieht die Arme nach unten und den Rücken ins Hohlkreuz – das kostet Haltung und Armhöhe.'),
    sides: false,
    mode: 'camera',
    view: 'side',
    metric: 'lat',
    quick: false,
    needs: L('a wall', 'eine Wand'),
    setup: L('Sit against a wall side-on to the phone, knees almost 90°, the low back flat on the wall.', 'Lehn dich seitlich zum Handy an eine Wand, Knie fast 90°, der untere Rücken flach an der Wand.'),
    steps: [L('Arms straight forward, thumbs up.', 'Arme gestreckt nach vorn, Daumen oben.'), L('Raise them overhead towards the wall – elbows straight, the back stays flat.', 'Über den Kopf zur Wand heben – Ellbogen gestreckt, der Rücken bleibt flach.')],
    target: L('The arms reach the wall (170°)', 'Die Arme erreichen die Wand (170°)'),
    sketch: lat,
    drills: ['mob-lat-stretch', 'mob-wall-angels'],
    video: v('yRZJ3W-265o', 'Lat test', 'Advanced Physical Therapy'),
  },
  // ---------- side view, on the floor ----------
  {
    id: 'bridge',
    name: L('Bridge with one leg out', 'Brücke mit Beinstreckung'),
    area: 'stability',
    why: L('Strong glutes hold the hips in place – weak ones let the body stand up.', 'Ein starkes Gesäß hält die Hüfte an ihrem Platz – ein schwaches lässt den Körper aufrichten.'),
    sides: true,
    mode: 'camera',
    view: 'side',
    metric: 'bridge',
    quick: true,
    needs: L('a mat', 'eine Matte'),
    setup: L('Lie on your back side-on to the phone, knees bent, feet flat. The phone on the floor 3 m away or turned sideways – head to feet in the picture.', 'Leg dich seitlich zum Handy auf den Rücken, Knie gebeugt, Füße flach. Das Handy 3 m entfernt am Boden oder quer – Kopf bis Fuß im Bild.'),
    steps: [L('Lift the hips until knees, hips and shoulders are one line.', 'Die Hüfte heben, bis Knie, Hüfte und Schultern eine Linie bilden.'), L('Stretch one leg out, thighs parallel – hold for 10 seconds.', 'Ein Bein strecken, Oberschenkel parallel – 10 Sekunden halten.')],
    target: L('10 seconds, the pelvis does not sink', '10 Sekunden, das Becken sinkt nicht ab'),
    sketch: bridge,
    drills: ['glute-bridge', 'mob-single-leg-bridge', 'mob-clamshell'],
    video: v('kraQ8rQMNc0', 'Bridge with one leg extension: testing core stability', 'Advanced Physical Therapy'),
  },
  // ---------- self checks ----------
  {
    id: 'pelvic-tilt',
    name: L('Pelvic tilt', 'Beckenkippung'),
    area: 'hips',
    why: L('Control of the pelvis – without it the back hollows (S-posture) or rounds.', 'Kontrolle über das Becken – ohne sie wird der Rücken hohl (S-Haltung) oder rund.'),
    sides: false,
    mode: 'self',
    quick: false,
    setup: L('Golf posture, arms crossed on the chest – best in front of a mirror.', 'Golfhaltung, Arme vor der Brust verschränkt – am besten vor einem Spiegel.'),
    steps: [L('Tilt the pelvis forward (hollow back), then back (flat back).', 'Das Becken nach vorn kippen (Hohlkreuz), dann nach hinten (flacher Rücken).'), L('The chest and the head do not move.', 'Brust und Kopf bewegen sich nicht.')],
    target: L('Smooth both ways, the chest stays still', 'Flüssig in beide Richtungen, die Brust bleibt ruhig'),
    sketch: pelvicTilt('both'),
    options: [
      { grade: 'pass', label: L('Smooth both ways, the chest stays still', 'Flüssig in beide Richtungen, die Brust bleibt ruhig'), picture: picture(pelvicTilt('both'), L('both ways', 'beide Richtungen')) },
      { grade: 'limited', label: L('Only one way works well', 'Nur eine Richtung geht gut'), picture: picture(pelvicTilt('one'), L('one way', 'eine Richtung')) },
      { grade: 'fail', label: L('Hardly – the chest moves along', 'Kaum – die Brust bewegt sich mit'), picture: picture(pelvicTilt('none'), L('hardly', 'kaum')) },
    ],
    drills: ['mob-cat-camel', 'mob-pelvic-tilt'],
    video: v('SU-MQnnP4Ts', 'Understanding and assessing pelvic tilt in the golf swing', 'TPI – Titleist Performance Institute'),
  },
  {
    id: 'reach-roll-lift',
    name: L('Reach, roll and lift', 'Strecken, drehen, heben'),
    area: 'shoulders',
    why: L('Upper back and shoulder blade – how high and wide the arms can swing.', 'Oberer Rücken und Schulterblatt – wie hoch und weit die Arme schwingen können.'),
    sides: false,
    mode: 'self',
    quick: false,
    needs: L('a mat', 'eine Matte'),
    setup: L('Kneel, sit back on the heels, chest on the thighs, forehead on the floor.', 'Knien, auf die Fersen setzen, Brust auf den Oberschenkeln, Stirn am Boden.'),
    steps: [L('Stretch one arm forward on the floor, thumb up.', 'Einen Arm nach vorn auf den Boden strecken, Daumen oben.'), L('Lift the straight arm as high as you can – both arms one after the other.', 'Den gestreckten Arm so hoch wie möglich heben – beide Arme nacheinander.')],
    target: L('Both arms lift to ear height', 'Beide Arme heben bis auf Ohrhöhe'),
    sketch: reachRoll(1),
    options: [
      { grade: 'pass', label: L('Both arms to ear height', 'Beide Arme bis auf Ohrhöhe'), picture: picture(reachRoll(1), L('ear height', 'Ohrhöhe')) },
      { grade: 'limited', label: L('Between the floor and the ear', 'Zwischen Boden und Ohr'), picture: picture(reachRoll(0.5), L('half way', 'halb')) },
      { grade: 'fail', label: L('An arm does not come off the floor', 'Ein Arm hebt nicht vom Boden ab'), picture: picture(reachRoll(0), L('not off the floor', 'nicht vom Boden')) },
    ],
    drills: ['mob-prone-y', 'mob-thread-needle', 'mob-wall-angels'],
    video: v('4HIciHGQXHU', 'Reach, roll and lift', 'Advanced Physical Therapy'),
  },
  {
    id: 'forearm',
    name: L('Forearm rotation', 'Unterarmdrehung'),
    area: 'wrists',
    why: L('Turning the forearms squares the clubface – limited, the arms bend (chicken wing).', 'Die Unterarmdrehung schließt die Schlagfläche – ist sie eingeschränkt, knickt der Arm ein (Chicken Wing).'),
    sides: false,
    mode: 'self',
    quick: false,
    needs: L('a club', 'einen Schläger'),
    setup: L('Stand tall, elbows at your sides bent 90°, a club upright in one hand.', 'Aufrecht stehen, Ellbogen am Körper 90° gebeugt, einen Schläger senkrecht in einer Hand.'),
    steps: [L('Turn the palm down, then up – the elbow stays at the side.', 'Die Handfläche nach unten drehen, dann nach oben – der Ellbogen bleibt am Körper.'), L('Watch how far the club tips each way. Both hands.', 'Schauen, wie weit der Schläger zu jeder Seite kippt. Beide Hände.')],
    target: L('About 80° each way – the club almost flat', 'Etwa 80° pro Seite – der Schläger fast waagrecht'),
    sketch: { view: 'side', w: 1, h: 1, items: [] },
    options: [
      { grade: 'pass', label: L('Almost flat both ways (about 80°)', 'Beide Seiten fast waagrecht (etwa 80°)'), picture: () => <ForearmTurn left={82} right={82} /> },
      { grade: 'limited', label: L('One way clearly steeper', 'Eine Seite deutlich steiler'), picture: () => <ForearmTurn left={82} right={50} /> },
      { grade: 'fail', label: L('Both ways clearly steeper', 'Beide Seiten deutlich steiler'), picture: () => <ForearmTurn left={50} right={45} /> },
    ],
    drills: ['mob-forearm-turn'],
    video: v('G6XlJyoKbC4', 'Wrist flexion, extension, wrist hinge and forearm rotation tests', 'NewCare Physical Therapy'),
  },
  {
    id: 'wrist-hinge',
    name: L('Wrist hinge', 'Handgelenk anwinkeln'),
    area: 'wrists',
    why: L('The wrist angle stores speed – without it the club is thrown early (casting).', 'Der Winkel im Handgelenk speichert Tempo – ohne ihn wird der Schläger früh geworfen (Casting).'),
    sides: false,
    mode: 'self',
    quick: false,
    needs: L('a club', 'einen Schläger'),
    setup: L('One arm straight forward at shoulder height, a club in the hand, thumb up.', 'Einen Arm gestreckt nach vorn auf Schulterhöhe, einen Schläger in der Hand, Daumen oben.'),
    steps: [L('Hinge the club up (thumb side) as far as you can, then down.', 'Den Schläger so weit wie möglich nach oben (Daumenseite) anwinkeln, dann nach unten.'), L('The forearm does not turn. Both hands.', 'Der Unterarm dreht nicht mit. Beide Hände.')],
    target: L('About 20° up and 30° down', 'Etwa 20° nach oben und 30° nach unten'),
    sketch: { view: 'side', w: 1, h: 1, items: [] },
    options: [
      { grade: 'pass', label: L('Up and down easily', 'Nach oben und unten gut'), picture: () => <WristHinge up={25} down={35} /> },
      { grade: 'limited', label: L('One way clearly less', 'Eine Richtung deutlich weniger'), picture: () => <WristHinge up={10} down={35} /> },
      { grade: 'fail', label: L('Both ways stiff', 'Beide Richtungen steif'), picture: () => <WristHinge up={8} down={12} /> },
    ],
    drills: ['mob-wrist-hinge', 'mob-wrist-stretch'],
    video: v('7sRILGywnYc', 'Wrist hinge up/down test: evaluates wrist mobility', 'Advanced Physical Therapy'),
  },
  {
    id: 'wrist-flex',
    name: L('Wrist bend', 'Handgelenk beugen und strecken'),
    area: 'wrists',
    why: L('A bowed lead wrist closes the face at impact – cupping or flipping opens it (slice, scoop).', 'Ein gebeugtes vorderes Handgelenk schließt die Schlagfläche im Treffmoment – Abknicken öffnet sie (Slice, Löffeln).'),
    sides: false,
    mode: 'self',
    quick: false,
    setup: L('Forearm on a table, the hand over the edge, back of the hand up.', 'Unterarm auf einen Tisch, die Hand über der Kante, Handrücken oben.'),
    steps: [L('Bend the hand down as far as you can, then up.', 'Die Hand so weit wie möglich nach unten beugen, dann nach oben.'), L('Both hands.', 'Beide Hände.')],
    target: L('About 60° or more each way', 'Etwa 60° oder mehr in jede Richtung'),
    sketch: { view: 'side', w: 1, h: 1, items: [] },
    options: [
      { grade: 'pass', label: L('60° or more each way', '60° oder mehr in jede Richtung'), picture: () => <WristFlex flex={70} ext={65} /> },
      { grade: 'limited', label: L('One way clearly less', 'Eine Richtung deutlich weniger'), picture: () => <WristFlex flex={70} ext={35} /> },
      { grade: 'fail', label: L('Both ways stiff', 'Beide Richtungen steif'), picture: () => <WristFlex flex={35} ext={30} /> },
    ],
    drills: ['mob-wrist-stretch', 'mob-wrist-hinge'],
    video: v('G6XlJyoKbC4', 'Wrist flexion, extension, wrist hinge and forearm rotation tests', 'NewCare Physical Therapy'),
  },
];

/** the order of the full screen: the phone moves as little as possible (front standing → seated → side → floor → self) */
export const FULL: TestId[] = ['pelvic-rotation', 'lower-quarter', 'single-leg', 'neck', 'seated-rotation', 'deep-squat', 'toe-touch', 'shoulder-9090', 'lat', 'bridge', 'pelvic-tilt', 'reach-roll-lift', 'forearm', 'wrist-hinge', 'wrist-flex'];
export const QUICK: TestId[] = FULL.filter((id) => TESTS.find((t) => t.id === id)!.quick);

export const testById = (id: TestId): TestDef => TESTS.find((t) => t.id === id)!;

/** the picture of a test (self checks without own sketch show their best option) */
export function TestPicture(props: { test: TestDef }) {
  const t = props.test;
  if (t.sketch.view === 'side' && t.sketch.items.length === 0 && t.options) return <>{t.options[0].picture()}</>;
  return <SketchView sketch={t.sketch} label={tr(t.name.en, t.name.de)} />;
}
