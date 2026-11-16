import { L, type TopicShot } from '../types';
import { S, aimCurve, ball, blades, co, fig, flight, ground, hill, landRoll, line, txt, G0 } from './shots-kit';
import { FIGURE_SKETCHES } from './sketches-figures';

// The shots of pitching, lob, spin, bunker, slopes, trouble, high & low and the low point (Sascha 15.11.2026: "the
// remaining ones exactly like the chipping pattern"). Every shot: Set-up rows, Motion, What to watch – each with a
// picture – and the drills to practise it. Values are the common teaching standard; our pro checks them.

const flat = (x: number) => G0 + 0 * x;

// ---------- pitching ----------

const pUp = hill(4, 0.2, 0.9);
const pUpMove = hill(5, 0.2, 1.08);

export const PITCH_SHOTS: TopicShot[] = [
  {
    id: 'pitch-standard',
    name: L('The standard pitch', 'Der Standard-Pitch'),
    short: L('From 15 to 60 m: a higher flight, a short roll – the body turns, the arms follow.', 'Von 15 bis 60 m: höherer Flug, kurzes Rollen – der Körper dreht, die Arme folgen.'),
    setup: {
      section: 'The pitch set-up',
      rows: [
        { k: 'ball', v: L('Middle of the stance', 'Mitte des Stands') },
        { k: 'stance', v: L('A little narrower than a full swing, slightly open', 'Etwas schmaler als beim vollen Schwung, leicht offen') },
        { k: 'weight', v: L('55–60 % on the lead foot', '55–60 % auf dem vorderen Fuß') },
        { k: 'grip', v: L('2–3 cm down the grip, the arms hang', '2–3 cm kürzer greifen, die Arme hängen') },
        { k: 'club', v: L('PW, GW, SW or LW – by your wedge chart', 'PW, GW, SW oder LW – nach deiner Wedge-Tabelle') },
      ],
    },
    move: {
      section: 'The motion',
      text: [
        L(
          'The chest turns back and through, the arms stay in front of the chest, the wrists hinge naturally. Ball first, then a shallow divot. Through at least as long as back, the chest facing the target at the end.',
          'Die Brust dreht zurück und durch, die Arme bleiben vor der Brust, die Handgelenke winkeln natürlich an. Erst der Ball, dann ein flaches Divot. Durch mindestens so lang wie zurück, am Ende zeigt die Brust zum Ziel.',
        ),
      ],
    },
    watch: {
      points: [
        L('The length comes from the length of the backswing, not from hitting harder – the rhythm stays the same.', 'Die Länge kommt von der Länge des Ausholens, nicht vom härteren Schlag – der Rhythmus bleibt gleich.'),
        L('Do not scoop: the hands lead through the ball, the loft lifts it.', 'Nicht schaufeln: Die Hände führen durch den Ball, der Loft hebt ihn.'),
        L('The ball lands about two thirds of the way and rolls the rest.', 'Der Ball landet nach etwa zwei Dritteln und rollt den Rest.'),
      ],
      sketch: S(6, 2.2, [ground(6), ...landRoll(6, 0.5, 3.7, 4.9, 1.2, flat, [L('higher flight', 'höherer Flug'), L('short roll', 'kurzes Rollen')])], L('Carry about two thirds, roll one third.', 'Etwa zwei Drittel Flug, ein Drittel Rollen.')),
    },
    drills: ['feet-together-pitch', 'towel-arms', 'nine-to-three', 'stick-lead-arm', 'pitch-towel-landing'],
    videos: ['OYlbeTYHihA', '5vYP8wOgu1Y'],
  },
  {
    id: 'pitch-clock',
    name: L('Distance control: the clock system', 'Längenkontrolle: das Uhr-System'),
    short: L('Three swing lengths per wedge – your exact distances inside 100 m.', 'Drei Schwunglängen je Wedge – deine genauen Längen unter 100 m.'),
    setup: {
      section: 'The clock system',
      rows: [
        { k: 'swing', v: L('The lead arm is the hour hand: 7:30, 9:00 and 10:30', 'Der vordere Arm ist der Stundenzeiger: 7:30, 9:00 und 10:30') },
        { k: 'club', v: L('Three lengths with each wedge = up to 12 distances', 'Drei Längen mit jedem Wedge = bis zu 12 Distanzen') },
        { k: 'ball', v: L('Middle, as for the standard pitch', 'Mitte, wie beim Standard-Pitch') },
        { k: 'grip', v: L('The shorter the swing, the shorter the grip', 'Je kürzer der Schwung, desto kürzer gegriffen') },
      ],
    },
    move: {
      text: [
        L(
          'Only the backswing changes; the rhythm stays the same for every length. Through at least as long as back – a 9:00 swing goes to 3:00. Measure each length on the range and write it in your wedge chart.',
          'Nur das Ausholen ändert sich; der Rhythmus bleibt bei jeder Länge gleich. Durch mindestens so lang wie zurück – ein 9-Uhr-Schwung geht bis 3 Uhr. Miss jede Länge auf der Range und trag sie in deine Wedge-Tabelle ein.',
        ),
      ],
      sketch: FIGURE_SKETCHES['nine-to-three'],
    },
    watch: {
      section: 'Your wedge chart',
      points: [
        L('Same tempo for every length – a slower or faster swing changes the distance more than the clock.', 'Gleiches Tempo bei jeder Länge – ein langsamerer oder schnellerer Schwung ändert die Länge mehr als die Uhr.'),
        L('Check your chart twice a year, and always carry it (GolfOS shows it on the round).', 'Prüfe deine Tabelle zweimal im Jahr und hab sie immer dabei (GolfOS zeigt sie auf der Runde).'),
      ],
    },
    drills: ['clock-matrix', 'wedge-ladder', 'nine-to-three', 'random-wedges', 'hundred-game'],
    videos: ['UeEkXxKSxzs', 'TjupRZpHYLs', 'm3UR4wtW3vk', '9qT9GmhL7KQ'],
  },
  {
    id: 'pitch-slope',
    name: L('Pitch from a slope', 'Pitch vom Hang'),
    short: L('Uphill it flies higher and shorter, downhill lower and longer.', 'Bergauf fliegt er höher und kürzer, bergab flacher und weiter.'),
    setup: {
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope', 'Schultern parallel zum Hang') },
        { k: 'weight', v: L('More on the lower foot – go with the slope', 'Mehr auf dem tieferen Fuß – mit dem Hang') },
        { k: 'ball', v: L('Uphill middle to forward, downhill back of centre', 'Bergauf Mitte bis vorn, bergab hinter der Mitte') },
        { k: 'club', v: L('Uphill one wedge less loft, downhill one more', 'Bergauf ein Wedge weniger Loft, bergab eines mehr') },
      ],
      sketch: S(4, 2.9, [
        pUp.item,
        fig(1.9, 'front', { club: 'wedge', stance: 'narrow', tilt: pUp.deg, y: pUp.at(1.9) }),
        ball(1.9, pUp.at(1.9)),
        co('leadShoulder', L('shoulders parallel to the slope', 'Schultern parallel zum Hang'), [3.1, 2.4]),
        co('trailAnkle', L('weight on the lower foot', 'Gewicht auf dem tieferen Fuß'), [0.7, 1.0]),
      ], L('Uphill, face-on, target to the right.', 'Bergauf, von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'Swing along the slope: uphill through up the hill, downhill the club stays low down the hill. A shorter swing keeps the balance – hold the finish until the ball lands.',
          'Am Hang entlang schwingen: bergauf durch den Hang hinauf, bergab bleibt der Schläger tief den Hang hinunter. Ein kürzerer Schwung hält das Gleichgewicht – das Finish halten, bis der Ball landet.',
        ),
      ],
      sketch: S(5, 3.0, [
        pUpMove.item,
        fig(1.4, 'halfBack', { tilt: pUpMove.deg, y: pUpMove.at(1.4) }),
        fig(3.6, 'halfThrough', { tilt: pUpMove.deg, y: pUpMove.at(3.6) }),
        co('pelvis', L('the body stays tilted with the slope', 'der Körper bleibt mit dem Hang geneigt'), [0.4, 0.9], 0),
        co('hands', L('through up the hill, hold the finish', 'durch den Hang hinauf, Finish halten'), [4.6, 2.85], 1),
      ]),
    },
    watch: {
      points: [
        L('Uphill: land it further, it stops quickly. Downhill: land it short, it runs out.', 'Bergauf: weiter landen, er bleibt schnell liegen. Bergab: kurz landen, er rollt aus.'),
        L('Practice swings first: where the club brushes the grass, the ball goes.', 'Erst Probeschwünge: Wo der Schläger das Gras streift, kommt der Ball hin.'),
      ],
      sketch: FIGURE_SKETCHES['brush-find'],
    },
    drills: ['slope-chips', 'slope-ball-position', 'brush-find', 'hold-finish-slope'],
    videos: ['kdKSkou7H-I', 'WxMeuv7p1wc'],
  },
  {
    id: 'pitch-rough',
    name: L('Pitch from the rough', 'Pitch aus dem Rough'),
    short: L('Grass between face and ball: steeper, firmer – and the ball does not stop.', 'Gras zwischen Fläche und Ball: steiler, fester – und der Ball bleibt nicht liegen.'),
    setup: {
      rows: [
        { k: 'lie', v: L('Read it first: does the ball sit up or down?', 'Erst lesen: Sitzt der Ball oben oder tief?') },
        { k: 'club', v: L('SW or LW – enough loft to get out of the grass', 'SW oder LW – genug Loft, um aus dem Gras zu kommen') },
        { k: 'ball', v: L('Middle', 'Mitte') },
        { k: 'grip', v: L('Firmer – the grass twists the club', 'Fester – das Gras verdreht den Schläger') },
        { k: 'face', v: L('A little open when it sits down', 'Leicht offen, wenn er tief sitzt') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        ...blades([1.6, 1.7, 1.78, 1.98, 2.06, 2.15], 0.14),
        fig(1.9, 'front', { club: 'wedge', stance: 'narrow', shift: 0.03 }),
        ball(1.9, 0.24),
        co('hands', L('firmer grip', 'fester greifen'), [3.1, 1.45]),
        co('clubHead', L('SW or LW, face a little open', 'SW oder LW, Fläche leicht offen'), [3.2, 0.65]),
      ], L('Face-on, target to the right: the ball in the rough.', 'Von vorn, Ziel rechts: der Ball im Rough.')),
    },
    move: {
      text: [
        L(
          'More wrist hinge on the way back for a steeper way down, then through the grass to a full finish. Do not slow down – the grass brakes the club.',
          'Beim Ausholen mehr Handgelenkwinkel für einen steileren Weg nach unten, dann durch das Gras ins volle Finish. Nicht abbremsen – das Gras bremst den Schläger.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'halfBack'),
        fig(3.6, 'halfThrough'),
        co('hands', L('more wrist hinge – steeper down', 'mehr Handgelenkwinkel – steiler nach unten'), [0.4, 2.3], 0),
        co('clubHead', L('through the grass to the finish', 'durch das Gras ins Finish'), [4.6, 2.3], 1),
      ]),
    },
    watch: {
      section: 'trouble/From the rough',
      points: [
        L('Sitting up: a flyer – little spin, it flies and rolls further. Take less club.', 'Sitzt er oben: ein Flyer – wenig Spin, er fliegt und rollt weiter. Weniger Schläger nehmen.'),
        L('Sitting down: it comes out shorter and rolls. Pick a landing spot short of the flag.', 'Sitzt er tief: Er kommt kürzer heraus und rollt. Den Landepunkt vor der Fahne wählen.'),
        L('Against the grain the grass grabs more – swing harder.', 'Gegen die Wuchsrichtung greift das Gras mehr – kräftiger schwingen.'),
      ],
    },
    drills: ['rough-reading', 'rough-chip', 'towel-behind'],
  },
];

