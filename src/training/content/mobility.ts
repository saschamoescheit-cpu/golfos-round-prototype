import { L, type Drill, type P, type SideItem, type Sketch, type Video } from '../types';
import type { GolferOptions, JointName } from '../Golfer';

// Corrective drills of the mobility screen (Sascha 17.10.2026: "Beweglichkeits-Screening"): for every limited test a
// mobility drill and a stability drill, at home in a few minutes, each with its own picture and two videos. They live
// in the Training library (topic Fitness) so a player finds them there too, and the screen can hand them over as a
// plan. Sources: TPI corrective exercises (mytpi.com), physio standards (knee-to-wall, toe-touch progression after
// Gray Cook / FMS). Videos checked with YouTube oEmbed (17.10.2026). REVIEW(golf): Chris.

const G0 = 0.2;
const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
const ground = (w: number): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]] });
const fig = (x: number, o: GolferOptions & { y?: number; tilt?: number }): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], ...o });
const co = (on: JointName, t: L, at: P, figIndex?: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
const line = (from: P, to: P, dashed = false): SideItem => ({ k: 'line', from, to, dashed });
const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });
const txt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
const v = (id: string, title: string, channel: string, lang: 'en' | 'de' = 'en'): Video => ({ id, title, channel, lang });

type J = Partial<Record<JointName | 'trailHand', P>>;
const pair = (lead: JointName, trail: JointName, p: P, dx = -0.02): J => ({ [lead]: p, [trail]: [p[0] + dx, p[1]] }) as J;
const legs = (hip: P, knee: P, ankle: P, heel: P, toe: P): J => ({ ...pair('leadHip', 'trailHip', hip), ...pair('leadKnee', 'trailKnee', knee), ...pair('leadAnkle', 'trailAnkle', ankle), ...pair('leadHeel', 'trailHeel', heel), ...pair('leadToe', 'trailToe', toe) });
const side = (j: J): GolferOptions => ({ pose: 'address', club: 'none', faceOn: false, joints: j });

/** standing tall, seen from the front */
const FRONT_STAND: J = { head: [0, 1.62], neck: [0, 1.48], pelvis: [0, 0.93], leadShoulder: [0.19, 1.44], trailShoulder: [-0.19, 1.44], leadElbow: [0.22, 1.16], trailElbow: [-0.22, 1.16], hands: [0.24, 0.9], trailHand: [-0.24, 0.9], leadHip: [0.11, 0.93], trailHip: [-0.11, 0.93], leadKnee: [0.12, 0.5], trailKnee: [-0.12, 0.5], leadAnkle: [0.12, 0.08], trailAnkle: [-0.12, 0.08] };
const front = (j: J = {}): GolferOptions => ({ pose: 'front', club: 'none', faceOn: true, joints: { ...FRONT_STAND, ...j } });
/** standing tall, seen from the side (facing right) */
const SIDE_STAND: J = { head: [0.03, 1.62], neck: [0, 1.48], pelvis: [0, 0.93], ...legs([0, 0.93], [0.02, 0.5], [0, 0.08], [-0.06, 0.02], [0.18, 0.02]), ...pair('leadShoulder', 'trailShoulder', [0, 1.44]) };

/** on hands and knees, seen from the side (head to the right) */
const ALL_FOURS: J = {
  pelvis: [0, 0.55],
  neck: [0.55, 0.56],
  head: [0.7, 0.58],
  ...legs([0, 0.55], [0.02, 0.1], [-0.38, 0.1], [-0.36, 0.16], [-0.48, 0.03]),
  ...pair('leadShoulder', 'trailShoulder', [0.53, 0.55]),
  ...pair('leadElbow', 'trailElbow', [0.54, 0.31]),
  hands: [0.55, 0.06],
  trailHand: [0.53, 0.06],
};

