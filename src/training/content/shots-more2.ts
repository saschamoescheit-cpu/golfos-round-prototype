import { L, type TopicShot } from '../types';
import { S, T, arrow, ball, co, fig, flight, ground, hill, landRoll, txt, G0 } from './shots-kit';

// Putting, irons, woods and driver as shots too (Sascha 15.11.2026, night run: "Weitere Themen als Schläge"), the
// same pattern as chipping: Set-up rows, Motion, What to watch – each with a picture – and the drills. Values are the
// common teaching standard; our pro checks them in "Review the content".

const flat = (x: number) => G0 + 0 * x;

// ---------- putting ----------

const pUp = hill(5, 0.2, 0.55);
const pDown = hill(5, 0.55, 0.2);

/** a putt from the side on a slope: the ball, the roll to the flag, a mark where to aim */
const puttSlope = (h: ReturnType<typeof hill>, aimX: number, aimText: L, caption: L) =>
  S(5, 1.8, [
    h.item,
    ball(0.6, h.at(0.6)),
    arrow([0.75, h.at(0.75) + 0.06], [3.7, h.at(3.7) + 0.06]),
    { k: 'flag', at: [3.9, h.at(3.9)] },
    { k: 'line', from: [aimX, h.at(aimX)], to: [aimX, h.at(aimX) + 0.35], dashed: true },
    txt([aimX, h.at(aimX) + 0.5], aimText, 11),
  ], caption);

