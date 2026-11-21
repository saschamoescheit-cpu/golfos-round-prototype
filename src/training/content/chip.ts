import { L, type SwingPosition } from '../types';

// The standard chip as a photo series (Sascha 21.11.2026, mockup B): four positions, C1–C4, from behind and from the
// front – the same golfer and studio as the basic swing (features/040-neutraler-schwung), a right-hander with a
// pitching wedge gripped about 5 cm down. Values: the common teaching standard of the shot (content/shots.ts); our pro
// confirms them on his chip page (CODE chip …).

const C = (n: number) => `chip/c${n}.jpg`;
const F = (n: number) => `chip/fo-c${n}.jpg`;
const OPEN = 'Chris: Chip-Seite (CODE chip …)';

export const CHIP_POSITIONS: SwingPosition[] = [
  {
    id: 'c1',
    name: L('C1 · Address', 'C1 · Ansprache'),
    short: L('Narrow, weight on the lead foot, hands ahead of the ball.', 'Schmal, Gewicht vorn, Hände vor dem Ball.'),
    photo: C(1),
    photoFront: F(1),
    look: [
      L(
        'A narrow, slightly open stance close to the ball. Most of the weight is on the lead foot, the hands are in front of the lead thigh – ahead of the ball, so the shaft leans a little towards the target. The ball is in the middle or slightly back.',
        'Ein schmaler, leicht offener Stand nah am Ball. Das meiste Gewicht ist auf dem vorderen Fuß, die Hände sind vor dem vorderen Oberschenkel – vor dem Ball, der Schaft neigt sich leicht zum Ziel. Der Ball liegt in der Mitte oder leicht zurück.',
      ),
    ],
    checks: [
      { k: 'feet', v: L('Heels about 15 cm apart, lead foot turned out about 20°, stance slightly open', 'Fersen etwa 15 cm auseinander, vorderer Fuß etwa 20° aufgedreht, Stand leicht offen') },
      { k: 'weight', v: L('60–70 % on the lead foot', '60–70 % auf dem vorderen Fuß') },
      { k: 'hands', v: L('About 5 cm down the grip, hands in front of the lead thigh', 'Etwa 5 cm kürzer gegriffen, Hände vor dem vorderen Oberschenkel') },
      { k: 'shaft', v: L('Leans about 10° towards the target, ball in the middle or slightly back', 'Etwa 10° zum Ziel geneigt, Ball in der Mitte oder leicht zurück') },
      { k: 'face', v: L('Square to the target, the sole rests on the grass', 'Square zum Ziel, die Sohle liegt auf dem Gras') },
    ],
    faults: [
      { name: L('Ball too far forward', 'Ball zu weit vorn'), fix: L('The club reaches the ground before the ball – ball in the middle, hands ahead of it.', 'Der Schläger kommt vor dem Ball auf den Boden – Ball in die Mitte, Hände davor.') },
      { name: L('Weight on the trail foot', 'Gewicht hinten'), fix: L('The low point moves behind the ball – weight on the lead foot before you start.', 'Der tiefste Punkt wandert hinter den Ball – vor dem Start das Gewicht auf den vorderen Fuß.') },
    ],
    drills: ['trail-toe'],
    open: OPEN,
  },
  {
    id: 'c2',
    name: L('C2 · End of the backswing', 'C2 · Ende Rückschwung'),
    short: L('Only the shoulders rock: hands at the trail thigh, wrists quiet.', 'Nur die Schultern schaukeln: Hände am hinteren Oberschenkel, Handgelenke ruhig.'),
    photo: C(2),
    photoFront: F(2),
    look: [
      L(
        'The shoulders have rocked back, arms and club moved with them as one piece. The hands are in front of the trail thigh, the wrists hardly hinged, the club head about 40 cm above the grass. The legs stay still and the weight stays on the lead foot.',
        'Die Schultern haben zurückgeschaukelt, Arme und Schläger sind als Einheit mitgegangen. Die Hände sind vor dem hinteren Oberschenkel, die Handgelenke kaum gewinkelt, der Schlägerkopf etwa 40 cm über dem Gras. Die Beine bleiben ruhig, das Gewicht bleibt vorn.',
      ),
    ],
    checks: [
      { k: 'body', v: L('The shoulders rock, the lower body stays still', 'Die Schultern schaukeln, der Unterkörper bleibt ruhig') },
      { k: 'arms', v: L('The triangle of arms and shoulders stays', 'Das Dreieck aus Armen und Schultern bleibt') },
      { k: 'hands', v: L('In front of the trail thigh, the wrists hardly hinged', 'Vor dem hinteren Oberschenkel, die Handgelenke kaum gewinkelt') },
      { k: 'shaft', v: L('Club head about 40 cm above the grass', 'Schlägerkopf etwa 40 cm über dem Gras') },
      { k: 'face', v: L('Square to the arc: the toe points up and slightly forward', 'Square zum Bogen: Die Spitze zeigt nach oben und leicht nach vorn') },
      { k: 'weight', v: L('Stays on the lead foot', 'Bleibt auf dem vorderen Fuß') },
    ],
    faults: [
      { name: L('Wrists hinge', 'Handgelenke winkeln'), fix: L('The club head races ahead and the contact varies – arms and club go back together.', 'Der Schlägerkopf eilt voraus, der Treffer schwankt – Arme und Schläger gehen zusammen zurück.') },
      { name: L('Weight moves back', 'Gewicht geht nach hinten'), fix: L('The low point moves behind the ball – the lead foot keeps the weight the whole stroke.', 'Der tiefste Punkt wandert hinter den Ball – der vordere Fuß behält das Gewicht den ganzen Schlag.') },
    ],
    drills: ['stick-lead-arm'],
    open: OPEN,
  },
  {
    id: 'c3',
    name: L('C3 · Impact', 'C3 · Treffmoment'),
    short: L('Hands ahead, the club brushes the grass.', 'Hände vorn, der Schläger streift das Gras.'),
    photo: C(3),
    photoFront: F(3),
    look: [
      L(
        'The hands are ahead of the ball again, the lead wrist flat, the shaft leans to the target as at address. The club brushes the grass under the ball, the ball starts low. The belt buckle has turned a little to the target.',
        'Die Hände sind wieder vor dem Ball, das vordere Handgelenk gerade, der Schaft neigt sich wie bei der Ansprache zum Ziel. Der Schläger streift das Gras unter dem Ball, der Ball startet flach. Die Gürtelschnalle hat sich leicht zum Ziel gedreht.',
      ),
    ],
    checks: [
      { k: 'hands', v: L('Ahead of the ball, the lead wrist flat', 'Vor dem Ball, das vordere Handgelenk gerade') },
      { k: 'shaft', v: L('Leans to the target as at address', 'Neigt sich wie bei der Ansprache zum Ziel') },
      { k: 'contact', v: L('Ball first, the club brushes the grass', 'Erst der Ball, der Schläger streift das Gras') },
      { k: 'body', v: L('Belt buckle turned slightly to the target', 'Gürtelschnalle leicht zum Ziel gedreht') },
      { k: 'weight', v: L('About 70 % on the lead foot', 'Etwa 70 % auf dem vorderen Fuß') },
    ],
    faults: [
      { name: L('Scooping', 'Schaufeln'), fix: L('The lead wrist bends to lift the ball – thin or fat. The loft lifts the ball: the grip leads.', 'Das vordere Handgelenk knickt, um den Ball zu heben – getoppt oder fett. Der Loft hebt den Ball: Der Griff führt.') },
      { name: L('Slowing down', 'Abbremsen'), fix: L('A long backswing and then braking – shorter back, gently accelerating through.', 'Langer Rückschwung, dann bremsen – kürzer zurück, sanft beschleunigt durch.') },
    ],
    drills: ['chip-line'],
    open: OPEN,
  },
  {
    id: 'c4',
    name: L('C4 · Finish', 'C4 · Finish'),
    short: L('As long as the backswing, the lead wrist still flat.', 'So lang wie der Rückschwung, das vordere Handgelenk noch gerade.'),
    photo: C(4),
    photoFront: F(4),
    look: [
      L(
        'The finish is about as long as the backswing. The hands are in front of the lead hip, the lead arm and the shaft form one line – nothing has flipped. The club face points to the target and a little to the sky, the trail foot is still on the ground.',
        'Das Finish ist etwa so lang wie der Rückschwung. Die Hände sind vor der vorderen Hüfte, vorderer Arm und Schaft bilden eine Linie – nichts ist abgeklappt. Die Schlagfläche zeigt zum Ziel und leicht zum Himmel, der hintere Fuß steht noch am Boden.',
      ),
    ],
    checks: [
      { k: 'arms', v: L('Lead arm and shaft in one line', 'Vorderer Arm und Schaft in einer Linie') },
      { k: 'hands', v: L('In front of the lead hip', 'Vor der vorderen Hüfte') },
      { k: 'shaft', v: L('Club head about 40 cm high – as long as the backswing', 'Schlägerkopf etwa 40 cm hoch – so lang wie der Rückschwung') },
      { k: 'face', v: L('To the target and slightly to the sky', 'Zum Ziel und leicht zum Himmel') },
      { k: 'feet', v: L('The trail foot stays on the ground', 'Der hintere Fuß bleibt am Boden') },
    ],
    faults: [
      { name: L('Flipping', 'Abklappen'), fix: L('The club head passes the hands – keep the lead wrist flat into the finish.', 'Der Schlägerkopf überholt die Hände – das vordere Handgelenk bis ins Finish gerade halten.') },
      { name: L('No finish', 'Kein Finish'), fix: L('The club stops at the ball – the finish as long as the backswing.', 'Der Schläger bleibt am Ball stehen – das Finish so lang wie der Rückschwung.') },
    ],
    drills: ['stick-lead-arm', 'landing-ring'],
    open: OPEN,
  },
];