const sketches: Record<string, Sketch> = {
  'mob-ankle-wall': S(3, 2.0, [
    ground(3),
    line([2.35, G0], [2.35, 2.0]),
    txt([2.45, 1.85], L('wall', 'Wand'), 10, 'start'),
    fig(1.5, side({ pelvis: [0.05, 0.75], neck: [0.12, 1.27], head: [0.16, 1.4], ...pair('leadHip', 'trailHip', [0.05, 0.75]), leadKnee: [0.5, 0.48], leadAnkle: [0.3, 0.08], leadHeel: [0.24, 0.02], leadToe: [0.48, 0.02], trailKnee: [-0.08, 0.12], trailAnkle: [-0.45, 0.1], trailHeel: [-0.45, 0.16], trailToe: [-0.55, 0.03], ...pair('leadShoulder', 'trailShoulder', [0.12, 1.22]), ...pair('leadElbow', 'trailElbow', [0.4, 1.12]), hands: [0.82, 1.15], trailHand: [0.8, 1.13] })),
    co('leadKnee', L('push the knee over the toes towards the wall', 'Knie über die Zehen Richtung Wand schieben'), [2.6, 1.0]),
    co('leadHeel', L('the heel stays on the floor', 'die Ferse bleibt am Boden'), [0.6, 0.6]),
  ]),
  'mob-toe-touch': S(3, 2.0, [
    ground(3),
    { k: 'line', from: [1.3 + 0.08, G0 + 0.05], to: [1.3 + 0.26, G0 + 0.05] },
    txt([2.0, 0.32], L('toes on a book', 'Zehen auf einem Buch'), 10, 'start'),
    fig(1.3, side({ pelvis: [-0.08, 0.9], neck: [0.17, 0.62], head: [0.27, 0.5], ...legs([-0.08, 0.9], [-0.04, 0.49], [0, 0.08], [-0.06, 0.02], [0.18, 0.07]), ...pair('leadShoulder', 'trailShoulder', [0.15, 0.6]), ...pair('leadElbow', 'trailElbow', [0.18, 0.33]), hands: [0.19, 0.09], trailHand: [0.17, 0.09] })),
    co('hands', L('reach down slowly, breathe out', 'langsam nach unten greifen, ausatmen'), [2.4, 0.9]),
    co('leadKnee', L('a ball between the knees, squeeze', 'einen Ball zwischen den Knien drücken'), [0.3, 1.0]),
  ]),
  'mob-thread-needle': S(3, 1.4, [
    ground(3),
    fig(1.1, side({ ...ALL_FOURS, leadElbow: [0.42, 0.3], hands: [0.25, 0.1], head: [0.62, 0.45], neck: [0.5, 0.5] })),
    co('hands', L('slide the arm under the body, the shoulder to the floor', 'den Arm unter dem Körper durchschieben, Schulter Richtung Boden'), [2.6, 1.2]),
    co('pelvis', L('the hips stay over the knees', 'die Hüfte bleibt über den Knien'), [0.3, 1.2]),
  ]),
  'mob-pelvic-turn': S(3, 2.1, [
    ground(3),
    fig(1.5, { pose: 'front', club: 'none', crossClub: true }),
    arrow([1.2, 1.03], [1.05, 0.98]),
    arrow([1.8, 1.03], [1.95, 0.98]),
    co('pelvis', L('turn only the hips, slowly both ways', 'nur die Hüfte drehen, langsam zu beiden Seiten'), [2.6, 0.9]),
    co('leadShoulder', L('the club across the chest stays square', 'der Schläger vor der Brust bleibt gerade'), [2.6, 1.8]),
  ]),
  'mob-cat-camel': S(3, 1.4, [
    ground(3),
    fig(1.1, side(ALL_FOURS)),
    arrow([1.35, 0.95], [1.35, 1.2]),
    arrow([1.35, 0.88], [1.35, 0.68]),
    co('neck', L('round the back up like a cat, then let it sag', 'den Rücken wie eine Katze rund machen, dann durchhängen lassen'), [2.5, 1.25]),
    co('pelvis', L('the movement starts in the pelvis', 'die Bewegung beginnt im Becken'), [0.3, 1.2]),
  ]),
  'mob-pelvic-tilt': S(3.2, 1.3, [
    ground(3.2),
    fig(1.4, { pose: 'bridge', joints: { pelvis: [0, 0.12], leadHip: [0, 0.12], trailHip: [0, 0.12] } }),
    arrow([1.25, 0.5], [1.15, 0.42]),
    arrow([1.55, 0.5], [1.65, 0.42]),
    co('pelvis', L('flatten the low back to the floor, then arch it', 'den unteren Rücken auf den Boden drücken, dann ins Hohlkreuz'), [1.2, 1.15]),
    co('trailKnee', L('knees bent, feet flat', 'Knie gebeugt, Füße flach'), [2.8, 0.9]),
  ]),
  'mob-single-leg-reach': S(3, 2.1, [
    ground(3),
    fig(1.4, side({ pelvis: [0, 0.88], neck: [0.32, 1.25], head: [0.42, 1.33], ...pair('leadHip', 'trailHip', [0, 0.88]), leadKnee: [0.06, 0.48], leadAnkle: [0, 0.08], leadHeel: [-0.06, 0.02], leadToe: [0.18, 0.02], trailKnee: [-0.38, 0.75], trailAnkle: [-0.75, 0.62], trailHeel: [-0.75, 0.68], trailToe: [-0.85, 0.56], ...pair('leadShoulder', 'trailShoulder', [0.3, 1.22]), ...pair('leadElbow', 'trailElbow', [0.5, 1.05]), hands: [0.68, 0.88], trailHand: [0.66, 0.88] })),
    co('hands', L('reach forward, low and to the sides', 'nach vorn, unten und zu den Seiten greifen'), [2.5, 1.5]),
    co('leadKnee', L('the standing knee slightly bent and stable', 'das Standknie leicht gebeugt und stabil'), [2.4, 0.6]),
  ]),
  'mob-single-leg-bridge': S(3.2, 1.3, [
    ground(3.2),
    fig(1.4, { pose: 'bridge', joints: { leadKnee: [0.385, 0.56], leadAnkle: [0.77, 0.73], leadHeel: [0.74, 0.69], leadToe: [0.81, 0.86] } }),
    co('pelvis', L('push the hips up on one leg, 2 s at the top', 'Hüfte auf einem Bein hochdrücken, oben 2 s halten'), [1.2, 1.15]),
    co('leadAnkle', L('the free leg stays in line', 'das freie Bein bleibt in Linie'), [2.7, 1.1]),
  ]),
  'mob-clamshell': S(3, 1.3, [
    ground(3),
    // on the side, knees bent, the feet together: the top knee opens
    fig(1.6, { pose: 'sidelying', joints: { leadKnee: [0.3, 0.6], leadAnkle: [0.57, 0.37], leadHeel: [0.53, 0.35], leadToe: [0.67, 0.4], leadElbow: [-0.08, 0.6], hands: [0.06, 0.5] } }),
    arrow([2.0, 0.72], [2.0, 0.98]),
    co('leadKnee', L('open the top knee, feet stay together', 'das obere Knie öffnen, die Füße bleiben zusammen'), [2.6, 1.2]),
    co('pelvis', L('the pelvis does not roll back', 'das Becken kippt nicht nach hinten'), [0.6, 1.1]),
  ]),
  'mob-lat-stretch': S(3, 1.6, [
    ground(3),
    line([1.75, G0 + 0.45], [2.35, G0 + 0.45]),
    line([1.85, G0], [1.85, G0 + 0.45]),
    line([2.25, G0], [2.25, G0 + 0.45]),
    txt([2.05, G0 + 0.2], L('bench', 'Bank'), 9),
    fig(1.0, side({ pelvis: [0, 0.55], neck: [0.55, 0.5], head: [0.67, 0.44], ...legs([0, 0.55], [0.02, 0.1], [-0.38, 0.1], [-0.36, 0.16], [-0.48, 0.03]), ...pair('leadShoulder', 'trailShoulder', [0.53, 0.52]), ...pair('leadElbow', 'trailElbow', [0.86, 0.5]), hands: [0.62, 0.6], trailHand: [0.6, 0.6] })),
    co('leadElbow', L('elbows on the bench, hands together behind the head', 'Ellbogen auf der Bank, Hände hinter dem Kopf zusammen'), [2.6, 1.45]),
    co('pelvis', L('sit the hips back to the heels, the chest sinks', 'die Hüfte nach hinten zu den Fersen, die Brust sinkt'), [0.3, 1.2]),
  ]),
  'mob-wall-angels': S(3, 2.1, [
    ground(3),
    fig(1.5, front({ leadElbow: [0.38, 1.47], trailElbow: [-0.38, 1.47], hands: [0.36, 1.8], trailHand: [-0.36, 1.8] })),
    arrow([1.5 + 0.48, 1.95], [1.5 + 0.42, 2.06]),
    co('hands', L('back of the hands and elbows touch the wall, slide up and down', 'Handrücken und Ellbogen an der Wand, hoch und runter gleiten'), [2.6, 1.95]),
    co('pelvis', L('back and head stay on the wall', 'Rücken und Kopf bleiben an der Wand'), [2.6, 0.9]),
  ]),
  'mob-9090-stretch': S(3, 2.1, [
    ground(3),
    // the "goal post": upper arm out at shoulder height, forearm up; the other hand pushes it back with a stick
    fig(1.4, front({ leadElbow: [0.46, 1.43], hands: [0.47, 1.72], trailElbow: [-0.1, 1.2], trailHand: [0.08, 1.3] })),
    line([1.4 + 0.08, G0 + 1.3], [1.4 + 0.5, G0 + 1.62]),
    co('hands', L('the forearm turns back, a stick helps', 'der Unterarm dreht nach hinten, ein Stab hilft'), [2.5, 1.95]),
    co('leadElbow', L('elbow at shoulder height, bent 90°', 'Ellbogen auf Schulterhöhe, 90° gebeugt'), [2.55, 1.2]),
  ]),
  'mob-band-er': S(3, 2.1, [
    ground(3),
    fig(1.5, front({ leadElbow: [0.2, 1.16], trailElbow: [-0.2, 1.16], hands: [0.44, 1.2], trailHand: [-0.44, 1.2] })),
    line([1.5 - 0.44, G0 + 1.2], [1.5 + 0.44, G0 + 1.2], true),
    co('hands', L('hands out against the band', 'Hände gegen das Band nach außen'), [2.6, 1.6]),
    co('leadElbow', L('elbows stay at the sides', 'Ellbogen bleiben am Körper'), [2.6, 0.9]),
  ]),
  'mob-hip-ir': S(3, 1.6, [
    ground(3),
    fig(1.5, { pose: 'floorsit' }),
    arrow([2.0, 0.55], [2.0, 0.8]),
    co('leadKnee', L('90/90 seat: lift the back knee and foot off the floor', '90/90-Sitz: das hintere Knie mit dem Fuß vom Boden heben'), [2.6, 1.3]),
    co('head', L('sit tall', 'aufrecht sitzen'), [0.5, 1.4]),
  ]),
  'mob-prone-y': S(3.2, 1.0, [
    ground(3.2),
    fig(1.9, side({ pelvis: [0, 0.14], neck: [-0.52, 0.16], head: [-0.66, 0.2], ...legs([0, 0.14], [0.43, 0.1], [0.85, 0.1], [0.84, 0.16], [0.95, 0.03]), ...pair('leadShoulder', 'trailShoulder', [-0.5, 0.17]), ...pair('leadElbow', 'trailElbow', [-0.78, 0.24]), hands: [-1.04, 0.32], trailHand: [-1.02, 0.3] })),
    co('hands', L('arms in a Y, thumbs up – lift', 'Arme im Y, Daumen oben – anheben'), [0.4, 0.9]),
    co('neck', L('pull the shoulder blades down and back', 'Schulterblätter nach hinten unten ziehen'), [2.4, 0.9]),
  ]),
  'mob-neck-turn': S(3, 2.1, [
    ground(3),
    fig(1.5, front()),
    co('head', L('chin in, then turn the head slowly to each side', 'Kinn einziehen, dann den Kopf langsam zu jeder Seite drehen'), [2.6, 1.95]),
    co('leadShoulder', L('the shoulders stay low and still', 'die Schultern bleiben tief und ruhig'), [2.6, 1.3]),
  ]),
  'mob-forearm-turn': S(3, 2.1, [
    ground(3),
    // the elbow at the side, the forearm forward (towards you), the club held short: it tips to the side
    fig(1.5, { ...front({ leadElbow: [0.22, 1.16], hands: [0.26, 1.08], trailElbow: [-0.22, 1.16], trailHand: [-0.24, 0.9] }), club: 'iron', joints: { ...FRONT_STAND, leadElbow: [0.22, 1.16], hands: [0.26, 1.08], trailElbow: [-0.22, 1.16], trailHand: [-0.24, 0.9], clubHead: [0.72, 1.36] } }),
    line([1.5 + 0.26, G0 + 1.08], [1.5 + 0.26, G0 + 1.65], true),
    co('hands', L('club short at the grip, tip it slowly left and right', 'Schläger kurz am Griff, langsam nach links und rechts kippen'), [2.6, 1.95]),
    co('leadElbow', L('the elbow stays at the side, bent 90°', 'der Ellbogen bleibt am Körper, 90° gebeugt'), [2.6, 0.9]),
  ]),
  'mob-wrist-hinge': S(3, 2.1, [
    ground(3),
    fig(1.0, { ...side({ ...SIDE_STAND, leadElbow: [0.28, 1.43], hands: [0.55, 1.43], trailElbow: [0.02, 1.16], trailHand: [0.04, 0.88], clubHead: [1.05, 1.78] }), club: 'iron' }),
    line([1.0 + 0.55, G0 + 1.43], [1.0 + 1.15, G0 + 1.43], true),
    co('hands', L('arm straight at shoulder height, hinge the club up and down', 'Arm gestreckt auf Schulterhöhe, den Schläger hoch und runter anwinkeln'), [2.4, 1.95]),
    co('leadElbow', L('only the wrist moves', 'nur das Handgelenk bewegt sich'), [2.5, 1.0]),
  ]),
  'mob-wrist-stretch': S(3, 1.4, [
    ground(3),
    fig(1.1, side({ ...ALL_FOURS, hands: [0.5, 0.06], trailHand: [0.48, 0.06] })),
    co('hands', L('fingers point to the knees, rock back gently', 'Finger zeigen zu den Knien, sanft nach hinten wippen'), [2.4, 1.2]),
    co('pelvis', L('then the backs of the hands on the floor', 'dann die Handrücken auf den Boden'), [0.3, 1.2]),
  ]),
};