export const PUTT_SHOTS: TopicShot[] = [
  {
    id: 'putt-short',
    name: L('The short putt (under 2 m)', 'Der kurze Putt (unter 2 m)'),
    short: L('The putts you must hole: a firm pace, little break, a quiet head.', 'Die Putts, die fallen müssen: festes Tempo, wenig Break, ruhiger Kopf.'),
    setup: {
      section: 'Set-up',
      rows: [
        { k: 'ball', v: L('Slightly forward of centre – it rolls instead of hopping', 'Etwas vor der Mitte – er rollt, statt zu hüpfen') },
        { k: 'stance', v: L('Eyes over the ball or slightly inside, shoulders parallel to the start line', 'Augen über dem Ball oder leicht innerhalb, Schultern parallel zur Startlinie') },
        { k: 'grip', v: L('Light grip pressure, about 3–4 of 10', 'Leichter Griffdruck, etwa 3–4 von 10') },
        { k: 'aim', v: L('Inside the edge – the ball should hit the back of the cup', 'Innerhalb der Lochkante – der Ball soll an die hintere Lochwand') },
      ],
    },
    move: {
      section: 'The stroke',
      text: [
        L(
          'A pendulum from the shoulders: arms and shoulders move as one triangle, the hands stay passive. A short backswing and a slightly longer, accelerating stroke through – never slowing down at the ball.',
          'Ein Pendel aus den Schultern: Arme und Schultern bewegen sich als ein Dreieck, die Hände bleiben passiv. Kurz zurück und etwas länger, beschleunigend durch – am Ball nie abbremsen.',
        ),
      ],
    },
    watch: {
      section: 'Short putts (under 2 m)',
      points: [
        L('Head and eyes still until the ball is gone – listen for it to drop.', 'Kopf und Augen ruhig, bis der Ball weg ist – „hör“ ihn fallen.'),
        L('The same routine every time; under pressure the routine carries you.', 'Jedes Mal dieselbe Routine; unter Druck trägt dich die Routine.'),
      ],
    },
    drills: ['clock', 'mickelson-circle', 'tiger-gate', 'ball-gate', 'chicken'],
  },
  {
    id: 'putt-long',
    name: L('The long putt (over 8 m)', 'Der lange Putt (über 8 m)'),
    short: L('Not to hole it but to leave it close: the second putt from inside 1 m.', 'Nicht einlochen, sondern nah legen: der zweite Putt aus unter 1 m.'),
    setup: {
      rows: [
        { k: 'aim', v: L('A circle of 1–2 m around the hole, not the hole itself', 'Ein Kreis von 1–2 m ums Loch, nicht das Loch selbst') },
        { k: 'stance', v: L('A little taller, so you can see the line', 'Etwas aufrechter, damit du die Linie siehst') },
        { k: 'swing', v: L('A longer stroke at the same rhythm – not a faster one', 'Eine längere Bewegung im gleichen Rhythmus – keine schnellere') },
        { k: 'grip', v: L('Soft hands – a firm grip kills the feel for length', 'Weiche Hände – ein fester Griff zerstört das Gefühl für die Länge') },
      ],
      sketch: S(4, 2.3, [
        ground(4),
        fig(2.0, 'putt'),
        ball(2.02),
        arrow([1.8, 0.36], [1.2, 0.36]),
        arrow([2.25, 0.36], [2.9, 0.36]),
        co('leadShoulder', L('a longer stroke, the same rhythm', 'eine längere Bewegung, derselbe Rhythmus'), [3.2, 1.9]),
        co('hands', L('soft hands', 'weiche Hände'), [0.7, 1.1]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      section: 'Rhythm: the key to length',
      text: [
        L(
          'Practice strokes looking at the hole – feel the length, then putt without waiting. Back about twice as long in time as through (2 : 1); the length grows with the length of the stroke.',
          'Probeschwünge mit Blick zum Loch – die Länge fühlen, dann ohne Zögern putten. Zurück dauert etwa doppelt so lang wie durch (2 : 1); die Länge wächst mit der Länge der Bewegung.',
        ),
      ],
    },
    watch: {
      section: 'Long putts (over 8 m)',
      points: [
        L('Read the last third closely: the ball breaks most when it is slow, near the hole.', 'Das letzte Drittel genau lesen: Der Ball bricht am meisten, wenn er langsam ist – nahe am Loch.'),
        L('Better below the hole than above – uphill second putts forgive more.', 'Lieber unterhalb des Lochs als oberhalb – Bergauf-Zweitputts verzeihen mehr.'),
      ],
    },
    drills: ['ladder', 'lag-circle', 'four-tee', 'pelz-17', 'fringe'],
  },
  {
    id: 'putt-uphill',
    name: L('Uphill putt', 'Putt bergauf'),
    short: L('Firmer, less break – and it forgives a little too much pace.', 'Fester, weniger Break – und er verzeiht etwas zu viel Tempo.'),
    setup: {
      rows: [
        { k: 'aim', v: L('Imagine the hole 30–50 cm further away', 'Stell dir das Loch 30–50 cm weiter weg vor') },
        { k: 'swing', v: L('A longer stroke, the same rhythm', 'Eine längere Bewegung, derselbe Rhythmus') },
        { k: 'stance', v: L('Weight a little more on the lower foot, stay steady', 'Gewicht etwas mehr auf dem tieferen Fuß, ruhig bleiben') },
        { k: 'ball', v: L('As usual, slightly forward of centre', 'Wie immer, etwas vor der Mitte') },
      ],
      sketch: S(4, 2.4, [
        hill(4, 0.2, 0.5).item,
        fig(1.9, 'putt', { tilt: hill(4, 0.2, 0.5).deg, y: hill(4, 0.2, 0.5).at(1.9) }),
        ball(1.92, hill(4, 0.2, 0.5).at(1.92)),
        co('leadShoulder', L('shoulders with the slope', 'Schultern mit dem Hang'), [3.1, 2.0]),
        co('trailAnkle', L('a little more weight on the lower foot', 'etwas mehr Gewicht auf dem tieferen Fuß'), [0.7, 0.9]),
      ], L('Face-on: the putt goes up the hill to the right.', 'Von vorn: Der Putt geht nach rechts den Hang hinauf.')),
    },
    move: {
      text: [
        L(
          'Make the stroke longer, not harder: the rhythm stays. An uphill putt breaks less – play less break than you see, and be firm enough to reach the back of the cup.',
          'Die Bewegung länger machen, nicht härter: Der Rhythmus bleibt. Ein Bergauf-Putt bricht weniger – weniger Break spielen, als du siehst, und fest genug, um die hintere Lochwand zu erreichen.',
        ),
      ],
      sketch: puttSlope(pUp, 4.35, L('aim here', 'hierhin zielen'), L('Uphill: aim past the hole.', 'Bergauf: hinter das Loch zielen.')),
    },
    watch: {
      drillPic: 'uphill-downhill',
      points: [
        L('Short uphill is the most common miss – the ball never reaches the hole.', 'Bergauf zu kurz ist der häufigste Fehler – der Ball erreicht das Loch nie.'),
        L('Leave long putts below the hole: the next one is uphill.', 'Lange Putts unterhalb des Lochs liegen lassen: Der nächste geht bergauf.'),
      ],
    },
    drills: ['uphill-downhill', 'ladder', 'four-tee'],
  },
  {
    id: 'putt-downhill',
    name: L('Downhill putt', 'Putt bergab'),
    short: L('A soft touch and more break – pick a spot short of the hole.', 'Ein weicher Anschlag und mehr Break – einen Punkt vor dem Loch wählen.'),
    setup: {
      rows: [
        { k: 'aim', v: L('A spot short of the hole – roll the ball to it, the slope does the rest', 'Einen Punkt vor dem Loch – den Ball dorthin rollen, der Hang macht den Rest') },
        { k: 'swing', v: L('A short, soft stroke, the same rhythm', 'Eine kurze, weiche Bewegung, derselbe Rhythmus') },
        { k: 'stance', v: L('Weight a little more on the lower lead foot', 'Gewicht etwas mehr auf dem tieferen vorderen Fuß') },
        { k: 'grip', v: L('Very fast putts: strike a little towards the toe – the ball comes off softer', 'Sehr schnelle Putts: etwas Richtung Spitze treffen – der Ball kommt weicher') },
      ],
      sketch: S(4, 2.4, [
        hill(4, 0.5, 0.2).item,
        fig(1.9, 'putt', { tilt: hill(4, 0.5, 0.2).deg, y: hill(4, 0.5, 0.2).at(1.9) }),
        ball(1.92, hill(4, 0.5, 0.2).at(1.92)),
        co('leadShoulder', L('shoulders with the slope', 'Schultern mit dem Hang'), [3.1, 1.9]),
        co('hands', L('a short, soft stroke', 'eine kurze, weiche Bewegung'), [0.7, 1.4]),
      ], L('Face-on: the putt goes down the hill to the right.', 'Von vorn: Der Putt geht nach rechts den Hang hinunter.')),
    },
    move: {
      text: [
        L(
          'A short stroke, softly through – the ball should die at the hole. Downhill the ball breaks more: play more break, and aim at your spot, not at the hole.',
          'Eine kurze Bewegung, weich durch – der Ball soll am Loch sterben. Bergab bricht der Ball mehr: mehr Break spielen und auf deinen Punkt zielen, nicht aufs Loch.',
        ),
      ],
      sketch: puttSlope(pDown, 2.4, L('roll it to here', 'bis hierhin rollen'), L('Downhill: roll it to a spot short of the hole.', 'Bergab: bis zu einem Punkt vor dem Loch rollen.')),
    },
    watch: {
      points: [
        L('Three-putts come from downhill putts past the hole – the one back is uphill but long.', 'Dreiputts kommen von Bergab-Putts übers Loch hinaus – der Rückputt geht bergauf, ist aber lang.'),
        L('The faster the green, the shorter your spot.', 'Je schneller das Grün, desto kürzer dein Punkt.'),
      ],
      drillPic: 'pelz-17',
    },
    drills: ['uphill-downhill', 'pelz-17', 'eyes-closed'],
  },
  {
    id: 'putt-break',
    name: L('Putt with break', 'Putt mit Break'),
    short: L('The green slopes sideways: aim at a point above the hole, not at the hole.', 'Das Grün fällt seitlich: auf einen Punkt oberhalb zielen, nicht aufs Loch.'),
    setup: {
      rows: [
        { k: 'aim', v: L('The face square to your start line – to the aim point above the hole', 'Die Fläche square zur Startlinie – zum Zielpunkt oberhalb des Lochs') },
        { k: 'stance', v: L('Shoulders parallel to the start line, not to the hole', 'Schultern parallel zur Startlinie, nicht zum Loch') },
        { k: 'swing', v: L('A straight putt to the aim point – the slope bends it', 'Ein gerader Putt zum Zielpunkt – der Hang biegt ihn') },
        { k: 'ball', v: L('As usual', 'Wie immer') },
      ],
      sketch: T(5, 7, [
        { k: 'green', x: 0, y: 0, w: 5, h: 7 },
        { k: 'hole', at: [3.1, 6.0], flag: true },
        { k: 'ball', at: [2.0, 1.0] },
        { k: 'path', pts: [[2.0, 1.0], [3.8, 6.2]], style: 'aim' },
        { k: 'path', pts: [[2.0, 1.0], [3.4, 3.8], [3.15, 5.85]], style: 'roll', arrow: true },
        { k: 'slope', at: [4.3, 3.0], dir: 270, label: L('slope', 'Gefälle') },
        { k: 'text', at: [3.8, 6.6], t: L('aim point', 'Zielpunkt'), size: 11 },
      ], L('From above: start the ball at the aim point, the slope brings it to the hole.', 'Von oben: den Ball zum Zielpunkt starten, der Hang bringt ihn zum Loch.')),
    },
    move: {
      text: [
        L(
          'Once you have chosen the aim point, putt straight at it – do not steer the ball to the hole. Pace and break belong together: firmer means less break, softer means more.',
          'Ist der Zielpunkt gewählt, gerade darauf putten – den Ball nicht zum Loch lenken. Tempo und Break gehören zusammen: fester heißt weniger Break, weicher heißt mehr.',
        ),
      ],
      sketch: S(3, 2.2, [
        ground(3),
        fig(1.0, 'puttSide'),
        ball(1.37),
        { k: 'line', from: [1.36, 1.43], to: [1.37, 0.3], dashed: true },
        co('head', L('eyes over the start line to the aim point', 'Augen über der Startlinie zum Zielpunkt'), [2.2, 1.9]),
      ], L('From the side.', 'Von der Seite.')),
    },
    watch: {
      drillPic: 'apex-tee',
      points: [
        L('Most players under-read the break – the ball passes below the hole (the amateur side).', 'Die meisten lesen zu wenig Break – der Ball läuft unterhalb vorbei (die Amateurseite).'),
        L('GolfOS shows the slope of the green on the round.', 'GolfOS zeigt das Gefälle des Grüns auf der Runde.'),
      ],
    },
    drills: ['clock', 'nesw', 'apex-tee', 'three-speeds'],
  },
  {
    id: 'putt-fringe',
    name: L('Putting from the fringe', 'Vom Vorgrün putten'),
    short: L('Short, even grass in front of the green: putt it – the safest shot (the "Texas wedge").', 'Kurzes, ebenes Gras vor dem Grün: putten – der sicherste Schlag (der „Texas Wedge“).'),
    setup: {
      rows: [
        { k: 'lie', v: L('Only when the grass in between is short and even', 'Nur wenn das Gras dazwischen kurz und eben ist') },
        { k: 'ball', v: L('A touch more forward – it rolls straight away', 'Eine Spur weiter vorn – er rollt sofort') },
        { k: 'swing', v: L('A little firmer for the fringe part (about 1 m of fringe = 2 m of green)', 'Etwas fester für das Vorgrün (etwa 1 m Vorgrün = 2 m Grün)') },
        { k: 'stance', v: L('As for a putt on the green', 'Wie beim Putt auf dem Grün') },
      ],
      sketch: S(4, 2.3, [
        ground(4),
        fig(2.0, 'putt'),
        ball(2.06),
        co('trailAnkle', L('ball a touch forward', 'Ball eine Spur vorn'), [0.7, 0.8]),
        co('leadShoulder', L('a little firmer for the fringe', 'etwas fester für das Vorgrün'), [3.2, 1.9]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'The same pendulum as on the green, a little longer. The fringe slows the ball for the first metres; after that it rolls like on the green.',
          'Dasselbe Pendel wie auf dem Grün, etwas länger. Das Vorgrün bremst den Ball auf den ersten Metern; danach rollt er wie auf dem Grün.',
        ),
      ],
      sketch: T(4, 7, [
        { k: 'fringe', x: 0, y: 0, w: 4, h: 2.4 },
        { k: 'green', x: 0, y: 2.4, w: 4, h: 4.6 },
        { k: 'ball', at: [2, 1.0] },
        { k: 'hole', at: [2, 6.0], flag: true },
        { k: 'path', pts: [[2, 1.0], [2, 5.85]], style: 'roll', arrow: true },
        { k: 'text', at: [3.0, 1.5], t: L('fringe: brakes', 'Vorgrün: bremst'), size: 11 },
      ], L('From above: through the fringe onto the green.', 'Von oben: durch das Vorgrün aufs Grün.')),
    },
    watch: {
      drillPic: 'fringe',
      points: [
        L('A bad putt is usually better than a bad chip – putt whenever you can.', 'Ein schlechter Putt ist meist besser als ein schlechter Chip – putten, wann immer es geht.'),
        L('Long or wet fringe, or the ball against the collar: chip, or use a hybrid.', 'Langes oder nasses Vorgrün oder der Ball an der Kante: chippen oder den Hybrid nehmen.'),
      ],
    },
    drills: ['fringe', 'star-fringe', 'hybrid-chip'],
  },
];

// ---------- irons ----------

export const IRON_SHOTS: TopicShot[] = [
  {
    id: 'iron-standard',
    name: L('The standard iron shot', 'Der Standard-Eisenschlag'),
    short: L('From the fairway to the green: ball first, then the ground.', 'Vom Fairway aufs Grün: erst der Ball, dann der Boden.'),
    setup: {
      section: 'Set-up for irons',
      rows: [
        { k: 'ball', v: L('Short irons middle, middle irons a ball forward, long irons two', 'Kurze Eisen Mitte, mittlere eine Ballbreite vorn, lange zwei') },
        { k: 'stance', v: L('About shoulder-wide, weight 50 : 50', 'Etwa schulterbreit, Gewicht 50 : 50') },
        { k: 'grip', v: L('Hands level with or slightly ahead of the ball', 'Hände auf Höhe oder leicht vor dem Ball') },
        { k: 'aim', v: L('Feet, hips and shoulders parallel – railway tracks', 'Füße, Hüften und Schultern parallel – Bahngleise') },
        { k: 'club', v: L('By your carry (My bag), to the middle of the green', 'Nach deinem Carry (Mein Bag), zur Grünmitte') },
      ],
    },
    move: {
      text: [
        L(
          'A full turn back, then the pressure goes to the lead foot first and the club comes down. At impact the hands are ahead, the shaft leans to the target and the club still moves down – the divot starts after the ball.',
          'Eine volle Drehung zurück, dann geht zuerst der Druck zum vorderen Fuß und der Schläger kommt herunter. Im Treffmoment sind die Hände vorn, der Schaft neigt sich zum Ziel und der Schläger bewegt sich noch nach unten – das Divot beginnt nach dem Ball.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'frontTop'),
        fig(3.6, 'impact', { shift: 0.05 }),
        ball(3.55),
        co('trailKnee', L('a full turn over the trail leg', 'eine volle Drehung über das hintere Bein'), [0.4, 0.9], 0),
        co('hands', L('hands ahead at impact', 'Hände vorn im Treffmoment'), [4.6, 1.5], 1),
      ]),
    },
    watch: {
      section: 'Contact: ball first',
      points: [
        L('A divot behind the ball means the low point is too early – weight forward.', 'Ein Divot hinter dem Ball heißt: tiefster Punkt zu früh – Gewicht nach vorn.'),
        L('No divot and a thin ball: the body went up or back.', 'Kein Divot und ein dünner Ball: Der Körper ging nach oben oder hinten.'),
      ],
    },
    drills: ['towel-behind', 'line-drill-irons', 'step-drill', 'impact-bag', 'stock-shot'],
    videos: ['Ifc37epOCqM', 'fIRndq3lXlk', 'W_b6ov29TUA'],
  },
  {
    id: 'iron-approach',
    name: L('Approach: where to aim', 'Annäherung: wohin zielen'),
    short: L('The middle of the green beats the flag – and the length matters more than the line.', 'Die Grünmitte schlägt die Fahne – und die Länge zählt mehr als die Richtung.'),
    setup: {
      section: 'Where to aim on approach shots',
      rows: [
        { k: 'aim', v: L('From over 150 m: the middle of the green', 'Aus über 150 m: die Grünmitte') },
        { k: 'club', v: L('The carry to the middle, not to the flag – when in doubt one more', 'Das Carry zur Mitte, nicht zur Fahne – im Zweifel einen mehr') },
        { k: 'swing', v: L('Your standard swing, not a forced one', 'Dein Standardschwung, kein erzwungener') },
      ],
    },
    move: {
      drillPic: 'three-distances',
      text: [
        L(
          'Pick the club by the distance to the middle of the green, then commit to your standard swing. A smooth swing with one club more is straighter than a hard swing with one club less.',
          'Den Schläger nach der Distanz zur Grünmitte wählen, dann den Standardschwung durchziehen. Ein ruhiger Schwung mit einem Schläger mehr ist gerader als ein harter mit einem weniger.',
        ),
      ],
    },
    watch: {
      section: 'Know your distances',
      points: [
        L('Flag near water or a bunker: aim at the safe side – a miss on the wrong side costs far more.', 'Fahne nahe Wasser oder Bunker: auf die sichere Seite zielen – ein Fehler auf der falschen Seite kostet viel mehr.'),
        L('Most players come up short: know your average carry, not your best one.', 'Die meisten Spieler bleiben zu kurz: Kenne dein durchschnittliches Carry, nicht dein bestes.'),
      ],
    },
    drills: ['green-target-game', 'three-distances', 'gapping', 'par3-middle'],
  },
  {
    id: 'iron-long',
    name: L('Long irons and the hybrid instead', 'Lange Eisen – und der Hybrid statt dessen'),
    short: L('Long irons need speed and a wide swing – a hybrid makes it easier.', 'Lange Eisen brauchen Tempo und einen weiten Schwung – ein Hybrid macht es leichter.'),
    setup: {
      rows: [
        { k: 'ball', v: L('Two balls forward of centre', 'Zwei Ballbreiten vor der Mitte') },
        { k: 'stance', v: L('A little wider than for the short irons', 'Etwas breiter als bei den kurzen Eisen') },
        { k: 'swing', v: L('Wide and smooth – sweep it, do not hit at it', 'Weit und ruhig – fegen, nicht schlagen') },
        { k: 'club', v: L('From the 5-iron up most players hit a hybrid better', 'Ab Eisen 5 treffen die meisten Spieler einen Hybrid besser') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { stance: 'wide' }),
        ball(2.08),
        co('trailAnkle', L('a wider stance', 'ein breiterer Stand'), [0.7, 0.8]),
        co('clubHead', L('ball two balls forward', 'Ball zwei Ballbreiten vorn'), [3.2, 0.7]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'A wide takeaway and a full turn; the club brushes the ground at the ball with a shallow divot. Let the loft work – trying to help the ball up makes it thin.',
          'Weit vom Ball weg und eine volle Drehung; der Schläger streift am Ball den Boden mit einem flachen Divot. Den Loft arbeiten lassen – dem Ball nach oben helfen macht ihn dünn.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'takeaway'),
        fig(3.6, 'impact'),
        ball(3.55),
        co('clubHead', L('wide and low away from the ball', 'weit und flach vom Ball weg'), [0.4, 0.9], 0),
        co('hands', L('brush the ground at the ball', 'am Ball den Boden streifen'), [4.6, 1.5], 1),
      ]),
    },
    watch: {
      drillPic: 'hybrid-tee-down',
      points: [
        L('Measure it: if your hybrid flies as far and lands softer, take the long iron out of the bag.', 'Miss es: Fliegt dein Hybrid gleich weit und landet weicher, nimm das lange Eisen aus dem Bag.'),
        L('Long irons stop less on the green – plan some roll.', 'Lange Eisen bleiben schlechter auf dem Grün liegen – etwas Rollen einplanen.'),
      ],
    },
    drills: ['hybrid-tee-down', 'lead-arm-only', 'gapping'],
  },
];

// ---------- woods ----------

export const WOOD_SHOTS: TopicShot[] = [
  {
    id: 'wood-fairway',
    name: L('Fairway wood from the fairway', 'Fairwayholz vom Fairway'),
    short: L('Sweep it off the grass – the loft lifts the ball.', 'Den Ball vom Gras fegen – der Loft hebt ihn.'),
    setup: {
      section: 'Set-up',
      rows: [
        { k: 'ball', v: L('About two balls inside the lead heel', 'Etwa zwei Ballbreiten innen an der vorderen Ferse') },
        { k: 'stance', v: L('A little wider than shoulder-wide, weight 50 : 50', 'Etwas breiter als schulterbreit, Gewicht 50 : 50') },
        { k: 'grip', v: L('Hands level with the ball, not ahead as with irons', 'Hände auf Höhe des Balls, nicht davor wie beim Eisen') },
        { k: 'club', v: L('The sole flat on the ground', 'Die Sohle flach auf dem Boden') },
      ],
    },
    move: {
      section: 'The swing: sweep',
      text: [
        L(
          'A wide, round swing: low and slow away from the ball, a full turn, and through the ball the club brushes the grass like a broom. The chest stays over the ball, then a full finish.',
          'Ein weiter, runder Schwung: flach und langsam vom Ball weg, eine volle Drehung, und durch den Ball streift der Schläger das Gras wie ein Besen. Die Brust bleibt über dem Ball, dann ein volles Finish.',
        ),
      ],
    },
    watch: {
      drillPic: 'woods-sweep',
      points: [
        L('Topped woods come from trying to lift the ball – trust the loft.', 'Getoppte Hölzer kommen vom Versuch, den Ball zu heben – dem Loft vertrauen.'),
        L('Only from a good lie and with room in front – otherwise a hybrid or an iron.', 'Nur aus guter Lage und mit Platz davor – sonst Hybrid oder Eisen.'),
      ],
    },
    drills: ['wood-par5-layup', 'gapping'], // Chris took the sweeping drills out (part 2) – new ones proposed to him
  },
  {
    id: 'wood-tee',
    name: L('Fairway wood off the tee', 'Fairwayholz vom Abschlag'),
    short: L('The safe tee shot on tight holes – teed low, swept like from the fairway.', 'Der sichere Abschlag auf engen Löchern – niedrig aufgeteet, gefegt wie vom Fairway.'),
    setup: {
      drillPic: 'tee-low-wood',
      rows: [
        { k: 'gear', v: L('Tee it low: the ball just above the grass', 'Niedrig aufteen: der Ball knapp über dem Gras') },
        { k: 'ball', v: L('Two balls inside the lead heel', 'Zwei Ballbreiten innen an der vorderen Ferse') },
        { k: 'aim', v: L('To the wide side of the fairway, away from trouble', 'Auf die breite Seite des Fairways, weg von der Gefahr') },
        { k: 'swing', v: L('Sweep it – not up like the driver', 'Fegen – nicht aufwärts wie beim Driver') },
      ],
    },
    move: {
      text: [
        L(
          'The same sweeping swing as from the fairway: the club brushes the tee away. A high tee tempts you to hit up – with a fairway wood that sends the ball up into the air.',
          'Derselbe fegende Schwung wie vom Fairway: Der Schläger fegt das Tee weg. Ein hohes Tee verleitet zum Aufwärtsschlag – mit dem Fairwayholz geht der Ball dann steil in die Luft.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'takeaway', { club: 'driver' }),
        fig(3.6, 'frontFinish', { club: 'driver' }),
        co('clubHead', L('low and slow away', 'flach und langsam weg'), [0.4, 0.9], 0),
        co('hands', L('a full finish', 'ein volles Finish'), [4.6, 2.5], 1),
      ]),
    },
    watch: {
      section: 'When to take a wood',
      points: [
        L('A 3-wood in play beats a driver in the trees.', 'Holz 3 im Spiel schlägt Driver im Wald.'),
        L('Test it: “3-wood or driver?” – the drill shows where you lose fewer strokes.', 'Teste es: „Holz 3 oder Driver?“ – die Übung zeigt, wo du weniger Schläge verlierst.'),
      ],
    },
    drills: ['gapping'], // Chris took the tee drills out (part 2) – new ones proposed to him
  },
  {
    id: 'hybrid',
    name: L('The hybrid', 'Der Hybrid'),
    short: L('Instead of long irons, from the fairway and light rough – easier to hit high.', 'Statt langer Eisen, vom Fairway und aus leichtem Rough – leichter hoch zu treffen.'),
    setup: {
      rows: [
        { k: 'ball', v: L('A little further back than a wood – like a long iron', 'Etwas weiter hinten als beim Holz – wie ein langes Eisen') },
        { k: 'stance', v: L('About shoulder-wide', 'Etwa schulterbreit') },
        { k: 'grip', v: L('Hands level with or slightly ahead of the ball', 'Hände auf Höhe oder leicht vor dem Ball') },
        { k: 'club', v: L('Replaces the 3- to 5-iron', 'Ersetzt Eisen 3 bis 5') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        fig(1.9, 'front', { club: 'driver' }),
        ball(1.98),
        co('clubHead', L('ball a little back of a wood', 'Ball etwas weiter hinten als beim Holz'), [3.2, 0.7]),
        co('hands', L('hands level or slightly ahead', 'Hände auf Höhe oder leicht vorn'), [3.2, 1.4]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'Swing it like an iron: a slightly steeper hit with a shallow divot is fine. From the rough the rounded head goes through the grass better than an iron.',
          'Wie ein Eisen schwingen: Ein etwas steilerer Treffer mit flachem Divot ist in Ordnung. Aus dem Rough geht der runde Kopf besser durchs Gras als ein Eisen.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'takeaway', { club: 'driver' }),
        fig(3.6, 'impact', { club: 'driver' }),
        ball(3.55),
        co('clubHead', L('low and slow away', 'flach und langsam weg'), [0.4, 0.9], 0),
        co('hands', L('a slightly steeper hit like an iron', 'ein etwas steilerer Treffer wie beim Eisen'), [4.6, 1.5], 1),
      ]),
    },
    watch: {
      drillPic: 'hybrid-tee-down',
      points: [
        L('The hybrid tends to go left – aim a little right or hold the face through impact.', 'Der Hybrid neigt nach links – etwas rechts zielen oder die Fläche durch den Treffmoment halten.'),
        L('Around the green it can chip like a putter (see Chipping).', 'Am Grün chippt er wie ein Putter (siehe Chippen).'),
      ],
    },
    drills: ['hybrid-tee-down', 'hybrid-rough', 'hybrid-chip'],
  },
];

// ---------- driver ----------

export const DRIVER_SHOTS: TopicShot[] = [
  {
    id: 'driver-standard',
    name: L('The drive', 'Der Drive'),
    short: L('Teed high, ball forward, hit on the way up – high launch, little spin.', 'Hoch aufgeteet, Ball vorn, aufwärts getroffen – hoher Abflug, wenig Spin.'),
    setup: {
      section: 'Set-up for the driver',
      rows: [
        { k: 'ball', v: L('Opposite the inside of the lead heel', 'Gegenüber der Innenseite der vorderen Ferse') },
        { k: 'stance', v: L('Wider than shoulder-wide', 'Breiter als schulterbreit') },
        { k: 'weight', v: L('Spine tilted away from the target, head behind the ball', 'Wirbelsäule vom Ziel weg geneigt, Kopf hinter dem Ball') },
        { k: 'gear', v: L('Tee high: half the ball above the clubface', 'Hoch aufteen: halber Ball über der Schlagfläche') },
      ],
    },
    move: {
      section: 'Hit up and hit the centre',
      text: [
        L(
          'A full turn, then the club reaches its lowest point before the ball and already rises at impact. Stay behind the ball through impact – the head moves only after the ball.',
          'Eine volle Drehung, dann erreicht der Schläger seinen tiefsten Punkt vor dem Ball und steigt im Treffmoment schon. Durch den Treffmoment hinter dem Ball bleiben – der Kopf geht erst nach dem Ball mit.',
        ),
      ],
    },
    watch: {
      drillPic: 'driver-face-gate',
      points: [
        L('The best drives come from the middle of the face or a little above – spray the face to see it.', 'Die besten Drives kommen aus der Mitte der Fläche oder etwas darüber – Treffspray zeigt es.'),
        L('Marks on the top of the head (sky ball): tee higher, ball forward, do not hit down.', 'Spuren oben auf dem Kopf (Kerze): höher aufteen, Ball vorn, nicht abwärts schlagen.'),
      ],
    },
    drills: ['tee-height', 'hit-up-tee', 'driver-wide-stance', 'speed-training'],
  },
  {
    id: 'driver-safe',
    name: L('The safe drive (fairway finder)', 'Der sichere Drive (Fairwayfinder)'),
    short: L('When the fairway counts more than length: shorter grip, 80 % swing.', 'Wenn das Fairway mehr zählt als die Länge: kürzer greifen, 80 % Schwung.'),
    setup: {
      drillPic: 'driver-80',
      rows: [
        { k: 'grip', v: L('2 cm down the grip', '2 cm kürzer greifen') },
        { k: 'gear', v: L('Teed a little lower', 'Etwas niedriger aufgeteet') },
        { k: 'swing', v: L('About 80 %, a three-quarter finish', 'Etwa 80 %, ein Dreiviertel-Finish') },
        { k: 'aim', v: L('To the safe half of the fairway, tee up on the side of the trouble', 'Auf die sichere Fairwayhälfte, auf der Seite der Gefahr aufteen') },
      ],
    },
    move: {
      text: [
        L(
          'A smooth, balanced swing that you hold to the finish. You lose about 10–15 m – and hit the fairway far more often.',
          'Ein ruhiger, ausbalancierter Schwung, den du bis ins Finish hältst. Du verlierst etwa 10–15 m – und triffst das Fairway viel öfter.',
        ),
      ],
      sketch: S(4, 2.8, [
        ground(4),
        fig(1.9, 'halfThrough', { club: 'driver' }),
        co('hands', L('a held three-quarter finish', 'ein gehaltenes Dreiviertel-Finish'), [3.1, 2.4]),
      ]),
    },
    watch: {
      section: 'Stay in play',
      points: [
        L('Play your curve: with a fade aim at the left edge, with a draw at the right.', 'Spiel deine Kurve: mit Fade auf den linken Rand zielen, mit Draw auf den rechten.'),
        L('A hazard only at your driver distance: take a shorter club.', 'Eine Gefahr nur in deiner Driver-Distanz: einen kürzeren Schläger nehmen.'),
      ],
    },
    drills: ['driver-80', 'fairway-gate', 'tee-side', 'driver-start-gate'],
  },
  {
    id: 'driver-wind',
    name: L('The drive in the wind', 'Der Drive bei Wind'),
    short: L('Into the wind lower, downwind higher – with the tee and the ball position.', 'Gegen den Wind flacher, mit dem Wind höher – über Tee und Ballposition.'),
    setup: {
      rows: [
        { k: 'gear', v: L('Into the wind tee lower, downwind higher', 'Gegenwind niedriger aufteen, Rückenwind höher') },
        { k: 'ball', v: L('Into the wind a ball further back, downwind as usual', 'Gegenwind eine Ballbreite weiter hinten, Rückenwind wie immer') },
        { k: 'swing', v: L('Into the wind smooth, a shorter finish – hitting harder adds spin', 'Gegenwind ruhig, kürzeres Finish – härter schlagen bringt Spin') },
        { k: 'aim', v: L('Crosswind: start it into the wind and let it drift', 'Seitenwind: in den Wind starten und treiben lassen') },
      ],
      sketch: S(4, 2.6, [
        ground(4),
        { k: 'line', from: [2.07, 0.2], to: [2.07, 0.27] },
        fig(1.9, 'front', { club: 'driver', stance: 'wide' }),
        ball(2.07, 0.29),
        co('clubHead', L('into the wind: tee lower, ball a little back', 'Gegenwind: niedriger aufteen, Ball etwas zurück'), [3.2, 0.7]),
      ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
    },
    move: {
      text: [
        L(
          'Into the wind: a smooth swing with a lower, held finish keeps the spin low – the ball bores through the wind. Downwind: tee it high and let it fly.',
          'Gegen den Wind: Ein ruhiger Schwung mit tieferem, gehaltenem Finish hält den Spin niedrig – der Ball bohrt sich durch den Wind. Mit dem Wind: hoch aufteen und fliegen lassen.',
        ),
      ],
      sketch: S(6, 2.8, [
        ground(6),
        flight([[0.4, 0.3], [2.6, 2.3], [5.4, 0.25]]),
        flight([[0.4, 0.3], [2.4, 0.75], [4.6, 0.25]]),
        txt([2.6, 2.55], L('downwind: high', 'Rückenwind: hoch'), 11),
        txt([4.7, 0.65], L('into the wind: low', 'Gegenwind: flach'), 11, 'start'),
      ]),
    },
    watch: {
      points: [
        L('“Swing easy when it is breezy” – the harder you hit into the wind, the more the ball climbs.', '„Ruhig schwingen, wenn es weht“ – je härter gegen den Wind, desto mehr steigt der Ball.'),
        L('Downwind the ball rolls further – a hazard behind the landing zone comes into play.', 'Mit Rückenwind rollt der Ball weiter – eine Gefahr hinter der Landezone kommt ins Spiel.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.4, 3.8, 5.4, 0.9, flat, [L('downwind', 'Rückenwind'), L('rolls further', 'rollt weiter')])], L('Downwind: more roll.', 'Rückenwind: mehr Rollen.')),
    },
    drills: ['tee-height', 'driver-80', 'wind-trajectories'],
  },
];

export const ABSORBS2: Partial<Record<string, string[]>> = {
  putting: ['Set-up', 'The stroke', 'Short putts (under 2 m)', 'Long putts (over 8 m)'],
  irons: ['Contact: ball first', 'Set-up for irons'],
  woods: ['Set-up', 'The swing: sweep'],
  driver: ['Set-up for the driver', 'Hit up and hit the centre'],
};
