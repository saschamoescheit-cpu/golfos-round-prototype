import { L, type Category, type SwingPosition } from '../types';

// The basic swing as the P system (Sascha 17./18.11.2026): ten positions of the full swing from down the line, one
// photo series of the same golfer on the same spot with the same background (features/040-neutraler-schwung), a
// right-hander with a 7-iron. Chips, pitches and every other shot build on it. Researched from the sources below
// (features/040-neutraler-schwung/recherche-p-system.md, 32 sources); the numbers wait for Chris (review mode).

const P = (n: number) => `p${n}.jpg`;
/** the face-on photo of the same position (one series from the front, same golfer and studio) */
const F = (n: number) => `fo-p${n}.jpg`;

export const PSYSTEM_POSITIONS: SwingPosition[] = [
  {
    id: 'p1',
    name: L('P1 · Address', 'P1 · Ansprache'),
    short: L('The starting position: forward bend, arms hanging, shaft to the ball.', 'Die Ausgangsstellung: Vorneigung, Arme hängen, Schaft zum Ball.'),
    photo: P(1),
    photoFront: F(1),
    look: [
      L(
        'The upper body bends forward from the hips with a straight back. The arms hang relaxed under the shoulders, the knees are slightly flexed. The shaft runs from the hands down to the ball, the ball sits in the middle of the clubface.',
        'Der Oberkörper ist aus der Hüfte nach vorn geneigt, der Rücken gerade. Die Arme hängen locker unter den Schultern, die Knie sind leicht gebeugt. Der Schaft läuft von den Händen schräg zum Ball, der Ball liegt mittig vor der Schlagfläche.',
      ),
    ],
    checks: [
      { k: 'body', v: L('Upper body bent forward about 35–40°, back straight', 'Oberkörper etwa 35–40° nach vorn geneigt, Rücken gerade') },
      { k: 'arms', v: L('Arms hang straight down from the shoulders, armpits about over the balls of the feet', 'Arme hängen senkrecht unter den Schultern, Achseln etwa über den Fußballen') },
      { k: 'feet', v: L('Knees slightly flexed, feet shoulder-width and parallel to the target line', 'Knie leicht gebeugt, Füße schulterbreit und parallel zur Ziellinie') },
      { k: 'weight', v: L('Weight even on both feet, on the balls of the feet', 'Gewicht gleich auf beiden Füßen, auf den Fußballen') },
      { k: 'shaft', v: L('Shaft about 55° to the ground, ball in the middle of the clubface', 'Schaft etwa 55° zum Boden, Ball mittig auf der Schlagfläche') },
    ],
    faults: [
      { name: L('Sitting', 'Sitzen'), fix: L('Too much knee flex and the seat too low – stand taller and bend from the hips instead.', 'Zu viel Kniebeuge, Gesäß zu tief – aufrechter stehen und stattdessen aus der Hüfte neigen.') },
      { name: L('Hips pushed towards the ball', 'Becken zum Ball geschoben'), fix: L('The back rounds and there is no room for the arms – push the seat back until the arms hang freely.', 'Der Rücken wird rund, die Arme haben keinen Platz – das Gesäß nach hinten schieben, bis die Arme frei hängen.') },
    ],
    drills: ['mirror-setup-full', 'alignment-station', 'ball-position-ladder'],
    fact: L('Picture a line touching your seat at address – it stays there until impact.', 'Stell dir bei der Ansprache eine Linie am Gesäß vor – dort bleibt es bis zum Treffmoment.'),
  },
  {
    id: 'p2',
    name: L('P2 · Shaft parallel (takeaway)', 'P2 · Schaft waagerecht (Rückschwung)'),
    short: L('The backswing starts as one piece: shoulders, arms and club together.', 'Der Rückschwung beginnt als Einheit: Schultern, Arme und Schläger zusammen.'),
    photo: P(2),
    photoFront: F(2),
    look: [
      L(
        'Shoulders, arms and club have moved together, the hands are low in front of the right thigh. From behind, the shaft points at the camera and hides behind the hands – you only see the small iron head right at the hands.',
        'Schultern, Arme und Schläger haben sich gemeinsam bewegt, die Hände sind tief vor dem rechten Oberschenkel. Von hinten zeigt der Schaft auf die Kamera und ist hinter den Händen verdeckt – man sieht nur den kleinen Eisenkopf direkt an den Händen.',
      ),
    ],
    checks: [
      { k: 'arms', v: L('Both arms long, the triangle of arms and shoulders stays', 'Beide Arme lang, das Dreieck aus Armen und Schultern bleibt') },
      { k: 'hands', v: L('Hands low, just below the belt in front of the right thigh', 'Hände tief, knapp unter dem Gürtel vor dem rechten Oberschenkel') },
      { k: 'shaft', v: L('Shaft parallel to the ground and to the target line – hidden from behind', 'Schaft waagerecht und parallel zur Ziellinie – von hinten verdeckt') },
      { k: 'face', v: L('Leading edge parallel to the spine, the toe not straight up', 'Vorderkante parallel zur Wirbelsäule, die Spitze nicht senkrecht nach oben') },
      { k: 'weight', v: L('Weight slightly to the right, the head stays still', 'Gewicht leicht nach rechts, der Kopf bleibt ruhig') },
    ],
    faults: [
      { name: L('Inside and shut', 'Zu weit innen und zu'), fix: L('The club is pulled behind the hands and the face closes – take it back with the shoulders, the club head outside the hands.', 'Der Schläger wird hinter die Hände gezogen und die Fläche schließt – mit den Schultern zurücknehmen, der Schlägerkopf außerhalb der Hände.') },
      { name: L('Lifting with the hands', 'Mit den Händen anheben'), fix: L('The arms bend and the club goes up too early – keep the arms long until the shaft is parallel.', 'Die Arme knicken ein, der Schläger geht zu früh nach oben – die Arme lang lassen, bis der Schaft waagerecht ist.') },
    ],
    drills: ['slow-motion', 'video-self'],
    open: 'Blatt bei P2: Spitze nach oben oder parallel zur Wirbelsäule? (Quellen uneinig) – Bild zeigt parallel zur Wirbelsäule.',
  },
  {
    id: 'p3',
    name: L('P3 · Lead arm parallel', 'P3 · Linker Arm waagerecht'),
    short: L('Lead arm straight and level, wrists set, the shaft on plane.', 'Linker Arm gestreckt und waagerecht, Handgelenke angewinkelt, der Schaft auf der Ebene.'),
    photo: P(3),
    photoFront: F(3),
    look: [
      L(
        'The lead arm is straight and level in front of the chest, the right elbow is bent and points down. The wrists are almost fully set.',
        'Der linke Arm ist gestreckt und waagerecht vor der Brust, der rechte Ellbogen gebeugt und zeigt nach unten. Die Handgelenke sind fast ganz angewinkelt.',
      ),
      L(
        'Ball, butt end, hands, right shoulder and club head lie on one line: the shaft points through the right shoulder, the butt end down at the ball.',
        'Ball, Griffende, Hände, rechte Schulter und Schlägerkopf liegen auf einer Linie: Der Schaft zeigt durch die rechte Schulter, das Griffende nach unten auf den Ball.',
      ),
    ],
    checks: [
      { k: 'arms', v: L('Lead arm straight and level, right elbow points down', 'Linker Arm gestreckt und waagerecht, rechter Ellbogen zeigt nach unten') },
      { k: 'hands', v: L('Hands in front of the chest, wrists almost fully set (arm and shaft about 90°)', 'Hände vor der Brust, Handgelenke fast voll angewinkelt (Arm und Schaft etwa 90°)') },
      { k: 'shaft', v: L('Shaft through the right shoulder, the butt end points at the ball', 'Schaft durch die rechte Schulter, das Griffende zeigt auf den Ball') },
      { k: 'face', v: L('Toe up, the leading edge at the angle of the back', 'Spitze oben, die Vorderkante im Winkel des Rückens') },
      { k: 'body', v: L('Shoulders turned about twice as far as the hips, weight on the inside of the right foot', 'Schultern etwa doppelt so weit gedreht wie die Hüfte, Gewicht auf der Innenseite des rechten Fußes') },
    ],
    faults: [
      { name: L('Too flat', 'Zu flach'), fix: L('The butt end points between the ball and your feet – the arms went too far around; swing them more up.', 'Das Griffende zeigt zwischen Ball und Füße – die Arme sind zu weit herumgegangen; mehr nach oben schwingen.') },
      { name: L('Too steep', 'Zu steil'), fix: L('The butt end points beyond the ball – the club was lifted; turn the shoulders more and let the arms follow.', 'Das Griffende zeigt über den Ball hinaus – der Schläger wurde angehoben; die Schultern mehr drehen und die Arme folgen lassen.') },
    ],
    drills: ['l-to-l', 'video-self', 'slow-motion'],
    fact: L('The butt end of the club points at the ball – that is "on plane".', 'Das Griffende zeigt auf den Ball – das heißt „auf der Ebene“.'),
    open: 'P3: Schaftende genau auf den Ball/die Ziellinie oder darf es knapp innerhalb liegen?',
  },
  {
    id: 'p4',
    name: L('P4 · Top of the backswing', 'P4 · Top'),
    short: L('Fully turned: shoulders about 90°, hips about 45°, the shaft towards the target.', 'Ganz gedreht: Schultern etwa 90°, Hüfte etwa 45°, der Schaft zum Ziel.'),
    photo: P(4),
    photoFront: F(4),
    look: [
      L(
        'The shoulders have turned about 90°, the hips about 45°, the forward bend is unchanged. The hands are high above the right shoulder, the lead arm runs straight across the chest, the right elbow points down. The shaft points at the target and shows only short from behind.',
        'Die Schultern haben sich etwa 90° gedreht, die Hüfte etwa 45°, die Vorneigung ist unverändert. Die Hände sind hoch über der rechten Schulter, der linke Arm läuft gestreckt quer vor der Brust, der rechte Ellbogen zeigt nach unten. Der Schaft zeigt zum Ziel und ist von hinten nur kurz zu sehen.',
      ),
    ],
    checks: [
      { k: 'body', v: L('Shoulders about 90°, hips about 45° turned, the forward bend stays', 'Schultern etwa 90°, Hüfte etwa 45° gedreht, die Vorneigung bleibt') },
      { k: 'arms', v: L('Lead arm straight, right elbow points down', 'Linker Arm gestreckt, rechter Ellbogen zeigt nach unten') },
      { k: 'hands', v: L('Lead wrist flat, the clubface parallel to the lead forearm', 'Linkes Handgelenk flach, die Schlagfläche parallel zum linken Unterarm') },
      { k: 'shaft', v: L('Shaft parallel to the target line – not across the line, not far left', 'Schaft parallel zur Ziellinie – nicht über die Linie, nicht weit nach links') },
      { k: 'feet', v: L('Right knee stays flexed, feet still parallel', 'Rechtes Knie bleibt gebeugt, Füße weiter parallel') },
    ],
    faults: [
      { name: L('Overswing', 'Überschwingen'), fix: L('The shaft goes far past parallel and the arms bend – a shorter, fully turned backswing hits the ball further.', 'Der Schaft geht weit über die Waagerechte, die Arme knicken – ein kürzerer, voll gedrehter Rückschwung trifft den Ball weiter.') },
      { name: L('Across the line', 'Über die Linie (across the line)'), fix: L('The shaft points right of the target – keep the right elbow down and the lead wrist flat.', 'Der Schaft zeigt rechts am Ziel vorbei – den rechten Ellbogen unten und das linke Handgelenk flach halten.') },
      { name: L('Straightening up', 'Aufrichten'), fix: L('The right leg straightens and the upper body comes up – keep the knee flexed and turn around the spine.', 'Das rechte Bein streckt sich und der Oberkörper kommt hoch – das Knie gebeugt lassen und um die Wirbelsäule drehen.') },
    ],
    drills: ['pause-top', 'cross-arms-turn'],
    open: 'P4: linker Arm auf oder unter der Schulterebene? Wie kurz der Schaft beim Eisen 7?',
  },
  {
    id: 'p5',
    name: L('P5 · Lead arm parallel (downswing)', 'P5 · Linker Arm waagerecht (Abschwung)'),
    short: L('The lower body leads, the hands lower than in the backswing, the shaft flatter.', 'Der Unterkörper führt, die Hände tiefer als im Rückschwung, der Schaft flacher.'),
    photo: P(5),
    photoFront: F(5),
    look: [
      L(
        'The lower body has started the downswing: the weight moves left, the hips open. The lead arm is level again, the hands are lower than at P3 and the wrists still set. The shaft is flatter than in the backswing.',
        'Der Unterkörper hat den Abschwung begonnen: Das Gewicht wandert nach links, die Hüfte dreht auf. Der linke Arm ist wieder waagerecht, die Hände sind tiefer als bei P3, die Handgelenke noch angewinkelt. Der Schaft ist flacher als im Rückschwung.',
      ),
    ],
    checks: [
      { k: 'body', v: L('The lower body leads, the weight moves onto the left foot', 'Der Unterkörper führt, das Gewicht wandert auf den linken Fuß') },
      { k: 'arms', v: L('Right elbow in front of the right hip, close to the body', 'Rechter Ellbogen vor der rechten Hüfte, nah am Körper') },
      { k: 'hands', v: L('Wrists still fully set', 'Handgelenke noch voll angewinkelt') },
      { k: 'shaft', v: L('Shaft flatter than at P3, about through the right forearm', 'Schaft flacher als bei P3, etwa durch den rechten Unterarm') },
      { k: 'feet', v: L('Forward bend and head height stay, the feet do not move', 'Vorneigung und Kopfhöhe bleiben, die Füße bewegen sich nicht') },
    ],
    faults: [
      { name: L('Casting', 'Werfen (Casting)'), fix: L('The wrists release too early and the club head overtakes the hands – let the body turn bring the arms down.', 'Die Handgelenke lösen sich zu früh, der Schlägerkopf überholt die Hände – die Drehung des Körpers bringt die Arme nach unten.') },
      { name: L('Over the top', 'Von oben (over the top)'), fix: L('The shoulders turn first and the shaft gets steep – start with the hips, the right elbow drops in front of the hip.', 'Die Schultern drehen zuerst, der Schaft wird steil – mit der Hüfte beginnen, der rechte Ellbogen fällt vor die Hüfte.') },
    ],
    drills: ['step-drill', 'slow-motion', 'headcover-outside'],
  },
  {
    id: 'p6',
    name: L('P6 · Shaft parallel (downswing)', 'P6 · Schaft waagerecht (Abschwung)'),
    short: L('Hips open, shoulders still square, the club head covers the hands.', 'Hüfte offen, Schultern noch square, der Schlägerkopf verdeckt die Hände.'),
    photo: P(6),
    photoFront: F(6),
    look: [
      L(
        'The hips are open, the shoulders still almost parallel to the target line. The hands are at hip height in front of the right thigh; from behind the shaft points at the camera again and hides – only the iron head shows right at the hands.',
        'Die Hüfte ist offen, die Schultern sind noch fast parallel zur Ziellinie. Die Hände sind auf Hüfthöhe vor dem rechten Oberschenkel; von hinten zeigt der Schaft wieder auf die Kamera und ist verdeckt – nur der Eisenkopf ist direkt an den Händen zu sehen.',
      ),
    ],
    checks: [
      { k: 'body', v: L('Hips open, shoulders still almost square', 'Hüfte offen, Schultern noch fast square') },
      { k: 'arms', v: L('Right elbow close to the body', 'Rechter Ellbogen am Körper') },
      { k: 'shaft', v: L('Shaft parallel, the club head covers the hands – neither behind nor in front of them', 'Schaft waagerecht, der Schlägerkopf verdeckt die Hände – weder dahinter noch davor') },
      { k: 'face', v: L('Leading edge about parallel to the spine', 'Vorderkante etwa parallel zur Wirbelsäule') },
      { k: 'feet', v: L('The seat stays at the line from P1', 'Das Gesäß bleibt an der Linie von P1') },
    ],
    faults: [
      { name: L('Stuck', 'Stuck (Schläger hängt hinten)'), fix: L('The club head is behind the hands and the ball goes right – keep turning the chest, the arms stay in front of the body.', 'Der Schlägerkopf ist hinter den Händen, der Ball geht rechts – die Brust weiterdrehen, die Arme bleiben vor dem Körper.') },
      { name: L('Early extension', 'Early Extension (Becken schiebt nach vorn)'), fix: L('The hips push towards the ball and the upper body comes up – keep the seat at the line, turn instead of pushing.', 'Das Becken schiebt zum Ball, der Oberkörper richtet sich auf – das Gesäß an der Linie lassen, drehen statt schieben.') },
    ],
    drills: ['headcover-outside', 'split-grip', 'slow-motion'],
    open: 'P6: Wohin zeigt das Schaftende (Ball, zwischen Ball und Fußspitzen, Ziellinie)? Keine Quelle gefunden.',
  },
  {
    id: 'p7',
    name: L('P7 · Impact', 'P7 · Treffmoment'),
    short: L('Hips open, hands ahead of the ball, ball first then turf.', 'Hüfte offen, Hände vor dem Ball, erst Ball, dann Boden.'),
    photo: P(7),
    photoFront: F(7),
    look: [
      L(
        'The hips are clearly open, the belt buckle turns to the target, the right heel lifts a little. The hands are slightly ahead of the ball and a little higher than at address. The shaft runs from the hands to the ball, the ball sits in the middle of the clubface.',
        'Die Hüfte ist deutlich offen, die Gürtelschnalle dreht zum Ziel, die rechte Ferse hebt leicht ab. Die Hände sind etwas vor dem Ball und etwas höher als bei der Ansprache. Der Schaft läuft von den Händen zum Ball, der Ball sitzt mittig auf der Schlagfläche.',
      ),
    ],
    checks: [
      { k: 'body', v: L('Hips about 30–40° open, weight mostly left', 'Hüfte etwa 30–40° offen, Gewicht überwiegend links') },
      { k: 'hands', v: L('Hands ahead of the ball, lead wrist flat', 'Hände vor dem Ball, linkes Handgelenk flach') },
      { k: 'shaft', v: L('Shaft a little steeper than at P1, the hands a little higher', 'Schaft etwas steiler als bei P1, die Hände etwas höher') },
      { k: 'contact', v: L('Ball first, then turf – the ball in the middle of the face', 'Erst Ball, dann Boden – der Ball mittig auf der Fläche') },
      { k: 'feet', v: L('Forward bend stays, the seat at the line', 'Vorneigung bleibt, das Gesäß an der Linie') },
    ],
    faults: [
      { name: L('Flip', 'Flip (Handgelenk knickt)'), fix: L('The right hand overtakes and the lead wrist bends – lead with the hands, the lead wrist flat through the ball.', 'Die rechte Hand überholt, das linke Handgelenk knickt – mit den Händen führen, das linke Handgelenk flach durch den Ball.') },
      { name: L('Hips not open', 'Hüfte zu wenig offen'), fix: L('The hips stop and the arms have to save the shot – keep turning the hips through the ball.', 'Die Hüfte bleibt stehen, die Arme müssen den Schlag retten – die Hüfte durch den Ball weiterdrehen.') },
    ],
    drills: ['impact-bag', 'towel-behind', 'line-drill-irons'],
    fact: L('Two of three amateurs lose their forward bend before impact (early extension) – tour players almost never.', 'Zwei von drei Amateuren verlieren vor dem Treffmoment ihre Vorneigung (Early Extension) – Tour-Spieler fast nie.'),
    open: 'P7: Schultern square oder etwa 30° offen (Sportsbox)?',
  },
  {
    id: 'p8',
    name: L('P8 · Shaft parallel (follow-through)', 'P8 · Schaft waagerecht (Durchschwung)'),
    short: L('Just after impact: turned to the target, still bent forward, arms extended.', 'Kurz nach dem Treffmoment: zum Ziel gedreht, weiter geneigt, Arme gestreckt.'),
    photo: P(8),
    photoFront: F(8),
    look: [
      L(
        'Hips and chest have turned to the target, from behind you see his back. The forward bend is still there, the head at the same height as at impact. Both arms are extended towards the target, the right heel is up and the right foot stands on its toe.',
        'Hüfte und Brust haben sich zum Ziel gedreht, von hinten sieht man den Rücken. Die Vorneigung ist noch da, der Kopf auf derselben Höhe wie im Treffmoment. Beide Arme sind gestreckt Richtung Ziel, die rechte Ferse ist hoch, der rechte Fuß steht auf der Spitze.',
      ),
    ],
    checks: [
      { k: 'body', v: L('No standing up: back still bent, head at its height from impact', 'Kein Aufrichten: Rücken weiter geneigt, Kopf auf der Höhe wie im Treffmoment') },
      { k: 'arms', v: L('Both arms extended towards the target', 'Beide Arme gestreckt Richtung Ziel') },
      { k: 'feet', v: L('Right foot on its toe, the knees come together', 'Rechter Fuß auf der Spitze, die Knie nähern sich') },
      { k: 'shaft', v: L('Shaft parallel, pointing to the target', 'Schaft waagerecht, zeigt zum Ziel') },
    ],
    faults: [
      { name: L('Standing up right after the ball', 'Aufrichten direkt nach dem Ball'), fix: L('The upper body comes up and the arms pull in – stay bent over until the arms are extended.', 'Der Oberkörper kommt hoch, die Arme ziehen sich ein – geneigt bleiben, bis die Arme gestreckt sind.') },
      { name: L('Chicken wing', 'Chicken Wing (linker Arm knickt)'), fix: L('The lead elbow bends and points to the target – both arms long, the forearms rotate.', 'Der linke Ellbogen knickt und zeigt zum Ziel – beide Arme lang, die Unterarme drehen.') },
    ],
    drills: ['l-to-l', 'split-grip'],
  },
  {
    id: 'p9',
    name: L('P9 · Trail arm parallel', 'P9 · Rechter Arm waagerecht'),
    short: L('Full extension: both arms straight to the upper left, the body still bent.', 'Volle Streckung: beide Arme gestreckt nach oben links, der Körper noch geneigt.'),
    photo: P(9),
    photoFront: F(9),
    look: [
      L(
        'Both arms are straight and point up and to the left towards the target, the wrists start to set again. The upper body is still bent forward – it only comes up in the finish. The shaft continues the line of the arms upwards.',
        'Beide Arme sind gestreckt und zeigen nach oben links Richtung Ziel, die Handgelenke winkeln wieder an. Der Oberkörper ist noch nach vorn geneigt – erst im Finish richtet er sich auf. Der Schaft verlängert die Linie der Arme nach oben.',
      ),
    ],
    checks: [
      { k: 'arms', v: L('Both arms straight, the hands about at head height', 'Beide Arme gestreckt, die Hände etwa auf Kopfhöhe') },
      { k: 'body', v: L('Upper body still bent, the head still low', 'Oberkörper noch geneigt, der Kopf noch tief') },
      { k: 'shaft', v: L('Shaft continues the arms to the upper left', 'Schaft verlängert die Arme nach oben links') },
      { k: 'feet', v: L('Weight almost all left, right foot on its toe', 'Gewicht fast ganz links, rechter Fuß auf der Spitze') },
    ],
    faults: [
      { name: L('Arms collapse early', 'Arme knicken früh ein'), fix: L('The extension is missing and the ball loses speed – swing through to the target with long arms.', 'Die Streckung fehlt, der Ball verliert Tempo – mit langen Armen zum Ziel durchschwingen.') },
      { name: L('Coming up too early', 'Zu früh aufrichten'), fix: L('The body stands up before the arms are extended – stay in the posture until P9.', 'Der Körper richtet sich auf, bevor die Arme gestreckt sind – bis P9 in der Haltung bleiben.') },
    ],
    drills: ['l-to-l', 'hold-finish'],
  },
  {
    id: 'p10',
    name: L('P10 · Finish', 'P10 · Finish'),
    short: L('Fully turned, tall and in balance on the lead foot.', 'Ganz durchgedreht, aufrecht und im Gleichgewicht auf dem linken Fuß.'),
    photo: P(10),
    photoFront: F(10),
    look: [
      L(
        'The body has turned through, chest and belt buckle face the target. The player stands tall and balanced on the lead foot, the sole of the right shoe faces the camera. The hands are at head height, the shaft lies almost level behind the neck.',
        'Der Körper ist ganz durchgedreht, Brust und Gürtelschnalle zeigen zum Ziel. Der Spieler steht aufrecht und im Gleichgewicht auf dem linken Fuß, die rechte Sohle zeigt zur Kamera. Die Hände sind auf Kopfhöhe, der Schaft liegt fast waagerecht hinter dem Nacken.',
      ),
    ],
    checks: [
      { k: 'body', v: L('Tall and in balance – hold it for three seconds', 'Aufrecht und im Gleichgewicht – drei Sekunden halten') },
      { k: 'feet', v: L('Almost all the weight left, right foot on its toe', 'Fast das ganze Gewicht links, rechter Fuß auf der Spitze') },
      { k: 'arms', v: L('Elbows bent, the hands at head height', 'Ellbogen gebeugt, die Hände auf Kopfhöhe') },
      { k: 'shaft', v: L('Shaft behind the neck, almost level', 'Schaft hinter dem Nacken, fast waagerecht') },
    ],
    faults: [
      { name: L('Out of balance', 'Kein Gleichgewicht'), fix: L('A step forward or back after the shot – swing at 80 % and hold the finish.', 'Ein Schritt nach vorn oder hinten nach dem Schlag – mit 80 % schwingen und das Finish halten.') },
      { name: L('Weight stays back', 'Gewicht bleibt rechts'), fix: L('Leaning back, the right foot flat – the right knee goes to the left knee.', 'Rückenlage, der rechte Fuß bleibt flach – das rechte Knie geht zum linken.') },
    ],
    drills: ['hold-finish', 'feet-together-swing'],
  },
];