// ---------- lob ----------

export const LOB_SHOTS: TopicShot[] = [
  {
    id: 'lob-shot',
    name: L('The lob', 'Der Lob'),
    short: L('High, soft, short roll – over a bunker to a close flag.', 'Hoch, weich, kurzes Rollen – über einen Bunker zur nahen Fahne.'),
    setup: {
      section: 'pitching/Lob and flop',
      rows: [
        { k: 'club', v: L('Lob wedge (58–60°)', 'Lobwedge (58–60°)') },
        { k: 'face', v: L('Open it first, then take your grip', 'Erst öffnen, dann greifen') },
        { k: 'stance', v: L('Wider and open, aimed left of the target', 'Breiter und offen, links vom Ziel ausgerichtet') },
        { k: 'ball', v: L('Forward, at the lead heel', 'Vorn, an der vorderen Ferse') },
        { k: 'weight', v: L('Centred – it stays there', 'Mittig – es bleibt dort') },
      ],
    },
    move: {
      text: [
        L(
          'A long, smooth swing along the line of your feet. The wrists hinge early, the sole (the bounce) slides under the ball – the hands do not lead as much as in a pitch. Commit: slowing down is the cause of most failed lobs.',
          'Ein langer, ruhiger Schwung entlang der Fußlinie. Die Handgelenke winkeln früh an, die Sohle (das Bounce) gleitet unter den Ball – die Hände führen weniger als beim Pitch. Entschlossen bleiben: Abbremsen ist der Grund für die meisten misslungenen Lobs.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'halfBack', { stance: 'wide' }),
        fig(3.6, 'frontFinish', { club: 'wedge' }),
        co('hands', L('early wrist hinge', 'früher Handgelenkwinkel'), [0.4, 2.3], 0),
        co('hands', L('a full, relaxed finish', 'ein volles, lockeres Finish'), [4.6, 2.5], 1),
      ]),
    },
    watch: {
      points: [
        L('Only from a good lie: grass under the ball. From hard or bare ground play a chip instead.', 'Nur aus guter Lage: Gras unter dem Ball. Von hartem oder kahlem Boden lieber chippen.'),
        L('The open face sends the ball right of where the face points – that is why you aim left.', 'Die offene Fläche schickt den Ball rechts von der Fußlinie – deshalb links ausrichten.'),
        L('Pick the lob only when there is little green; otherwise the lower shot is safer.', 'Den Lob nur wählen, wenn wenig Grün da ist; sonst ist der flachere Schlag sicherer.'),
      ],
      sketch: S(6, 2.6, [ground(6), ...landRoll(6, 0.6, 3.9, 4.6, 1.75, flat, [L('high and soft', 'hoch und weich'), L('stops', 'bleibt liegen')])], L('High flight, a short roll.', 'Hoher Flug, kurzes Rollen.')),
    },
    drills: ['flop-shot', 'elevator', 'pitch-towel-landing', 'bump-or-pitch'],
  },
  {
    id: 'flop-shot',
    name: L('The flop', 'Der Flop'),
    short: L('The extreme lob: straight up, almost no roll – a shot for good lies only.', 'Der extreme Lob: steil nach oben, fast kein Rollen – nur aus guter Lage.'),
    setup: {
      rows: [
        { k: 'face', v: L('Wide open – the face looks at the sky', 'Weit offen – die Fläche schaut zum Himmel') },
        { k: 'stance', v: L('Wide, well open, knees flexed – low over the ball', 'Breit, deutlich offen, Knie gebeugt – tief über dem Ball') },
        { k: 'ball', v: L('Forward, inside the lead foot', 'Vorn, innen am vorderen Fuß') },
        { k: 'club', v: L('Lob wedge, high bounce helps', 'Lobwedge, viel Bounce hilft') },
        { k: 'lie', v: L('The ball sits up on grass – never from a bare lie', 'Der Ball liegt oben auf dem Gras – nie von einer Kahlstelle') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { club: 'wedge', stance: 'wide', crouch: true }),
        ball(2.08),
        co('clubHead', L('face wide open', 'Fläche weit offen'), [3.1, 0.7]),
        co('leadKnee', L('wide stance, low', 'breiter Stand, tief'), [3.1, 1.25]),
        co('trailAnkle', L('ball forward', 'Ball vorn'), [0.7, 0.8]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'A long, fast swing for a short distance: the clubhead passes under the ball with speed, the face stays open to the finish – it never turns over.',
          'Ein langer, schneller Schwung für eine kurze Strecke: Der Schlägerkopf gleitet mit Tempo unter dem Ball durch, die Fläche bleibt bis ins Finish offen – sie dreht nie zu.',
        ),
      ],
      sketch: FIGURE_SKETCHES['sand-on-face'],
    },
    watch: {
      points: [
        L('Practise it before you play it – a half-hearted flop goes under the ball or skulls it.', 'Erst üben, dann spielen – ein halbherziger Flop geht unter dem Ball durch oder trifft ihn dünn.'),
        L('The face must still point to the sky after impact.', 'Die Fläche muss nach dem Treffmoment noch zum Himmel zeigen.'),
      ],
      sketch: S(6, 2.8, [ground(6), ...landRoll(6, 0.6, 3.3, 3.7, 2.0, flat, [L('straight up', 'steil nach oben'), L('hardly rolls', 'rollt kaum')])], L('The flop: up and down, almost no roll.', 'Der Flop: hoch und runter, fast kein Rollen.')),
    },
    drills: ['flop-shot', 'elevator', 'sand-on-face'],
    videos: ['Z_ehT2nsZSk', 'MU71wiLkjMM'],
  },
];

// ---------- spin ----------