const drill = (d: Omit<Drill, 'cat' | 'level' | 'place' | 'scoring' | 'review' | 'sketch'> & Partial<Pick<Drill, 'level' | 'place'>>): Drill => ({
  cat: 'fitness',
  level: 1,
  place: 'home',
  scoring: { kind: 'none' },
  review: true,
  sketch: sketches[d.id],
  ...d,
});

export const mobilityDrills: Drill[] = [
  drill({
    id: 'mob-ankle-wall',
    name: L('Knee to wall', 'Knie zur Wand'),
    goal: L('Ankle mobility – deeper squat and a stable posture.', 'Beweglichkeit im Sprunggelenk – tiefere Kniebeuge und eine stabile Haltung.'),
    minutes: 3,
    setup: L('Face a wall, the front foot a hand’s width away, the back knee on the floor.', 'Vor eine Wand, der vordere Fuß eine Handbreit entfernt, das hintere Knie am Boden.'),
    steps: [L('Push the front knee over the toes to the wall – the heel stays down.', 'Das vordere Knie über die Zehen zur Wand schieben – die Ferse bleibt unten.'), L('10 times per side; move the foot back when the knee touches easily.', '10-mal pro Seite; den Fuß weiter zurück, wenn das Knie leicht ankommt.')],
    videos: [v('ElrpduJn92Y', 'Knee to wall exercise for ankle mobility', 'Dr. Jess Harvey'), v('kbzYML05Vac', 'Knee to wall dorsiflexion lunge test', 'The Physio Channel')],
  }),
  drill({
    id: 'mob-toe-touch',
    name: L('Toe touch with a book', 'Zehen berühren mit Buch'),
    goal: L('Hamstrings and hip hinge – keep the posture through the swing.', 'Hintere Oberschenkel und Hüftbeuge – die Haltung im Schwung halten.'),
    minutes: 4,
    needs: [L('a thick book or board, a small ball', 'ein dickes Buch oder Brett, einen kleinen Ball')],
    setup: L('Toes on a book, heels on the floor, a ball between the knees.', 'Zehen auf einem Buch, Fersen am Boden, ein Ball zwischen den Knien.'),
    steps: [L('Squeeze the ball, reach slowly to the floor and breathe out.', 'Den Ball drücken, langsam zum Boden greifen und ausatmen.'), L('10 slow reaches; then the same with the heels on the book.', '10 langsame Wiederholungen; dann dasselbe mit den Fersen auf dem Buch.')],
    videos: [v('hvaBJdBSDwI', 'Toe touch progression for golfers', 'Scottish Rite for Children'), v('muKFPa_w1og', 'Coaching the toe touch progression with Gray Cook', 'FMS')],
  }),
  drill({
    id: 'mob-thread-needle',
    name: L('Thread the needle', 'Nadel einfädeln'),
    goal: L('Rotation of the upper back – a fuller turn.', 'Rotation des oberen Rückens – eine vollere Drehung.'),
    minutes: 3,
    setup: L('On hands and knees, hips over the knees, hands under the shoulders.', 'Im Vierfüßlerstand, Hüfte über den Knien, Hände unter den Schultern.'),
    steps: [L('Slide one arm under the body until the shoulder comes towards the floor.', 'Einen Arm unter dem Körper durchschieben, bis die Schulter Richtung Boden kommt.'), L('Then open it up to the ceiling, eyes follow. 8 per side.', 'Dann zur Decke öffnen, der Blick folgt. 8 pro Seite.')],
    videos: [v('7C8-zj3nRro', 'Thread the needle for thoracic rotation', 'Elite Performance Institute'), v('YuAJ1i76Hek', 'Thread the needle, thoracic rotation', 'Streamline Performance Physical Therapy')],
  }),
  drill({
    id: 'mob-pelvic-turn',
    name: L('Hip turns in golf posture', 'Hüfte drehen in Golfhaltung'),
    goal: L('Turn the hips without the chest – the hips lead the downswing.', 'Die Hüfte ohne die Brust drehen – die Hüfte führt den Abschwung.'),
    minutes: 3,
    needs: [L('a club', 'einen Schläger')],
    setup: L('Golf posture, a club across the chest, in front of a mirror.', 'Golfhaltung, ein Schläger quer vor der Brust, vor einem Spiegel.'),
    steps: [L('Turn only the hips slowly back and through – the club stays square to the mirror.', 'Nur die Hüfte langsam zurück und nach vorn drehen – der Schläger bleibt parallel zum Spiegel.'), L('2 × 10, then the other way round: the chest turns, the hips stay.', '2 × 10, dann umgekehrt: die Brust dreht, die Hüfte bleibt.')],
    videos: [v('kc4bx3HeRBg', 'Pelvic tilt and turn for a better golf swing', 'MPowerPhysTherapy'), v('rYx2zkDzZ80', 'Best hip rotation drill for your backswing and downswing', 'Kerrod Gray Golf')],
  }),
  drill({
    id: 'mob-cat-camel',
    name: L('Cat and camel', 'Katze und Kamel'),
    goal: L('Feel and control the pelvis and the spine.', 'Becken und Wirbelsäule spüren und steuern.'),
    minutes: 2,
    setup: L('On hands and knees.', 'Im Vierfüßlerstand.'),
    steps: [L('Round the back up like a cat, starting in the pelvis – then let it sag slowly.', 'Den Rücken wie eine Katze rund machen, aus dem Becken heraus – dann langsam durchhängen lassen.'), L('10 slow rounds.', '10 langsame Runden.')],
    videos: [v('SGK456CrUE8', 'Cat camel stretch', 'Shaun Diachkoff: Golf Fitness'), v('V_zKdpWxbfI', 'Cat and camel drill', 'mygolfinstructor')],
  }),
  drill({
    id: 'mob-pelvic-tilt',
    name: L('Pelvic tilts lying down', 'Beckenkippen im Liegen'),
    goal: L('Control of the pelvis – a neutral back at address.', 'Kontrolle über das Becken – ein neutraler Rücken beim Ansprechen.'),
    minutes: 3,
    setup: L('On your back, knees bent, feet flat.', 'Auf dem Rücken, Knie gebeugt, Füße flach.'),
    steps: [L('Press the low back into the floor, then arch it – only the pelvis moves.', 'Den unteren Rücken in den Boden drücken, dann ins Hohlkreuz – nur das Becken bewegt sich.'), L('15 times; then standing in golf posture.', '15-mal; dann im Stehen in Golfhaltung.')],
    videos: [v('kc4bx3HeRBg', 'Pelvic tilt and turn for a better golf swing', 'MPowerPhysTherapy'), v('SU-MQnnP4Ts', 'Understanding and assessing pelvic tilt in the golf swing', 'TPI – Titleist Performance Institute')],
  }),
  drill({
    id: 'mob-single-leg-reach',
    name: L('Single-leg reach', 'Einbeinstand mit Greifen'),
    goal: L('Balance in motion – stay centred over the ball.', 'Gleichgewicht in Bewegung – über dem Ball bleiben.'),
    minutes: 4,
    setup: L('Stand on one leg, the knee slightly bent.', 'Auf einem Bein stehen, das Knie leicht gebeugt.'),
    steps: [L('Reach forward, to the side and down with the hands – the free leg goes back.', 'Mit den Händen nach vorn, zur Seite und nach unten greifen – das freie Bein geht nach hinten.'), L('5 rounds per leg; later with the eyes closed.', '5 Runden pro Bein; später mit geschlossenen Augen.')],
    videos: [v('0v85JNJEJXU', 'Single leg balance with 3-point reach', 'Jon Hodgkinson Golf Fitness'), v('TJ6TgSFQmeo', 'Single leg balance forward and side reach', 'Sam Vickers Golf Performance')],
  }),
  drill({
    id: 'mob-single-leg-bridge',
    name: L('Single-leg bridge', 'Einbeinige Brücke'),
    goal: L('Glute strength on each side – no early extension.', 'Gesäßkraft auf jeder Seite – kein frühes Aufrichten.'),
    minutes: 4,
    setup: L('On your back, one foot flat, the other leg straight in line with the thigh.', 'Auf dem Rücken, ein Fuß flach, das andere Bein gestreckt in Linie mit dem Oberschenkel.'),
    steps: [L('Push the hips up on one leg, hold 2 s, lower slowly.', 'Die Hüfte auf einem Bein hochdrücken, 2 s halten, langsam senken.'), L('2 × 8 per side; the pelvis stays level.', '2 × 8 pro Seite; das Becken bleibt waagrecht.')],
    videos: [v('yFNjwkUNIao', 'How to single leg glute bridge properly', 'Michael Hermann'), v('vdmlNaXSjd4', 'Single leg glute bridge', 'Middlebury College')],
  }),
  drill({
    id: 'mob-clamshell',
    name: L('Clamshell', 'Muschel'),
    goal: L('The side glute – keeps the hips from sliding.', 'Der seitliche Gesäßmuskel – verhindert, dass die Hüfte schiebt.'),
    minutes: 3,
    needs: ['resistance-bands'],
    setup: L('On your side, knees bent, feet together (a band above the knees).', 'Auf der Seite, Knie gebeugt, Füße zusammen (ein Band über den Knien).'),
    steps: [L('Open the top knee like a shell – the feet stay together, the pelvis does not roll.', 'Das obere Knie wie eine Muschel öffnen – die Füße bleiben zusammen, das Becken kippt nicht.'), L('2 × 15 per side.', '2 × 15 pro Seite.')],
    videos: [v('gN9ukMKrdEo', 'Clamshells: glute med strengthening', 'Dr. Carl Baird'), v('aQVApsdOLSI', 'Clamshell exercise – strengthen gluteus medius', 'PostureFlow')],
  }),
  drill({
    id: 'mob-lat-stretch',
    name: L('Kneeling lat stretch', 'Latissimus-Dehnung kniend'),
    goal: L('Longer lats – higher arms and a straighter back.', 'Ein längerer Latissimus – höhere Arme und ein geraderer Rücken.'),
    minutes: 3,
    needs: [L('a bench or chair', 'eine Bank oder einen Stuhl')],
    setup: L('Kneel in front of a bench, elbows on it, hands together behind the head.', 'Vor einer Bank knien, die Ellbogen darauf, Hände hinter dem Kopf zusammen.'),
    steps: [L('Sit the hips back towards the heels and let the chest sink.', 'Die Hüfte nach hinten zu den Fersen schieben und die Brust absinken lassen.'), L('Breathe out, hold 30 s, 3 times.', 'Ausatmen, 30 s halten, 3-mal.')],
    videos: [v('rOYQZtRURCE', 'Kneeling lat stretch for better golf rotation', 'Sophie Bargeron – SLB Performance'), v('HfcAyiOymmg', 'Stretching the lats for golfers', 'Colorado AvidGolfer')],
  }),
  drill({
    id: 'mob-wall-angels',
    name: L('Wall angels', 'Wandengel'),
    goal: L('Upper back and shoulders – arms overhead without a hollow back.', 'Oberer Rücken und Schultern – Arme über den Kopf ohne Hohlkreuz.'),
    minutes: 3,
    needs: [L('a wall', 'eine Wand')],
    setup: L('Back against a wall, feet a little away, the low back flat.', 'Mit dem Rücken an eine Wand, die Füße etwas davor, der untere Rücken flach.'),
    steps: [L('Arms in a W at the wall, slide them up to a Y and back down.', 'Die Arme im W an die Wand, nach oben zum Y gleiten und zurück.'), L('Hands, elbows and head stay on the wall. 2 × 10.', 'Hände, Ellbogen und Kopf bleiben an der Wand. 2 × 10.')],
    videos: [v('cvx06snMQ3A', 'Wall angel', 'Rehab My Patient'), v('1UU4VvklQ44', 'How to perform the wall angel for a tight upper back', 'Vive Health')],
  }),
  drill({
    id: 'mob-9090-stretch',
    name: L('90/90 shoulder stretch', '90/90-Schulterdehnung'),
    goal: L('Outer rotation of the shoulder – room for the trail arm at the top.', 'Außenrotation der Schulter – Platz für den hinteren Arm am Top.'),
    minutes: 3,
    needs: [L('a stick or club', 'einen Stab oder Schläger')],
    setup: L('Upper arm at shoulder height out to the side, elbow bent 90°.', 'Oberarm auf Schulterhöhe seitlich, Ellbogen 90° gebeugt.'),
    steps: [L('With the stick in the other hand, gently push the forearm back.', 'Mit dem Stab in der anderen Hand den Unterarm sanft nach hinten drücken.'), L('Hold 20 s, 3 times per side – no pain.', '20 s halten, 3-mal pro Seite – ohne Schmerz.')],
    videos: [v('kqs1dm8Lt8Y', '90-90 shoulder PVC external rotation stretch', 'Strength & Sport'), v('vhpYIKmXJeU', 'Passive shoulder ER at 90/90', 'Sophie Bargeron – SLB Performance')],
  }),
  drill({
    id: 'mob-band-er',
    name: L('Band external rotation', 'Außenrotation mit Band'),
    goal: L('Strength for the shoulder in the turn – a stable trail arm.', 'Kraft für die Schulter in der Drehung – ein stabiler hinterer Arm.'),
    minutes: 3,
    needs: ['resistance-bands'],
    setup: L('Stand tall, elbows at the sides bent 90°, a band between the hands.', 'Aufrecht stehen, Ellbogen am Körper 90° gebeugt, ein Band zwischen den Händen.'),
    steps: [L('Turn the hands out against the band – the elbows stay at the sides.', 'Die Hände gegen das Band nach außen drehen – die Ellbogen bleiben am Körper.'), L('2 × 15, slowly back.', '2 × 15, langsam zurück.')],
    videos: [v('ybNV36DoRfY', 'Banded shoulder external rotation', 'Rehab My Patient'), v('y8WKcz0vqzg', 'Standing external rotation with resistance band', 'MGH Orthopaedics')],
  }),
  drill({
    id: 'mob-hip-ir',
    name: L('Hip inner rotation lifts', 'Hüft-Innenrotation heben'),
    goal: L('Inner rotation of the hips – turn into the hips instead of swaying.', 'Innenrotation der Hüfte – in die Hüfte drehen statt auszuweichen.'),
    minutes: 4,
    setup: L('Sit in the 90/90 position, hands behind you on the floor.', 'Im 90/90-Sitz, die Hände hinter dir am Boden.'),
    steps: [L('Lift the back knee and foot off the floor, hold 2 s, lower.', 'Das hintere Knie mit dem Fuß vom Boden heben, 2 s halten, senken.'), L('2 × 8 per side.', '2 × 8 pro Seite.')],
    videos: [v('Z3mjuH8OVJM', 'How to safely increase lead hip internal rotation in golfers', 'Breakthrough Sports Performance'), v('TYzqHRZC8-0', 'Using joint distraction to improve hip mobility', 'TPI – Titleist Performance Institute')],
  }),
  drill({
    id: 'mob-prone-y',
    name: L('Prone Y raise', 'Y-Heben im Liegen'),
    goal: L('Lower shoulder blade muscles – arms high and wide.', 'Untere Schulterblattmuskeln – Arme hoch und weit.'),
    minutes: 3,
    setup: L('Lie face down, arms overhead in a Y, thumbs up.', 'Auf dem Bauch liegen, die Arme über dem Kopf im Y, Daumen oben.'),
    steps: [L('Pull the shoulder blades down and back and lift the arms.', 'Die Schulterblätter nach hinten unten ziehen und die Arme anheben.'), L('Hold 2 s, 2 × 10.', '2 s halten, 2 × 10.')],
    videos: [v('juoKsTqy77E', 'Y-raise (prone V-raise) – lower trapezius strengthening', 'PhysioExercise'), v('QdGTI4Lshg4', 'Prone Y T W', 'The Active Life')],
  }),
  drill({
    id: 'mob-neck-turn',
    name: L('Head turns with the chin in', 'Kopf drehen mit Kinn eingezogen'),
    goal: L('Neck rotation – the head stays still while the shoulders turn.', 'Halsdrehung – der Kopf bleibt ruhig, während die Schultern drehen.'),
    minutes: 2,
    setup: L('Sit or stand tall, shoulders low.', 'Aufrecht sitzen oder stehen, Schultern tief.'),
    steps: [L('Pull the chin in a little, then turn the head slowly to each side.', 'Das Kinn etwas einziehen, dann den Kopf langsam zu jeder Seite drehen.'), L('10 per side; then in golf posture with the club across the chest turning under the head.', '10 pro Seite; dann in Golfhaltung, der Schläger vor der Brust dreht unter dem Kopf.')],
    videos: [v('1maMe0l3Wpw', 'The importance of neck mobility in the golf swing', 'TPI – Titleist Performance Institute'), v('5pkTKm8A6sY', 'Neck mobility workout: improve rotation for a better golf swing', 'P4S Golf')],
  }),
  drill({
    id: 'mob-forearm-turn',
    name: L('Forearm turns with a club', 'Unterarm drehen mit Schläger'),
    goal: L('Forearm rotation – squaring the face without a bent arm.', 'Unterarmdrehung – die Schlagfläche schließen ohne eingeknickten Arm.'),
    minutes: 2,
    needs: [L('a club', 'einen Schläger')],
    setup: L('Elbow at the side bent 90°, the club short at the grip, upright.', 'Ellbogen am Körper 90° gebeugt, den Schläger kurz am Griff, senkrecht.'),
    steps: [L('Tip the club slowly left and right as far as you can.', 'Den Schläger langsam so weit wie möglich nach links und rechts kippen.'), L('10 per side and hand.', '10 pro Seite und Hand.')],
    videos: [v('Y-2-lnALVZE', 'Forearm pronation and supination: manual exercises', 'Mike Reinold'), v('VV7zsl6LafM', 'Forearm pronation supination', 'Baptist Health')],
  }),
  drill({
    id: 'mob-wrist-hinge',
    name: L('Wrist hinges with a club', 'Handgelenk anwinkeln mit Schläger'),
    goal: L('The wrist angle that stores speed.', 'Der Handgelenkswinkel, der Tempo speichert.'),
    minutes: 2,
    needs: [L('a club', 'einen Schläger')],
    setup: L('Arm straight forward, thumb up, the club in the hand.', 'Arm gestreckt nach vorn, Daumen oben, den Schläger in der Hand.'),
    steps: [L('Hinge the club up and down slowly – only the wrist moves.', 'Den Schläger langsam hoch und runter anwinkeln – nur das Handgelenk bewegt sich.'), L('15 per hand.', '15 pro Hand.')],
    videos: [v('F0MI6tV3zHQ', 'Wrist exercises all golfers must do', 'Tyler Parsons (tpgolffitness)'), v('-MfR-LbcmeY', 'Wrist workout for golf: improve wrist set and release', 'ULaunch Golf Fitness')],
  }),
  drill({
    id: 'mob-wrist-stretch',
    name: L('Wrist stretches on all fours', 'Handgelenk dehnen im Vierfüßler'),
    goal: L('Bending and stretching the wrists – a bowed lead wrist at impact.', 'Handgelenke beugen und strecken – ein gebeugtes vorderes Handgelenk im Treffmoment.'),
    minutes: 3,
    setup: L('On hands and knees, fingers pointing to the knees.', 'Im Vierfüßlerstand, die Finger zeigen zu den Knien.'),
    steps: [L('Rock gently back, 20 s.', 'Sanft nach hinten wippen, 20 s.'), L('Then the backs of the hands on the floor, 20 s. 3 rounds.', 'Dann die Handrücken auf den Boden, 20 s. 3 Runden.')],
    videos: [v('F0MI6tV3zHQ', 'Wrist exercises all golfers must do', 'Tyler Parsons (tpgolffitness)'), v('-MfR-LbcmeY', 'Wrist workout for golf: improve wrist set and release', 'ULaunch Golf Fitness')],
  }),
];

/** More videos for the fitness drills that were already there (they become corrective drills of the screen). */
export const MOBILITY_DRILL_VIDEOS: Record<string, Video[]> = {
  'glute-bridge': [v('UPul1G7QAcQ', 'Fitness: the glute bridge', 'Golf Digest'), v('E3Kt5qUYWfY', 'Avoid the #1 glute bridge mistake', 'Conor Harris')],
  'open-books': [v('nuv-L3OfiYc', 'T-spine open book exercise for golf', 'Fairway Physio')],
  'hip-9090': [v('m51AZSXMvEA', '90 90 hip switch', 'The Active Life')],
  'single-leg-balance': [v('0v85JNJEJXU', 'Single leg balance with 3-point reach', 'Jon Hodgkinson Golf Fitness')],
  'deep-squat': [v('ShvTpCsgTiw', 'How to perform a goblet squat stretch', 'Squat University')],
  'pallof-press': [v('7vkITJGxq_I', 'How to perform a golf Pallof press', 'Sam Vickers Golf Performance')],
  'seated-rotation': [v('fXd4ozI-Ojk', 'Seated thoracic rotation test: spine rotational mobility', 'Advanced Physical Therapy')],
};