export const psystem: Category = {
  id: 'psystem',
  name: L('Basic swing (P system)', 'Grundschwung (P-System)'),
  short: L('The ten positions of the full swing from behind – what they look like and how you check them.', 'Die zehn Positionen des vollen Schwungs von hinten – wie sie aussehen und woran du sie prüfst.'),
  intro: L(
    "The full swing can be split into ten positions, the P system (after Mac O'Grady). Each one is a still you can compare your own swing with on video – filmed from behind on the target line (\"down the line\"). Shown is a right-hander with a 7-iron. Chips, pitches and every other shot build on this basic swing.",
    'Der volle Schwung lässt sich in zehn Positionen zerlegen, das P-System (nach Mac O’Grady). Jede ist ein Standbild, mit dem du deinen eigenen Schwung im Video vergleichen kannst – gefilmt von hinten auf der Ziellinie („Down the Line“). Gezeigt ist ein Rechtshänder mit einem Eisen 7. Chips, Pitches und alle anderen Schläge bauen auf diesem Grundschwung auf.',
  ),
  facts: [
    L('Film yourself from behind at hand height, exactly on the target line – only then do the lines fit.', 'Filme dich von hinten auf Handhöhe, genau auf der Ziellinie – nur dann passen die Linien.'),
    L('Backswing P1–P4, downswing P5–P7, follow-through P8–P10.', 'Rückschwung P1–P4, Abschwung P5–P7, Durchschwung P8–P10.'),
    L('The feet do not move until impact – only the right heel lifts after it.', 'Die Füße bewegen sich bis zum Treffmoment nicht – erst danach hebt die rechte Ferse ab.'),
  ],
  sections: [],
  positions: PSYSTEM_POSITIONS,
  sources: [
    { label: 'HackMotion – Golf Swing Positions Explained', url: 'https://hackmotion.com/golf-swing-positions/' },
    { label: 'Golf Insider UK – Golf Swing Positions', url: 'https://golfinsideruk.com/golf-swing-positions/' },
    { label: 'The DIY Golfer – Golf Swing Plane', url: 'https://www.thediygolfer.com/golf-swing-plane' },
    { label: 'GOLFTEC – Address Position Basics', url: 'https://academy.golftec.com/app/lessons/address-position-basics' },
    { label: 'TPI – Early Extension', url: 'https://www.mytpi.com/articles/swing/early-extension-swing-characteristic' },
    { label: 'Golf Digest – Sportsbox AI SwingFacts', url: 'https://www.australiangolfdigest.com.au/useful-golf-swingfacts-sportsbox-ai-graph' },
  ],
  see: ['swing', 'basics', 'irons'],
};