export const SPIN_SHOTS: TopicShot[] = [
  {
    id: 'spin-low',
    name: L('More spin: the low spinner', 'Mehr Spin: der flache Spinner'),
    short: L('Flies low, bounces twice and stops – the shot with the most spin.', 'Fliegt flach, springt zweimal und bleibt stehen – der Schlag mit dem meisten Spin.'),
    setup: {
      section: 'pitching/Spin',
      rows: [
        { k: 'ball', v: L('Slightly back of centre', 'Leicht hinter der Mitte') },
        { k: 'weight', v: L('About 60 % forward', 'Etwa 60 % vorn') },
        { k: 'grip', v: L('Hands slightly ahead, a little shorter', 'Hände leicht vorn, etwas kürzer') },
        { k: 'club', v: L('SW or GW with clean grooves', 'SW oder GW mit sauberen Rillen') },
      ],
    },
    move: {
      text: [
        L(
          'A short backswing and an accelerating, low finish: the body turns through, the hands stay low and ahead. Clean contact – ball first – makes the spin.',
          'Kurz ausholen, beschleunigt und tief durchschwingen: Der Körper dreht durch, die Hände bleiben tief und vorn. Der saubere Kontakt – erst der Ball – macht den Spin.',
        ),
      ],
      sketch: S(5, 2.4, [
        ground(5),
        fig(1.4, 'impact', { club: 'wedge', shift: 0.05 }),
        ball(1.38),
        fig(3.6, 'chipFinish'),
        co('hands', L('hands ahead at impact', 'Hände im Treffmoment vorn'), [0.4, 1.5], 0),
        co('clubHead', L('a low, accelerating finish', 'ein tiefes, beschleunigtes Finish'), [4.6, 0.7], 1),
      ]),
    },
    watch: {
      points: [
        L('Spin needs a dry, clean lie: grass or water between face and ball takes it away.', 'Spin braucht eine trockene, saubere Lage: Gras oder Wasser zwischen Fläche und Ball nimmt ihn weg.'),
        L('Clean the grooves after every shot; a urethane (tour) ball spins clearly more.', 'Die Rillen nach jedem Schlag putzen; ein Urethan-Ball (Tour-Ball) spinnt deutlich mehr.'),
        L('Land it past where you would land a soft pitch – first bounce, second bounce, stop.', 'Weiter landen als den weichen Pitch – erster Hüpfer, zweiter Hüpfer, Stopp.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.5, 3.6, 4.4, 0.55, flat, [L('low', 'flach'), L('bounce, bounce, stop', 'hüpfen, hüpfen, Stopp')])], L('The low spinner checks after the second bounce.', 'Der flache Spinner bremst nach dem zweiten Hüpfer.')),
    },
    drills: ['low-spinner', 'towel-behind', 'tee-after-ball', 'wedge-ladder'],
    videos: ['6LSrGBjAJyY', 'x1SpqQE__Fg'],
  },
  {
    id: 'spin-less',
    name: L('Less spin: let it roll', 'Weniger Spin: rollen lassen'),
    short: L('When the ball should run to a back flag or the green falls away.', 'Wenn der Ball zur hinteren Fahne laufen soll oder das Grün abfällt.'),
    setup: {
      rows: [
        { k: 'club', v: L('Less loft – PW or 9-iron instead of SW', 'Weniger Loft – PW oder Eisen 9 statt SW') },
        { k: 'ball', v: L('Middle', 'Mitte') },
        { k: 'grip', v: L('Hands only slightly ahead, soft grip', 'Hände nur leicht vorn, weicher Griff') },
        { k: 'swing', v: L('A rounder, smoother stroke without force', 'Eine rundere, ruhigere Bewegung ohne Kraft') },
      ],
      sketch: S(4, 2.4, [
        ground(4),
        fig(1.9, 'chip', { club: 'iron' }),
        ball(1.88),
        co('clubHead', L('less loft – it rolls more', 'weniger Loft – er rollt mehr'), [3.1, 0.7]),
        co('hands', L('soft hands', 'weiche Hände'), [3.1, 1.4]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'A putting-like stroke with a soft, round finish: the club does not cut down into the ball, it swings through. Land it early and let it run – like a chip from further out.',
          'Eine puttartige Bewegung mit weichem, rundem Finish: Der Schläger hackt nicht in den Ball, er schwingt durch. Früh landen und laufen lassen – wie ein Chip von weiter weg.',
        ),
      ],
      sketch: FIGURE_SKETCHES['hold-finish-chip'],
    },
    watch: {
      points: [
        L('From the rough or a wet ball the spin goes anyway – plan the roll.', 'Aus dem Rough oder mit nassem Ball ist der Spin ohnehin weg – das Rollen einplanen.'),
        L('A rolling ball is easier to judge than a spinning one – when in doubt, roll it.', 'Ein rollender Ball ist leichter einzuschätzen als ein spinnender – im Zweifel rollen lassen.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.5, 1.9, 4.9, 0.5, flat, [L('short carry', 'kurzer Flug'), L('long roll', 'langes Rollen')])], L('Land early, roll long.', 'Früh landen, lang rollen.')),
    },
    drills: ['bump-or-pitch', 'three-clubs-one-spot', 'elevator'],
  },
  {
    id: 'spin-factors',
    name: L('What makes spin', 'Was Spin macht'),
    short: L('Strike, lie, grooves, ball and speed – what you control and what you do not.', 'Treffer, Lage, Rillen, Ball und Tempo – was du steuerst und was nicht.'),
    setup: {
      graphic: 'spinLoft',
      rows: [
        { k: 'swing', v: L('Ball first, speed through the ball – a slowing club spins less', 'Erst der Ball, Tempo durch den Ball – ein abbremsender Schläger spinnt weniger') },
        { k: 'lie', v: L('Dry and clean – grass or water between face and ball takes spin away', 'Trocken und sauber – Gras oder Wasser zwischen Fläche und Ball nimmt Spin weg') },
        { k: 'gear', v: L('Clean, sharp grooves and a urethane ball', 'Saubere, scharfe Rillen und ein Urethan-Ball') },
        { k: 'club', v: L('More loft spins more – up to the lob wedge', 'Mehr Loft spinnt mehr – bis zum Lobwedge') },
      ],
    },
    move: {
      text: [
        L(
          'Spin comes from the face sliding up the back of the ball. The difference between the loft at impact and the way the club comes down (spin loft) and a clean strike decide how much. That is why a steeper, clean strike with the hands ahead spins – and a scoop does not.',
          'Spin entsteht, weil die Fläche am Ball nach oben gleitet. Der Unterschied zwischen dem Loft im Treffmoment und dem Weg, auf dem der Schläger nach unten kommt (Spin-Loft), und ein sauberer Treffer entscheiden, wie viel. Deshalb spinnt ein sauberer Treffer mit den Händen vorn – ein Schaufeln nicht.',
        ),
      ],
      drillPic: 'towel-behind',
    },
    watch: {
      points: [
        L('Wedges wear out: after about 75 rounds the grooves spin noticeably less.', 'Wedges nutzen sich ab: Nach etwa 75 Runden spinnen die Rillen spürbar weniger.'),
        L('Soft greens hold the ball more than firm ones – the same shot stops differently.', 'Weiche Grüns halten den Ball mehr als harte – derselbe Schlag bleibt verschieden liegen.'),
        L('Into the wind spin increases, downwind it drops.', 'Gegen den Wind steigt der Spin, mit dem Wind sinkt er.'),
      ],
      graphic: 'bounceOpen',
    },
    drills: ['low-spinner', 'towel-behind', 'tee-after-ball'],
  },
];

// ---------- bunker ----------

const bUp = hill(6, 0.2, 1.0, true);

export const BUNKER_SHOTS: TopicShot[] = [
  {
    id: 'bunker-standard',
    name: L('The greenside bunker shot', 'Der Standard-Bunkerschlag'),
    short: L('Out of the greenside bunker: the club hits the sand, the sand carries the ball.', 'Aus dem Grünbunker: Der Schläger trifft den Sand, der Sand trägt den Ball.'),
    setup: {
      rows: [
        { k: 'stance', v: L('Open, feet dug in a little, wider than a chip', 'Offen, Füße leicht eingegraben, breiter als beim Chip') },
        { k: 'ball', v: L('Forward of centre, at the lead heel', 'Vor der Mitte, an der vorderen Ferse') },
        { k: 'face', v: L('Square or open – it does not have to be open. If you open it: first open, then grip', 'Square oder offen – sie muss nicht zwingend offen sein. Wenn offen: erst öffnen, dann greifen') },
        { k: 'weight', v: L('About 70 % on the lead foot – through the whole swing; after impact even more', 'Etwa 70 % auf dem vorderen Fuß – während des ganzen Schwungs; nach dem Treffen noch mehr') },
        { k: 'entry', v: L('3–5 cm behind the ball', '3–5 cm hinter dem Ball') },
      ],
      sketch: S(4, 2.6, [
        ground(4, true),
        fig(1.9, 'front', { club: 'wedge', stance: 'wide', shift: 0.04 }),
        ball(2.06),
        co('trailAnkle', L('feet dug in, stance open', 'Füße eingegraben, Stand offen'), [0.7, 0.8]),
        co('clubHead', L('ball forward', 'Ball vorn'), [3.2, 0.7]),
        co('pelvis', L('70 % forward – the whole swing', '70 % vorn – den ganzen Schwung'), [3.2, 1.5]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      section: 'The swing',
      text: [
        L(
          'A full, unhurried swing along the line of your feet. The weight stays about 70 % on the lead foot the whole time and moves even further forward after impact. The club enters the sand behind the ball and slides under it – the ball is never touched. Swing through to a full finish; the sand needs speed.',
          'Ein voller, ruhiger Schwung entlang der Fußlinie. Das Gewicht bleibt die ganze Zeit etwa 70 % vorn und geht nach dem Treffen noch weiter nach vorn. Der Schläger geht hinter dem Ball in den Sand und gleitet darunter durch – der Ball wird nie berührt. Bis ins volle Finish schwingen; der Sand braucht Tempo.',
        ),
      ],
    },
    watch: {
      section: 'Set-up in the greenside bunker',
      points: [
        L('Do not touch the sand before the stroke (Rule 12.2) – no practice swing in the bunker.', 'Den Sand vor dem Schlag nicht berühren (Regel 12.2) – kein Probeschwung im Bunker.'),
        L('About twice the swing of a pitch of the same length – the sand takes the speed.', 'Etwa doppelt so viel Schwung wie ein Pitch gleicher Länge – der Sand nimmt Tempo weg.'),
        L('Look at a spot in the sand behind the ball, not at the ball.', 'Auf einen Punkt im Sand hinter dem Ball schauen, nicht auf den Ball.'),
      ],
    },
    drills: ['line-in-sand', 'splash-no-ball', 'dollar-bill', 'one-foot-bunker', 'bunker-circle', 'bunker-ladder'],
    videos: ['lRV0WYmwYMQ', 'inT-f1UJOuU', 'zPSsqtnvc08', 'RCfgvdz491Y'],
  },
  {
    id: 'bunker-fairway',
    name: L('The fairway bunker', 'Der Fairwaybunker'),
    short: L('A long shot from the sand: ball first – the opposite of the greenside bunker.', 'Ein langer Schlag aus dem Sand: erst der Ball – das Gegenteil vom Grünbunker.'),
    setup: {
      section: 'Fairway bunker',
      rows: [
        { k: 'club', v: L('One club more – and enough loft for the lip', 'Ein Schläger mehr – und genug Loft für die Kante') },
        { k: 'ball', v: L('Middle, a touch back', 'Mitte, eine Spur zurück') },
        { k: 'stance', v: L('Feet only slightly dug in, quiet legs', 'Füße nur leicht eingegraben, ruhige Beine') },
        { k: 'grip', v: L('2 cm down the grip – you stand lower', '2 cm kürzer greifen – du stehst tiefer') },
      ],
    },
    move: {
      text: [
        L(
          'A three-quarter swing with quiet legs and the upper body turning. Pick the ball clean: ball first, then a little sand. Stay at your height through the ball.',
          'Ein Dreiviertelschwung mit ruhigen Beinen, der Oberkörper dreht. Den Ball sauber nehmen: erst der Ball, dann etwas Sand. Durch den Ball auf der Höhe bleiben.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5, true),
        fig(1.4, 'halfBack', { club: 'iron' }),
        fig(3.6, 'halfThrough', { club: 'iron' }),
        co('leadKnee', L('quiet legs', 'ruhige Beine'), [0.4, 0.9], 0),
        co('clubHead', L('ball first, then a little sand', 'erst der Ball, dann etwas Sand'), [4.6, 2.3], 1),
      ]),
    },
    watch: {
      points: [
        L('Check the lip first: will the loft get over it? If not, take more loft – out is the priority.', 'Erst die Kante prüfen: Kommt der Loft darüber? Wenn nicht, mehr Loft nehmen – raus hat Vorrang.'),
        L('A fat shot here is the big miss – the ball goes nowhere. Better a little thin.', 'Ein fetter Schlag ist hier der große Fehler – der Ball geht nirgends hin. Lieber etwas dünn.'),
      ],
      sketch: S(6, 2.4, [
        ground(6, true),
        line([1.6, 0.2], [1.9, 0.62]), line([1.9, 0.62], [2.2, 0.62]),
        ball(0.6),
        flight([[0.62, 0.26], [2.6, 1.8], [5.6, 0.4]]),
        txt([3.4, 1.95], L('enough loft for the lip', 'genug Loft für die Kante'), 11),
      ], L('The lip decides the club.', 'Die Kante bestimmt den Schläger.')),
    },
    drills: ['fairway-bunker', 'tee-in-sand', 'towel-behind'],
  },
  {
    id: 'bunker-plugged',
    name: L('Plugged ball (fried egg)', 'Eingebohrter Ball (Spiegelei)'),
    short: L('The ball sits buried in the sand: dig it out – it comes out low and rolls.', 'Der Ball steckt im Sand: ausgraben – er kommt flach und rollt.'),
    setup: {
      sketch: FIGURE_SKETCHES['fried-egg'],
      rows: [
        { k: 'face', v: L('Square or a little closed – the edge must dig', 'Square oder leicht geschlossen – die Kante muss graben') },
        { k: 'ball', v: L('Middle', 'Mitte') },
        { k: 'weight', v: L('Clearly forward', 'Deutlich vorn') },
        { k: 'entry', v: L('Just behind the ball, steep', 'Knapp hinter dem Ball, steil') },
      ],
    },
    move: {
      text: [
        L(
          'Steep up, steep down: the wrists hinge quickly, the club drives down just behind the ball and stays in the sand – hardly any finish. Hit hard; the sand around the ball has to come out with it.',
          'Steil hoch, steil runter: Die Handgelenke winkeln schnell an, der Schläger fährt knapp hinter dem Ball nach unten und bleibt im Sand – kaum ein Finish. Kräftig schlagen; der Sand um den Ball muss mit heraus.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5, true),
        fig(1.4, 'halfBack', { shift: 0.04 }),
        fig(3.6, 'impact', { club: 'wedge', shift: 0.05 }),
        { k: 'ball', at: [3.62, 0.15] },
        co('hands', L('steep up', 'steil hoch'), [0.4, 2.3], 0),
        co('clubHead', L('steep down – stays in the sand', 'steil runter – bleibt im Sand'), [4.7, 0.7], 1),
      ]),
    },
    watch: {
      points: [
        L('No spin: the ball comes out low and runs a long way – aim short of the flag.', 'Kein Spin: Der Ball kommt flach und rollt weit – vor der Fahne zielen.'),
        L('Do not open the face: an open face bounces off the sand above the ball.', 'Die Fläche nicht öffnen: Eine offene Fläche springt über dem Ball vom Sand ab.'),
      ],
      sketch: S(6, 2.0, [ground(6, true), ...landRoll(6, 0.6, 2.0, 4.8, 0.55, flat, [L('low', 'flach'), L('rolls a lot', 'rollt viel')])], L('Out low, long roll.', 'Flach heraus, langes Rollen.')),
    },
    drills: ['fried-egg', 'line-in-sand'],
  },
  {
    id: 'bunker-slope',
    name: L('Uphill and downhill in the bunker', 'Bergauf und bergab im Bunker'),
    short: L('The slope changes the loft: uphill high and short, downhill low and long.', 'Der Hang verändert den Loft: bergauf hoch und kurz, bergab flach und weit.'),
    setup: {
      sketch: FIGURE_SKETCHES['bunker-slopes'],
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope', 'Schultern parallel zum Hang') },
        { k: 'weight', v: L('Always on the lead foot – in the bunker uphill and downhill too', 'Immer auf dem vorderen Fuß – im Bunker auch bergauf und bergab') },
        { k: 'ball', v: L('Uphill middle, downhill back of centre', 'Bergauf Mitte, bergab hinter der Mitte') },
        { k: 'face', v: L('Uphill less open, downhill more open', 'Bergauf weniger offen, bergab weiter offen') },
      ],
    },
    move: {
      text: [
        L(
          'Swing along the slope. Uphill: swing harder – the slope adds loft and the ball flies high and short. Downhill: the club follows the slope down after the ball, the ball comes out low.',
          'Am Hang entlang schwingen. Bergauf: kräftiger – der Hang gibt Loft dazu, der Ball fliegt hoch und kurz. Bergab: Der Schläger folgt nach dem Ball dem Hang nach unten, der Ball kommt flach.',
        ),
      ],
      sketch: S(6, 3.2, [
        bUp.item,
        fig(2.0, 'halfThrough', { tilt: bUp.deg, y: bUp.at(2.0) }),
        co('hands', L('uphill: up the slope to the finish', 'bergauf: den Hang hinauf ins Finish'), [4.0, 2.9]),
      ]),
    },
    watch: {
      points: [
        L('Downhill is the hardest bunker shot – aim for the middle of the green, not the flag.', 'Bergab ist der schwerste Bunkerschlag – auf die Grünmitte zielen, nicht auf die Fahne.'),
        L('Uphill the club can stick in the slope – keep swinging through.', 'Bergauf kann der Schläger im Hang stecken bleiben – weiter durchschwingen.'),
      ],
      sketch: S(6, 2.8, [bUp.item, ...landRoll(6, 1.0, 3.0, 3.5, 1.1, bUp.at, [L('high, short', 'hoch, kurz'), L('little roll', 'wenig Rollen')])], L('Uphill in the sand.', 'Bergauf im Sand.')),
    },
    drills: ['bunker-slopes', 'line-in-sand'],
    videos: ['7B9q27fQImA'],
  },
  {
    id: 'bunker-bounce',
    name: L('What the bounce does', 'Was das Bounce macht'),
    short: L('The rounded sole of the wedge – it glides through sand instead of digging.', 'Die gerundete Sohle des Wedges – sie gleitet durch den Sand, statt zu graben.'),
    setup: {
      graphic: 'bounce',
      rows: [
        { k: 'club', v: L('The bounce is the angle between leading edge and the lowest point of the sole', 'Das Bounce ist der Winkel zwischen Vorderkante und tiefstem Punkt der Sohle') },
        { k: 'lie', v: L('Soft sand, thick grass: much bounce (12°+). Hard ground, firm sand: little (4–8°)', 'Weicher Sand, dichtes Gras: viel Bounce (12°+). Harter Boden, fester Sand: wenig (4–8°)') },
        { k: 'face', v: L('Opening the face adds bounce', 'Die Fläche öffnen gibt mehr Bounce') },
      ],
    },
    move: {
      text: [
        L(
          'Use the bounce: let the sole hit the sand first, not the leading edge. With an open face and the hands not too far ahead the sole slaps the sand and skids under the ball – the soft “thump”. A leading edge that digs stops in the sand.',
          'Das Bounce nutzen: Die Sohle trifft zuerst den Sand, nicht die Vorderkante. Mit offener Fläche und Händen nicht zu weit vorn klatscht die Sohle in den Sand und rutscht unter dem Ball durch – das weiche „Plopp“. Eine grabende Vorderkante bleibt im Sand stecken.',
        ),
      ],
      sketch: FIGURE_SKETCHES['splash-no-ball'],
    },
    watch: {
      graphic: 'bounceOpen',
      points: [
        L('Know the bounce of your wedges (it is on the head, e.g. 56·12). One high-bounce wedge for the sand helps most players.', 'Kenne das Bounce deiner Wedges (es steht auf dem Kopf, z. B. 56·12). Ein Wedge mit viel Bounce für den Sand hilft den meisten Spielern.'),
        L('From hard ground and bare lies the bounce bounces – there take a club with little bounce or less loft.', 'Von hartem Boden und Kahlstellen springt das Bounce – dort einen Schläger mit wenig Bounce oder weniger Loft nehmen.'),
      ],
    },
    drills: ['splash-no-ball', 'dollar-bill', 'sand-on-face'],
  },
  {
    id: 'bunker-sand',
    name: L('Kinds of sand', 'Sandarten'),
    short: L('Soft, firm, wet or coarse: the same swing, a different entry and face.', 'Weich, fest, nass oder grob: derselbe Schwung, anderer Eintritt und andere Fläche.'),
    setup: {
      graphic: 'sand',
      rows: [
        { k: 'lie', v: L('Test the sand with your feet when you step in – that is allowed', 'Den Sand beim Hineingehen mit den Füßen prüfen – das ist erlaubt') },
        { k: 'face', v: L('Soft sand: more open. Firm or wet sand: barely open', 'Weicher Sand: weiter offen. Fester oder nasser Sand: kaum offen') },
        { k: 'entry', v: L('Soft: 4–5 cm behind the ball. Firm: 2–3 cm', 'Weich: 4–5 cm hinter dem Ball. Fest: 2–3 cm') },
        { k: 'club', v: L('Soft: much bounce. Firm: little bounce or a GW/PW', 'Weich: viel Bounce. Fest: wenig Bounce oder GW/PW') },
      ],
    },
    move: {
      graphic: 'sandEntry',
      text: [
        L(
          'The motion stays the same – only where the club enters and how much speed it needs change. Soft sand slows the club: more speed, enter earlier. Firm or wet sand lets the club bounce: enter closer to the ball, a little less speed.',
          'Die Bewegung bleibt gleich – nur der Eintrittspunkt und das nötige Tempo ändern sich. Weicher Sand bremst den Schläger: mehr Tempo, früher eintreten. Fester oder nasser Sand lässt den Schläger springen: näher am Ball eintreten, etwas weniger Tempo.',
        ),
      ],
    },
    watch: {
      points: [
        L('Wet sand and firm sand: the ball comes out faster and rolls further – land it shorter.', 'Nasser und fester Sand: Der Ball kommt schneller und rollt weiter – kürzer landen.'),
        L('Soft, fluffy sand: the ball plugs more easily – and comes out shorter.', 'Weicher, lockerer Sand: Der Ball bohrt sich leichter ein – und kommt kürzer heraus.'),
        L('Very little sand over hard ground: chip or putt it if the lip is low.', 'Sehr wenig Sand über hartem Boden: chippen oder putten, wenn die Kante flach ist.'),
      ],
      sketch: S(6, 2.0, [ground(6, true), ...landRoll(6, 0.6, 2.4, 4.8, 0.7, flat, [L('firm/wet: lower', 'fest/nass: flacher'), L('rolls further', 'rollt weiter')])], L('From firm or wet sand the ball runs.', 'Aus festem oder nassem Sand läuft der Ball.')),
    },
    drills: ['line-in-sand', 'dollar-bill', 'bunker-ladder'],
  },
];

// ---------- slopes (full shots) ----------

const sUp = hill(6, 0.2, 1.2);
const sDown = hill(6, 1.2, 0.2);

export const SLOPE_SHOTS: TopicShot[] = [
  {
    id: 'slope-uphill',
    name: L('Uphill lie', 'Bergauflage'),
    short: L('The lead foot higher: the ball flies higher and shorter, often left.', 'Der vordere Fuß höher: Der Ball fliegt höher und kürzer, oft nach links.'),
    setup: {
      section: 'Uphill lie',
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope', 'Schultern parallel zum Hang') },
        { k: 'weight', v: L('More on the lower trail foot – and at impact it stays rather on the trail leg', 'Mehr auf dem tieferen hinteren Fuß – und im Treffpunkt bleibt es eher auf dem hinteren Bein') },
        { k: 'ball', v: L('A little forward of normal', 'Etwas weiter vorn als sonst') },
        { k: 'club', v: L('One or two clubs more – the slope adds loft', 'Ein bis zwei Schläger mehr – der Hang gibt Loft dazu') },
        { k: 'aim', v: L('A little right – the ball tends to go left', 'Etwas rechts – der Ball neigt nach links') },
      ],
    },
    move: {
      text: [
        L(
          'Swing along the slope and up it. At impact the weight stays rather on the trail leg – do not push it forward into the hill; the arms swing more, the body less. A three-quarter swing and a held finish keep the balance.',
          'Am Hang entlang und den Hang hinauf schwingen. Im Treffpunkt bleibt das Gewicht eher auf dem hinteren Bein – nicht nach vorn in den Hang schieben; die Arme schwingen mehr, der Körper weniger. Ein Dreiviertelschwung und ein gehaltenes Finish halten das Gleichgewicht.',
        ),
      ],
      sketch: FIGURE_SKETCHES['slope-ball-position'],
    },
    watch: {
      points: [
        L('Practice swing first: where the club brushes the grass, place the ball.', 'Erst Probeschwung: Wo der Schläger das Gras streift, liegt der Ball richtig.'),
        L('Fat shots come from leaning into the hill – stay with the slope.', 'Fette Schläge kommen vom Lehnen in den Hang – mit dem Hang bleiben.'),
      ],
      sketch: S(6, 2.6, [sUp.item, ...landRoll(6, 0.6, 4.0, 4.6, 1.6, sUp.at, [L('higher, shorter', 'höher, kürzer'), L('stops quickly', 'bleibt schnell liegen')])], L('Uphill: more club.', 'Bergauf: mehr Schläger.')),
    },
    drills: ['slope-ball-position', 'brush-find', 'four-lies-circuit', 'slope-club-choice'],
    videos: ['wIdKL7v7hmk', 'ptGKpaVW_mY', 'Ufp6j_vIIpk'],
  },
  {
    id: 'slope-downhill',
    name: L('Downhill lie', 'Bergablage'),
    short: L('The lead foot lower: the ball flies lower and longer, often right.', 'Der vordere Fuß tiefer: Der Ball fliegt flacher und weiter, oft nach rechts.'),
    setup: {
      section: 'Downhill lie',
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope', 'Schultern parallel zum Hang') },
        { k: 'weight', v: L('More on the lower lead foot', 'Mehr auf dem tieferen vorderen Fuß') },
        { k: 'ball', v: L('Back of normal – nearer the higher foot', 'Weiter hinten als sonst – näher am höheren Fuß') },
        { k: 'club', v: L('One club less – the slope takes loft away', 'Ein Schläger weniger – der Hang nimmt Loft weg') },
        { k: 'aim', v: L('A little left – the ball tends to go right', 'Etwas links – der Ball neigt nach rechts') },
      ],
    },
    move: {
      text: [
        L(
          'Swing down the slope: the club stays low after the ball and chases it down the hill. Stay tilted with the slope until the finish – standing up tops the ball.',
          'Den Hang hinunter schwingen: Der Schläger bleibt nach dem Ball tief und folgt ihm hangabwärts. Bis ins Finish mit dem Hang geneigt bleiben – Aufrichten toppt den Ball.',
        ),
      ],
      sketch: FIGURE_SKETCHES['hold-finish-slope'],
    },
    watch: {
      points: [
        L('The hardest of the four lies – take a club with enough loft and do not force height.', 'Die schwerste der vier Lagen – einen Schläger mit genug Loft nehmen und keine Höhe erzwingen.'),
        L('The ball runs after landing – play for it.', 'Der Ball rollt nach der Landung weiter – das einplanen.'),
      ],
      sketch: S(6, 2.6, [sDown.item, ...landRoll(6, 0.6, 3.0, 5.0, 0.8, sDown.at, [L('lower', 'flacher'), L('runs on', 'rollt weiter')])], L('Downhill: less club, it runs.', 'Bergab: weniger Schläger, er läuft.')),
    },
    drills: ['hold-finish-slope', 'brush-find', 'four-lies-circuit', 'slope-club-choice'],
    videos: ['Q0XXzbpj0mc', 'ptGKpaVW_mY', 'Ufp6j_vIIpk'],
  },
  {
    id: 'slope-above',
    name: L('Ball above the feet', 'Ball über den Füßen'),
    short: L('The ball closer to the hands: a flatter swing – it goes left.', 'Der Ball näher an den Händen: ein flacherer Schwung – er geht nach links.'),
    setup: {
      section: 'Ball above the feet',
      rows: [
        { k: 'grip', v: L('2–4 cm down the grip', '2–4 cm kürzer greifen') },
        { k: 'stance', v: L('More upright, the weight balanced over the whole foot', 'Aufrechter, das Gewicht ausbalanciert über den ganzen Fuß') },
        { k: 'aim', v: L('Right of the target', 'Rechts vom Ziel') },
        { k: 'club', v: L('Often one club more because of the shorter grip', 'Wegen des kürzeren Griffs oft ein Schläger mehr') },
      ],
    },
    move: {
      text: [
        L(
          'The swing gets flatter, more around the body – let it. A three-quarter swing with quiet legs keeps you from falling back.',
          'Der Schwung wird flacher, mehr um den Körper – lass das zu. Ein Dreiviertelschwung mit ruhigen Beinen verhindert, dass du nach hinten fällst.',
        ),
      ],
      sketch: S(5, 2.8, [
        hill(5, 0.0, 0.55).item,
        fig(1.6, 'top', { y: hill(5, 0.0, 0.55).at(1.5) }),
        co('hands', L('a flatter swing around the body', 'ein flacherer Schwung um den Körper'), [3.2, 2.4]),
        co('pelvis', L('quiet legs', 'ruhige Beine'), [3.2, 1.1]),
      ], L('From the side: the ground rises to the ball.', 'Von der Seite: Der Boden steigt zum Ball an.')),
    },
    watch: {
      points: [
        L('The steeper the slope and the more loft, the more the ball goes left.', 'Je steiler der Hang und je mehr Loft, desto mehr geht der Ball nach links.'),
        L('Fat shots: you stood too close – grip down instead.', 'Fette Schläge: zu nah gestanden – stattdessen kürzer greifen.'),
      ],
      sketch: aimCurve(1, L('From above: aim right, the ball comes back left.', 'Von oben: rechts zielen, der Ball kommt nach links zurück.')),
    },
    drills: ['aim-for-slope', 'four-lies-circuit', 'slope-home-balance'],
    videos: ['2jkum70WgLc', 'Ma3CVK5QNNw', 'vWZvqBnDkEE'],
  },
  {
    id: 'slope-below',
    name: L('Ball below the feet', 'Ball unter den Füßen'),
    short: L('The ball further away: stay down – it goes right.', 'Der Ball weiter weg: unten bleiben – er geht nach rechts.'),
    setup: {
      section: 'Ball below the feet',
      rows: [
        { k: 'stance', v: L('Wider, more knee flex – and hold the knee angle through impact', 'Breiter, mehr Kniebeuge – und den Kniewinkel bis in den Treffpunkt halten') },
        { k: 'weight', v: L('Towards the heels', 'Richtung Fersen') },
        { k: 'grip', v: L('Full length of the grip', 'Volle Länge greifen') },
        { k: 'aim', v: L('Left of the target', 'Links vom Ziel') },
      ],
    },
    move: {
      text: [
        L(
          'A steeper, shorter swing with the arms. Hold the knee angle at impact – the legs stay flexed until the ball is gone. Coming up out of the shot is the typical miss: thin and right.',
          'Ein steilerer, kürzerer Schwung mit den Armen. Im Treffpunkt den Kniewinkel halten – die Beine bleiben gebeugt, bis der Ball weg ist. Aus dem Schlag hochzukommen ist der typische Fehler: dünn und rechts.',
        ),
      ],
      sketch: FIGURE_SKETCHES['below-feet-stay'],
    },
    watch: {
      points: [
        L('Take one club more – the shorter swing loses length.', 'Einen Schläger mehr nehmen – der kürzere Schwung kostet Länge.'),
        L('Hold the finish: if you fall towards the ball, you were on your toes.', 'Das Finish halten: Fällst du zum Ball, warst du auf den Zehen.'),
      ],
      sketch: aimCurve(-1, L('From above: aim left, the ball comes back right.', 'Von oben: links zielen, der Ball kommt nach rechts zurück.')),
    },
    drills: ['below-feet-stay', 'four-lies-circuit', 'slope-home-balance'],
    videos: ['Ma3CVK5QNNw', 'vWZvqBnDkEE', 'Ufp6j_vIIpk'],
  },
];

// ---------- trouble ----------

export const TROUBLE_SHOTS: TopicShot[] = [
  {
    id: 'trouble-punch',
    name: L('The punch under trees', 'Der Punch unter Bäumen'),
    short: L('Low under the branches back to the fairway.', 'Flach unter den Ästen zurück aufs Fairway.'),
    setup: {
      section: 'The punch shot under trees',
      rows: [
        { k: 'ball', v: L('Back, near the trail foot', 'Hinten, nahe am hinteren Fuß') },
        { k: 'weight', v: L('About 60–70 % forward', 'Etwa 60–70 % vorn') },
        { k: 'grip', v: L('Hands clearly ahead, grip down', 'Hände deutlich vorn, kürzer greifen') },
        { k: 'club', v: L('A 5- to 7-iron – the loft at impact decides the height', 'Eisen 5 bis 7 – der Loft im Treffmoment bestimmt die Höhe') },
      ],
    },
    move: {
      sketch: FIGURE_SKETCHES['punch-gap'],
      text: [
        L(
          'A short backswing, the hands lead through the ball and finish low at hip height. The wrists stay firm – no release, so the loft stays off.',
          'Kurz ausholen, die Hände führen durch den Ball und enden tief auf Hüfthöhe. Die Handgelenke bleiben fest – kein Release, damit der Loft weg bleibt.',
        ),
      ],
    },
    watch: {
      points: [
        L('First pick the gap and where the ball must land – then the club whose height fits.', 'Erst die Lücke und den Landepunkt wählen – dann den Schläger, dessen Höhe passt.'),
        L('Back to the fairway beats the hero shot: one stroke lost, not three.', 'Zurück aufs Fairway schlägt den Heldenschlag: ein Schlag verloren, nicht drei.'),
      ],
      sketch: S(6, 2.4, [
        ground(6),
        line([2.6, 1.6], [6, 1.6]),
        txt([5.8, 1.75], L('branches', 'Äste'), 10, 'end'),
        ...landRoll(6, 0.5, 3.6, 5.2, 0.55, flat, [L('under the branches', 'unter den Ästen'), L('runs a long way', 'rollt weit')]),
      ], L('Low flight, long roll.', 'Flacher Flug, langes Rollen.')),
    },
    drills: ['punch-gap', 'knockdown-wind', 'escape-decision'],
    videos: ['MvU5yDXHLJw', '2pzn4RuGGy8', 'JzbPT93PoXE'],
  },
  {
    id: 'trouble-rough',
    name: L('From the rough', 'Aus dem Rough'),
    short: L('Read the lie first: sitting up – a flyer; sitting down – get it out.', 'Erst die Lage lesen: oben – ein Flyer; tief – erst mal raus.'),
    setup: {
      rows: [
        { k: 'lie', v: L('Sitting up: like the fairway, one club less. Sitting down: more loft', 'Sitzt oben: wie vom Fairway, ein Schläger weniger. Sitzt tief: mehr Loft') },
        { k: 'ball', v: L('Middle, a touch back when it sits down', 'Mitte, eine Spur zurück, wenn er tief sitzt') },
        { k: 'grip', v: L('Firmer – the grass twists the hosel', 'Fester – das Gras verdreht den Schläger') },
        { k: 'club', v: L('Deep grass: a hybrid or a short iron, never a long iron', 'Tiefes Gras: Hybrid oder kurzes Eisen, nie ein langes Eisen') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        ...blades([1.55, 1.66, 1.74, 1.98, 2.08, 2.16, 2.26], 0.16),
        fig(1.9, 'front', { club: 'iron', shift: 0.03 }),
        ball(1.9, 0.24),
        co('hands', L('firmer grip', 'fester greifen'), [3.1, 1.45]),
        co('clubHead', L('steeper into the ball – less grass between', 'steiler in den Ball – weniger Gras dazwischen'), [3.2, 0.62]),
      ], L('Face-on, target to the right: the ball sits down in the rough.', 'Von vorn, Ziel rechts: Der Ball sitzt tief im Rough.')),
    },
    move: {
      text: [
        L(
          'A steeper swing with more wrist hinge so that less grass comes between face and ball. Swing through hard – the grass slows the club and closes the face.',
          'Ein steilerer Schwung mit mehr Handgelenkwinkel, damit weniger Gras zwischen Fläche und Ball kommt. Kräftig durchschwingen – das Gras bremst den Schläger und schließt die Fläche.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        ...blades([1.2, 1.3, 1.5, 1.6], 0.16),
        fig(1.4, 'halfBack', { club: 'iron' }),
        fig(3.6, 'halfThrough', { club: 'iron' }),
        co('hands', L('more wrist hinge – steeper down', 'mehr Handgelenkwinkel – steiler nach unten'), [0.4, 2.3], 0),
        co('clubHead', L('swing through hard', 'kräftig durchschwingen'), [4.6, 2.3], 1),
      ]),
    },
    watch: {
      section: 'From the rough',
      points: [
        L('A flyer goes further and does not stop – plan the roll.', 'Ein Flyer fliegt weiter und bleibt nicht liegen – das Rollen einplanen.'),
        L('The grass closes the face – the ball tends to go left.', 'Das Gras schließt die Fläche – der Ball neigt nach links.'),
        L('When it sits down deep: the fairway first, the green later.', 'Sitzt er tief: erst das Fairway, dann das Grün.'),
      ],
    },
    drills: ['rough-reading', 'hybrid-rough', 'rough-chip'],
  },
  {
    id: 'trouble-divot',
    name: L('Ball in a divot', 'Ball im Divot'),
    short: L('The ball sits in an old divot: steeper, ball back – it comes out lower.', 'Der Ball liegt in einem alten Divot: steiler, Ball zurück – er kommt flacher.'),
    setup: {
      sketch: FIGURE_SKETCHES['divot-lie'],
      rows: [
        { k: 'ball', v: L('A ball back of normal', 'Eine Ballbreite weiter hinten als sonst') },
        { k: 'weight', v: L('Forward', 'Vorn') },
        { k: 'grip', v: L('Hands ahead', 'Hände vorn') },
        { k: 'club', v: L('One club less – it flies lower and rolls', 'Ein Schläger weniger – er fliegt flacher und rollt') },
      ],
    },
    move: {
      text: [
        L(
          'Steeper down into the ball, ball first, then the bottom of the divot. A shorter, firm finish – the club must not stop in the divot.',
          'Steiler nach unten in den Ball, erst der Ball, dann der Boden des Divots. Ein kürzeres, festes Finish – der Schläger darf im Divot nicht stecken bleiben.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'halfBack', { club: 'iron', shift: 0.04 }),
        fig(3.6, 'impact', { club: 'iron', shift: 0.06 }),
        co('hands', L('a steeper way down', 'ein steilerer Weg nach unten'), [0.4, 2.3], 0),
        co('pelvis', L('weight forward through the ball', 'Gewicht vorn durch den Ball'), [4.7, 1.6], 1),
      ]),
    },
    watch: {
      points: [
        L('The ball comes out lower with less spin – land it shorter.', 'Der Ball kommt flacher mit weniger Spin – kürzer landen.'),
        L('A sand-filled divot: hit it like a fairway bunker – ball first.', 'Ein mit Sand gefülltes Divot: wie aus dem Fairwaybunker – erst der Ball.'),
      ],
      section: 'Divots, bare ground, wet grass',
    },
    drills: ['divot-lie', 'towel-behind', 'tee-after-ball'],
  },
  {
    id: 'trouble-bare-wet',
    name: L('Bare ground and wet grass', 'Kahler Boden und nasses Gras'),
    short: L('Hard, bare or wet: ball first – the club must not bounce or skid.', 'Hart, kahl oder nass: erst der Ball – der Schläger darf nicht springen oder rutschen.'),
    setup: {
      sketch: FIGURE_SKETCHES['bare-lie'],
      rows: [
        { k: 'ball', v: L('A little back of normal', 'Etwas weiter hinten als sonst') },
        { k: 'grip', v: L('Hands ahead', 'Hände vorn') },
        { k: 'club', v: L('Less bounce: from bare ground no lob wedge', 'Wenig Bounce: von kahlem Boden kein Lobwedge') },
        { k: 'lie', v: L('Wet grass: water between face and ball – no spin, a flyer', 'Nasses Gras: Wasser zwischen Fläche und Ball – kein Spin, ein Flyer') },
      ],
    },
    move: {
      text: [
        L(
          'A quiet, compact swing, ball first. On bare ground the club must not hit the ground before the ball – it bounces into the ball. On wet grass a clean strike matters even more.',
          'Ein ruhiger, kompakter Schwung, erst der Ball. Auf kahlem Boden darf der Schläger nicht vor dem Ball aufkommen – er springt in den Ball. Auf nassem Gras zählt der saubere Treffer noch mehr.',
        ),
      ],
      sketch: S(5, 2.6, [
        ground(5),
        fig(1.4, 'impact', { club: 'iron', shift: 0.05 }),
        ball(1.36),
        fig(3.6, 'halfThrough', { club: 'iron' }),
        co('hands', L('hands ahead at impact', 'Hände vorn im Treffmoment'), [0.4, 1.5], 0),
        co('clubHead', L('compact finish', 'kompaktes Finish'), [4.6, 2.3], 1),
      ]),
    },
    watch: {
      sketch: S(6, 2.2, [ground(6), ...landRoll(6, 0.5, 4.0, 5.3, 0.95, flat, [L('wet: a flyer, further', 'nass: ein Flyer, weiter'), L('hardly stops', 'bremst kaum')])], L('From wet grass: further, less spin.', 'Aus nassem Gras: weiter, weniger Spin.')),
      points: [
        L('From wet grass the ball flies further and stops less – take one club less.', 'Aus nassem Gras fliegt der Ball weiter und bremst weniger – einen Schläger weniger nehmen.'),
        L('Near the green on bare ground: putt or chip with little loft.', 'Am Grün auf kahlem Boden: putten oder mit wenig Loft chippen.'),
        L('Casual water where you stand: free relief (Rule 16.1).', 'Zeitweiliges Wasser beim Stand: straflose Erleichterung (Regel 16.1).'),
      ],
    },
    drills: ['bare-lie', 'tee-after-ball', 'towel-behind'],
  },
  {
    id: 'trouble-wind',
    name: L('Wind', 'Wind'),
    short: L('Into the wind low, downwind high – and the club changes with it.', 'Gegen den Wind flach, mit dem Wind hoch – und der Schläger ändert sich mit.'),
    setup: {
      rows: [
        { k: 'club', v: L('Into the wind 1–2 clubs more, downwind 1 less (per ~15 km/h)', 'Gegenwind 1–2 Schläger mehr, Rückenwind 1 weniger (je ~15 km/h)') },
        { k: 'ball', v: L('Into the wind: a ball back. Downwind: normal', 'Gegenwind: eine Ballbreite zurück. Rückenwind: normal') },
        { k: 'swing', v: L('Into the wind: three-quarter swing, short finish – “swing easy when it is breezy”', 'Gegenwind: Dreiviertelschwung, kurzes Finish – „ruhig schwingen, wenn es weht“') },
        { k: 'aim', v: L('Crosswind: aim into it and let it drift back', 'Seitenwind: in den Wind zielen und zurücktreiben lassen') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { shift: 0.05 }),
        ball(1.76),
        co('trailAnkle', L('ball a ball back', 'Ball eine Ballbreite zurück'), [0.7, 0.8]),
        co('hands', L('more club, grip down', 'mehr Schläger, kürzer greifen'), [3.1, 1.3]),
        co('pelvis', L('weight forward', 'Gewicht vorn'), [3.1, 1.9]),
      ], L('Into the wind: face-on, target to the right.', 'Gegen den Wind: von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'The knockdown: more club, a shorter swing, a low held finish. A smooth swing makes less spin – and less spin means the wind takes less hold of the ball.',
          'Der Knockdown: mehr Schläger, kürzer schwingen, ein tiefes, gehaltenes Finish. Ein ruhiger Schwung erzeugt weniger Spin – und weniger Spin heißt, der Wind packt den Ball weniger.',
        ),
      ],
      drillPic: 'knockdown-wind',
    },
    watch: {
      sketch: aimCurve(-1, L('Wind from the left: aim into it, it drifts back to the flag.', 'Wind von links: in den Wind zielen, er treibt zur Fahne zurück.'), L('wind', 'Wind')),
      points: [
        L('Hitting harder into the wind makes more spin: the ball climbs and stops short.', 'Härter gegen den Wind schlagen erzeugt mehr Spin: Der Ball steigt und bleibt kurz.'),
        L('The GolfOS caddie gives the “plays like” distance with the wind.', 'Der GolfOS-Caddie nennt die „spielt wie“-Distanz mit dem Wind.'),
      ],
    },
    drills: ['knockdown-wind', 'wind-trajectories', 'two-club-wind'],
    videos: ['JCYbFBgfosI', 'cRa63BQjfjM'],
  },
];

// ---------- high and low ----------

export const HIGHLOW_SHOTS: TopicShot[] = [
  {
    id: 'shot-high',
    name: L('The high shot', 'Der hohe Schlag'),
    short: L('Over a tree, to a soft green, downwind: more loft at impact.', 'Über einen Baum, auf ein weiches Grün, mit dem Wind: mehr Loft im Treffmoment.'),
    setup: {
      rows: [
        { k: 'ball', v: L('One ball forward of normal', 'Eine Ballbreite weiter vorn als sonst') },
        { k: 'weight', v: L('A little more on the trail foot, head behind the ball', 'Etwas mehr auf dem hinteren Fuß, Kopf hinter dem Ball') },
        { k: 'grip', v: L('Hands level with the ball, not ahead', 'Hände auf Höhe des Balls, nicht davor') },
        { k: 'club', v: L('More loft, or the same club with a fuller swing', 'Mehr Loft oder derselbe Schläger mit vollerem Schwung') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { shift: -0.04 }),
        ball(2.1),
        co('trailAnkle', L('a little more weight back', 'etwas mehr Gewicht hinten'), [0.7, 0.8]),
        co('head', L('head behind the ball', 'Kopf hinter dem Ball'), [0.6, 2.2]),
        co('clubHead', L('ball forward', 'Ball vorn'), [3.2, 0.7]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'A full swing to a high finish: the hands finish high, the chest faces the target. Stay behind the ball through impact – the club adds loft instead of trapping the ball.',
          'Ein voller Schwung in ein hohes Finish: Die Hände enden hoch, die Brust zeigt zum Ziel. Durch den Treffmoment hinter dem Ball bleiben – der Schläger gibt Loft dazu, statt den Ball einzuklemmen.',
        ),
      ],
      sketch: S(4, 2.8, [
        ground(4),
        fig(1.9, 'frontFinish'),
        co('hands', L('hands finish high', 'die Hände enden hoch'), [3.1, 2.5]),
      ]),
    },
    watch: {
      points: [
        L('Do not scoop: the high shot comes from set-up and finish, not from lifting with the hands.', 'Nicht schaufeln: Der hohe Schlag kommt aus Ansprache und Finish, nicht vom Heben mit den Händen.'),
        L('A high shot goes shorter – take enough club to the target.', 'Ein hoher Schlag geht kürzer – genug Schläger fürs Ziel nehmen.'),
      ],
      sketch: S(6, 2.6, [ground(6), ...landRoll(6, 0.5, 4.4, 4.9, 1.7, flat, [L('high', 'hoch'), L('lands soft', 'landet weich')])], L('High and soft.', 'Hoch und weich.')),
    },
    drills: ['elevator', 'wind-trajectories', 'over-tree', 'nine-shot'],
  },
  {
    id: 'shot-low',
    name: L('The low shot (knockdown)', 'Der flache Schlag (Knockdown)'),
    short: L('Into the wind and under branches: less loft at impact, a short finish.', 'Gegen den Wind und unter Ästen: weniger Loft im Treffmoment, ein kurzes Finish.'),
    setup: {
      rows: [
        { k: 'ball', v: L('One ball back of centre', 'Eine Ballbreite hinter der Mitte') },
        { k: 'weight', v: L('About 60 % forward', 'Etwa 60 % vorn') },
        { k: 'grip', v: L('2–3 cm down, hands ahead of the ball', '2–3 cm kürzer, Hände vor dem Ball') },
        { k: 'club', v: L('One or two clubs more – the loft goes down', 'Ein bis zwei Schläger mehr – der Loft geht runter') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { shift: 0.05 }),
        ball(1.76),
        co('trailAnkle', L('ball back', 'Ball zurück'), [0.7, 0.8]),
        co('hands', L('hands ahead, grip down', 'Hände vorn, kürzer greifen'), [3.1, 1.3]),
        co('pelvis', L('weight forward', 'Gewicht vorn'), [3.1, 1.9]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      sketch: FIGURE_SKETCHES['punch-gap'],
      text: [
        L(
          'A three-quarter swing with a short, held finish – the hands stop at about shoulder height. Smooth, not hard: hitting harder makes spin and the ball climbs.',
          'Ein Dreiviertelschwung mit kurzem, gehaltenem Finish – die Hände stoppen etwa auf Schulterhöhe. Ruhig, nicht hart: Härter schlagen erzeugt Spin und der Ball steigt.',
        ),
      ],
    },
    watch: {
      points: [
        L('The finish shows the height: low finish, low flight.', 'Das Finish zeigt die Höhe: tiefes Finish, flacher Flug.'),
        L('A low ball rolls more – land it shorter.', 'Ein flacher Ball rollt mehr – kürzer landen.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.5, 3.6, 5.1, 0.55, flat, [L('low', 'flach'), L('more roll', 'mehr Rollen')])], L('Low and running.', 'Flach und laufend.')),
    },
    drills: ['knockdown-wind', 'punch-gap', 'wind-trajectories', 'elevator'],
    videos: ['JCYbFBgfosI'],
  },
];

// ---------- low point ----------

export const LOWPOINT_SHOTS: TopicShot[] = [
  {
    id: 'lowpoint-iron',
    name: L('Low point with irons', 'Low Point beim Eisen'),
    short: L('Ball first, then the ground: the lowest point 5–10 cm after the ball.', 'Erst der Ball, dann der Boden: der tiefste Punkt 5–10 cm nach dem Ball.'),
    setup: {
      graphic: 'lowIron',
      rows: [
        { k: 'ball', v: L('Short irons middle, long irons a ball forward', 'Kurze Eisen Mitte, lange Eisen eine Ballbreite weiter vorn') },
        { k: 'weight', v: L('At impact 70–80 % on the lead foot', 'Im Treffmoment 70–80 % auf dem vorderen Fuß') },
        { k: 'grip', v: L('Hands ahead of the ball at impact', 'Hände im Treffmoment vor dem Ball') },
        { k: 'swing', v: L('The divot starts at the ball and goes forward', 'Das Divot beginnt am Ball und geht nach vorn') },
      ],
    },
    move: {
      text: [
        L(
          'The low point moves forward when the pressure moves to the lead foot before the arms come down, and the chest stays over the ball. Hands and handle ahead of the clubhead – the club hits down on the ball.',
          'Der tiefste Punkt wandert nach vorn, wenn der Druck zum vorderen Fuß geht, bevor die Arme herunterkommen, und die Brust über dem Ball bleibt. Hände und Griff vor dem Schlägerkopf – der Schläger trifft den Ball abwärts.',
        ),
      ],
      sketch: FIGURE_SKETCHES['impact-bag'],
    },
    watch: {
      points: [
        L('Your divots tell you: they should start at the ball line and point to the target.', 'Deine Divots verraten es: Sie sollen an der Balllinie beginnen und zum Ziel zeigen.'),
        L('Fat and thin are the same fault: a low point behind the ball.', 'Fett und dünn sind derselbe Fehler: ein tiefster Punkt hinter dem Ball.'),
      ],
      drillPic: 'line-drill-irons',
    },
    drills: ['line-drill-irons', 'towel-behind', 'tee-after-ball', 'step-drill', 'impact-bag', 'divot-board-drill'],
    videos: ['Ifc37epOCqM', 'W_b6ov29TUA', 'fIRndq3lXlk', 'Rn5QtoZZ7OU'],
  },
  {
    id: 'lowpoint-chip',
    name: L('Low point in chips and pitches', 'Low Point beim Chip und Pitch'),
    short: L('The club brushes the grass just after the ball – never before it.', 'Der Schläger streift das Gras knapp nach dem Ball – nie davor.'),
    setup: {
      graphic: 'lowChip',
      rows: [
        { k: 'ball', v: L('Middle or slightly back', 'Mitte oder leicht zurück') },
        { k: 'weight', v: L('60–70 % forward – and it stays there', '60–70 % vorn – und es bleibt dort') },
        { k: 'grip', v: L('Hands slightly ahead, the handle leads', 'Hände leicht vorn, der Griff führt') },
      ],
    },
    move: {
      sketch: FIGURE_SKETCHES['trail-toe'],
      text: [
        L(
          'In the short game the low point moves back when the weight falls back or the wrists flip to help the ball up. Keep the weight on the lead foot and the lead wrist flat through the ball.',
          'Im kurzen Spiel wandert der tiefste Punkt nach hinten, wenn das Gewicht zurückfällt oder die Handgelenke klappen, um dem Ball zu helfen. Das Gewicht vorn und das vordere Handgelenk durch den Ball gerade halten.',
        ),
      ],
    },
    watch: {
      points: [
        L('A line on the grass (or a tee row): the club must brush the grass on the target side of the line.', 'Eine Linie im Gras (oder eine Tee-Reihe): Der Schläger muss das Gras auf der Zielseite der Linie streifen.'),
        L('Heavy chips first: check the weight, not the hands.', 'Bei fetten Chips zuerst das Gewicht prüfen, nicht die Hände.'),
      ],
      drillPic: 'chip-line',
    },
    drills: ['chip-line', 'trail-toe', 'stick-lead-arm', 'lead-hand-chip'],
  },
  {
    id: 'lowpoint-bunker',
    name: L('Low point in the bunker', 'Low Point im Bunker'),
    short: L('The only shot where it lies under the ball: the club enters 3–5 cm behind.', 'Der einzige Schlag, bei dem er unter dem Ball liegt: Eintritt 3–5 cm dahinter.'),
    setup: {
      graphic: 'lowBunker',
      rows: [
        { k: 'ball', v: L('Forward, at the lead heel – the low point stays in the middle', 'Vorn, an der vorderen Ferse – der tiefste Punkt bleibt in der Mitte') },
        { k: 'weight', v: L('About 60 % forward, it stays there', 'Etwa 60 % vorn, es bleibt dort') },
        { k: 'entry', v: L('A line 3–5 cm behind the ball', 'Eine Linie 3–5 cm hinter dem Ball') },
      ],
    },
    move: {
      section: 'bunker/The swing',
      text: [
        L(
          'With the ball forward and the weight steady, the club bottoms out in the sand under the ball. Moving the ball forward – not leaning back – makes the club enter behind it.',
          'Mit dem Ball vorn und ruhigem Gewicht erreicht der Schläger den tiefsten Punkt im Sand unter dem Ball. Den Ball nach vorn legen – nicht nach hinten lehnen – lässt den Schläger dahinter eintreten.',
        ),
      ],
    },
    watch: {
      points: [
        L('Draw a line in the sand and hit only the line, without a ball – the divot must start at the line.', 'Eine Linie in den Sand ziehen und ohne Ball nur die Linie treffen – die Spur muss an der Linie beginnen.'),
        L('A long, flat trail (a banknote long), not a deep hole.', 'Eine lange, flache Spur (einen Geldschein lang), kein tiefes Loch.'),
      ],
      drillPic: 'line-in-sand',
    },
    drills: ['line-in-sand', 'dollar-bill', 'splash-no-ball'],
  },
  {
    id: 'lowpoint-driver',
    name: L('Low point with the driver', 'Low Point beim Driver'),
    short: L('The exception: the low point before the ball – hit up on it from the tee.', 'Die Ausnahme: der tiefste Punkt vor dem Ball – vom Tee aufwärts treffen.'),
    setup: {
      graphic: 'lowDriver',
      rows: [
        { k: 'ball', v: L('At the lead heel', 'An der vorderen Ferse') },
        { k: 'stance', v: L('Wide, spine tilted slightly away from the target', 'Breit, Wirbelsäule leicht vom Ziel weg geneigt') },
        { k: 'weight', v: L('At address a little more on the trail foot', 'Bei der Ansprache etwas mehr auf dem hinteren Fuß') },
        { k: 'gear', v: L('Tee high: half the ball above the crown', 'Hoch aufteen: der halbe Ball über der Schlägerkrone') },
      ],
    },
    move: {
      sketch: FIGURE_SKETCHES['driver-wide-stance'],
      text: [
        L(
          'The head stays behind the ball through impact, the club meets the ball after the lowest point – on the way up. Hitting down with the driver adds spin and costs length.',
          'Der Kopf bleibt im Treffmoment hinter dem Ball, der Schläger trifft ihn nach dem tiefsten Punkt – aufwärts. Mit dem Driver abwärts zu treffen erzeugt Spin und kostet Länge.',
        ),
      ],
    },
    watch: {
      points: [
        L('Marks on the top of the driver head (sky marks) mean you hit down – tee higher, ball more forward.', 'Spuren oben auf dem Driverkopf heißen: abwärts getroffen – höher aufteen, Ball weiter vorn.'),
        L('The irons stay the other way round – do not copy the driver into the iron swing.', 'Bei den Eisen bleibt es umgekehrt – den Driver nicht in den Eisenschwung übernehmen.'),
      ],
      drillPic: 'tee-height',
    },
    drills: ['tee-height', 'hit-up-tee', 'driver-wide-stance'],
  },
];

export const ABSORBS: Partial<Record<string, string[]>> = {
  pitching: ['The pitch set-up', 'The clock system', 'The motion', 'Lob and flop', 'Spin'],
  bunker: ['Set-up in the greenside bunker', 'The swing', 'Special lies', 'Fairway bunker'],
  slopes: ['Ball above the feet', 'Ball below the feet', 'Uphill lie', 'Downhill lie'],
  trouble: ['The punch shot under trees', 'From the rough', 'Divots, bare ground, wet grass', 'Wind'],
};

