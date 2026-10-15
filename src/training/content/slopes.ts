import { L, type Category, type Drill, type Sketch } from '../types';

// Uneven lies. Sources: golf.com (Brech Spradley guide to uneven lies; “master any lie”), Practical Golf (balance
// first), GolfTEC (wider stance, more knee flex below the feet), TPI (ball above/below feet), Golf.de (Peter Koenig:
// Hanglagen), GOLFSTUN.DE (alle vier Hanglagen). Directions for right-handed players.

// sidehill lies: seen from behind the player (profile, the ball in front of the feet);
// uphill/downhill: seen from the front (the ball between the feet, the target to the right)
const lie = (kind: 'side' | 'front', ground: [number, number][], caption: { en: string; de: string }, flight?: [number, number][]): Sketch => {
  const yAt = (x: number) => ground[0][1] + ((ground[1][1] - ground[0][1]) * x) / 6;
  const tilt = kind === 'front' ? (Math.atan2(ground[1][1] - ground[0][1], 6) * 180) / Math.PI : 0;
  const fx = kind === 'front' ? 2.2 : 1.6;
  const bx = kind === 'front' ? 2.2 : 2.25;
  return {
    view: 'side',
    w: 6,
    h: 3.2,
    items: [
      { k: 'ground', pts: ground },
      { k: 'figure', at: [fx, yAt(fx)], tilt, pose: kind === 'front' ? 'front' : 'address' },
      { k: 'ball', at: [bx, yAt(bx)] },
      ...(flight ? [{ k: 'flight' as const, pts: flight, dashed: true }] : []),
    ],
    caption,
  };
};

export const slopes: Category = {
  id: 'slopes',
  name: L('Uneven lies', 'Hanglagen'),
  short: L('Ball above or below the feet, uphill and downhill – set-up and aim change.', 'Ball über oder unter den Füßen, bergauf und bergab – Ansprache und Zielen ändern sich.'),
  intro: L(
    'Apart from the tee, you almost never play from a flat lie. On a slope the ground changes your posture, your balance and the flight of the ball. The good news: the rules are simple and always the same. Adapt your body to the slope, swing at about 80 % to keep your balance, and allow for the curve the slope puts on the ball. Balance matters more than any other adjustment.',
    'Außer am Abschlag spielst du fast nie von ebenem Boden. Im Hang verändert der Boden deine Haltung, dein Gleichgewicht und den Flug des Balls. Die gute Nachricht: Die Regeln sind einfach und immer gleich. Pass deinen Körper an den Hang an, schwing mit etwa 80 %, um im Gleichgewicht zu bleiben, und plane die Kurve ein, die der Hang dem Ball gibt. Das Gleichgewicht ist wichtiger als jede andere Anpassung.',
  ),
  facts: [
    L('Ball above the feet: the ball curves left (draw/hook) and tends to be hit heavy. Ball below the feet: the ball curves right (fade/slice) – the hardest lie for most amateurs.', 'Ball über den Füßen: Der Ball dreht nach links (Draw/Hook) und wird gern fett getroffen. Ball unter den Füßen: Der Ball dreht nach rechts (Fade/Slice) – für die meisten Amateure die schwerste Lage.'),
    L('Uphill the ball flies higher and shorter – often one or two clubs more. Downhill it flies lower and rolls further – often one club less.', 'Bergauf fliegt der Ball höher und kürzer – oft ein bis zwei Schläger mehr. Bergab fliegt er flacher und rollt weiter – oft ein Schläger weniger.'),
    L('The steeper the slope and the more loft the club has, the more the ball curves on sidehill lies.', 'Je steiler der Hang und je mehr Loft der Schläger hat, desto stärker dreht der Ball bei seitlichen Hanglagen.'),
    L('A practice swing tells you where the club touches the ground – put the ball there.', 'Ein Probeschwung zeigt dir, wo der Schläger den Boden berührt – dort gehört der Ball hin.'),
  ],
  sections: [
    {
      title: L('Ball above the feet', 'Ball über den Füßen'),
      points: [
        L('Grip down the club (1–3 cm, more on steep slopes) – the ground is closer.', 'Den Schläger kürzer greifen (1–3 cm, im steilen Hang mehr) – der Boden ist näher.'),
        L('Stand a little taller, weight towards the balls of the feet.', 'Etwas aufrechter stehen, Gewicht Richtung Fußballen.'),
        L('Aim right of the target – the ball will curve left.', 'Rechts vom Ziel zielen – der Ball dreht nach links.'),
        L('A flatter, rounder swing; take one club more because you grip down.', 'Ein flacherer, runderer Schwung; einen Schläger mehr, weil du kürzer greifst.'),
      ],
      sketch: lie('side', [[0, 0.3], [6, 1.6]], L('Ball above the feet (seen from behind): grip down, aim right.', 'Ball über den Füßen (von hinten gesehen): kürzer greifen, rechts zielen.')),
    },
    {
      title: L('Ball below the feet', 'Ball unter den Füßen'),
      points: [
        L('Wider stance, more knee flex – “sit” closer to the ball and stay down through impact.', 'Breiterer Stand, mehr Kniebeugung – näher an den Ball „setzen“ und durch den Treffmoment unten bleiben.'),
        L('Weight towards the heels, hold the full length of the club.', 'Gewicht Richtung Fersen, den Schläger in voller Länge greifen.'),
        L('Aim left of the target – the ball will curve right.', 'Links vom Ziel zielen – der Ball dreht nach rechts.'),
        L('Swing at 70–80 % with a quiet lower body; often one club more.', 'Mit 70–80 % schwingen, ruhiger Unterkörper; oft ein Schläger mehr.'),
      ],
      sketch: lie('side', [[0, 1.6], [6, 0.3]], L('Ball below the feet (seen from behind): more knee flex, aim left.', 'Ball unter den Füßen (von hinten gesehen): mehr Kniebeugung, links zielen.')),
    },
    {
      title: L('Uphill lie', 'Bergauflage'),
      points: [
        L('Shoulders parallel to the slope (lead shoulder higher); more weight on the trail (downhill) foot.', 'Schultern parallel zum Hang (vordere Schulter höher); mehr Gewicht auf dem hinteren (tieferen) Fuß.'),
        L('Ball slightly forward of the normal position.', 'Ball etwas weiter vorn als normal.'),
        L('One or two clubs more – the slope adds loft; aim a little right (the ball tends to go left).', 'Ein bis zwei Schläger mehr – der Hang fügt Loft hinzu; etwas rechts zielen (der Ball geht gern nach links).'),
        L('Swing up the slope; let the follow-through be shorter.', 'Den Hang hinauf schwingen; das Durchschwingen darf kürzer sein.'),
      ],
      sketch: lie('front', [[0, 0.3], [6, 1.8]], L('Uphill (seen from the front): body along the slope, more club.', 'Bergauf (von vorn gesehen): Körper entlang des Hangs, mehr Schläger.'), [[2.3, 0.95], [3.8, 3.1], [5.4, 1.75]]),
    },
    {
      title: L('Downhill lie', 'Bergablage'),
      points: [
        L('Shoulders parallel to the slope (lead shoulder lower); weight on the lead (downhill) foot.', 'Schultern parallel zum Hang (vordere Schulter tiefer); Gewicht auf dem vorderen (tieferen) Fuß.'),
        L('Ball slightly back of the normal position.', 'Ball etwas weiter hinten als normal.'),
        L('Take more loft – the slope removes loft; the ball flies lower and runs. Aim a little left (it tends to go right).', 'Mehr Loft nehmen – der Hang nimmt Loft weg; der Ball fliegt flacher und rollt. Etwas links zielen (er geht gern nach rechts).'),
        L('Follow the slope down after impact – “chase the ball down the hill”.', 'Nach dem Treffmoment dem Hang nach unten folgen – „dem Ball den Hang hinunter nachlaufen“.'),
      ],
      sketch: lie('front', [[0, 1.8], [6, 0.3]], L('Downhill (seen from the front): weight forward, chase down the slope.', 'Bergab (von vorn gesehen): Gewicht vorn, dem Hang nach unten folgen.'), [[2.3, 1.3], [4.0, 2.0], [5.9, 0.4]]),
    },
    {
      title: L('Combined slopes and the short game', 'Kombinierte Hänge und das kurze Spiel'),
      points: [
        L('On combined slopes (e.g. uphill and ball below the feet) add the effects: here the ball flies high and goes right – often they cancel each other.', 'Bei kombinierten Hängen (z. B. bergauf und Ball unter den Füßen) addieren sich die Effekte: Hier fliegt der Ball hoch und nach rechts – oft heben sie sich teilweise auf.'),
        L('Chips and pitches from a slope: same rules, plus – uphill the ball stops quickly, downhill it runs a lot.', 'Chips und Pitches aus dem Hang: dieselben Regeln, außerdem – bergauf bleibt der Ball schnell liegen, bergab rollt er viel.'),
        L('When in doubt: lay up to a flat spot instead of forcing a long club from a steep slope.', 'Im Zweifel: auf eine flache Stelle vorlegen, statt aus einem steilen Hang einen langen Schläger zu erzwingen.'),
      ],
    },
  ],
  faults: [
    {
      name: L('Losing balance', 'Gleichgewicht verlieren'),
      looks: L('You fall down the slope during or after the swing.', 'Du fällst während oder nach dem Schwung den Hang hinunter.'),
      cause: L('Swinging at 100 %, stance not adapted.', 'Mit 100 % geschwungen, Stand nicht angepasst.'),
      fix: L('80 % swing, wider stance, hold the finish for 3 seconds.', '80-%-Schwung, breiterer Stand, Finish 3 Sekunden halten.'),
      drills: ['hold-finish-slope', 'four-lies-circuit'],
    },
    {
      name: L('Fat shots on uphill lies and above the feet', 'Fette Schläge bergauf und über den Füßen'),
      looks: L('The club digs into the slope.', 'Der Schläger gräbt sich in den Hang.'),
      cause: L('Not gripping down, weight falling back, ball too far back.', 'Nicht kürzer gegriffen, Gewicht fällt zurück, Ball zu weit hinten.'),
      fix: L('Practice swing to find the low point; grip down.', 'Probeschwung, um den tiefsten Punkt zu finden; kürzer greifen.'),
      drills: ['brush-find', 'four-lies-circuit'],
    },
    {
      name: L('Thin and right from below the feet', 'Dünn und rechts unter den Füßen'),
      looks: L('Topped or a weak slice.', 'Getoppt oder ein schwacher Slice.'),
      cause: L('Standing up during the swing.', 'Während des Schwungs aufgerichtet.'),
      fix: L('More knee flex, stay down, aim left.', 'Mehr Kniebeugung, unten bleiben, links zielen.'),
      drills: ['below-feet-stay', 'aim-for-slope'],
    },
  ],
  videos: [
    { id: 'Ufp6j_vIIpk', title: 'Alle vier Hanglagen beim Golf – bergauf, bergab, Ball unter bzw. über den Füßen', channel: 'GOLFSTUN.DE', lang: 'de' },
    { id: 'wIdKL7v7hmk', title: 'Golf Training Hanglage: Die Bergauflage', channel: 'Golf.de', lang: 'de' },
    { id: 'Q0XXzbpj0mc', title: 'Golf Training Hanglage: Die Bergablage', channel: 'Golf.de', lang: 'de' },
    { id: '2jkum70WgLc', title: 'Golf Training Hanglage: Stand über dem Ball', channel: 'Golf.de', lang: 'de' },
    { id: 'ptGKpaVW_mY', title: 'How to play the 4 slopey lies', channel: 'ProGolfGals', lang: 'en' },
    { id: 'Ma3CVK5QNNw', title: 'How to Hit It Pure When the Ball is Above or Below Your Feet', channel: 'Titleist', lang: 'en' },
    { id: 'vWZvqBnDkEE', title: 'Keys to Playing the Ball Above and Below Your Feet', channel: 'TPI – Titleist Performance Institute', lang: 'en' },
    { id: 'WxMeuv7p1wc', title: 'How to master playing from slopes in the short game', channel: 'Dan Grieve', lang: 'en' },
    { id: 'kdKSkou7H-I', title: 'Bergab-Pitch aus der Hanglage', channel: 'Golf.de', lang: 'de' },
  ],
  sources: [
    { label: 'golf.com – guide to navigating uneven lies (Brech Spradley)', url: 'https://golf.com/instruction/approach-shots/guide-navigating-uneven-lies-brech-spradley/' },
    { label: 'golf.com – master any lie with our comprehensive guide', url: 'https://golf.com/instruction/master-any-lie-with-our-comprehensive-guide/' },
    { label: 'Practical Golf – how to play uneven lies', url: 'https://practical-golf.com/how-to-play-uneven-lies-golf-course' },
    { label: 'GolfTEC – solid contact on uneven lies', url: 'https://golftec.com/video/how-do-you-hit-solid-contact-on-uneven-lies-in-golf' },
  ],
  see: ['trouble', 'strategy', 'irons'],
};

export const slopesDrills: Drill[] = [
  {
    id: 'four-lies-circuit',
    cat: 'slopes',
    name: L('Four lies circuit', 'Vier-Lagen-Zirkel'),
    goal: L('Five balls from each slope – set-up, aim and club as per the rules.', 'Fünf Bälle aus jeder Hanglage – Ansprache, Zielen und Schläger nach den Regeln.'),
    level: 2,
    minutes: 25,
    place: 'course',
    balls: 20,
    needs: [L('a slope on the range, the short-game area or the course in a quiet hour', 'einen Hang auf der Range, im Kurzspielbereich oder auf dem Platz in ruhiger Stunde')],
    setup: L('Find a mound where you can stand above, below, uphill and downhill of the ball. A target 60–120 m away.', 'Such einen Hügel, an dem du über, unter, bergauf und bergab vom Ball stehen kannst. Ein Ziel in 60–120 m.'),
    steps: [
      L('Ball above the feet: grip down, aim right – 5 balls.', 'Ball über den Füßen: kürzer greifen, rechts zielen – 5 Bälle.'),
      L('Ball below the feet: knees flexed, aim left – 5 balls.', 'Ball unter den Füßen: Knie gebeugt, links zielen – 5 Bälle.'),
      L('Uphill: shoulders with the slope, one club more – 5 balls.', 'Bergauf: Schultern mit dem Hang, ein Schläger mehr – 5 Bälle.'),
      L('Downhill: weight forward, chase down the slope – 5 balls.', 'Bergab: Gewicht vorn, dem Hang nach unten folgen – 5 Bälle.'),
      L('Count the balls that finish within 15 m of the target.', 'Zähle die Bälle, die innerhalb 15 m ums Ziel liegen bleiben.'),
    ],
    scoring: { kind: 'made', of: 20, unit: L('within 15 m', 'innerhalb 15 m') },
    targets: { high: 5, mid: 9, low: 13 },
    tips: [L('Practise slopes on a practice round only, and repair your divots.', 'Hanglagen nur bei einer Übungsrunde üben und Divots zurücklegen.')],
    videos: [{ id: 'Ufp6j_vIIpk', title: 'Alle vier Hanglagen beim Golf', channel: 'GOLFSTUN.DE', lang: 'de' }],
  },
  {
    id: 'brush-find',
    cat: 'slopes',
    name: L('Find the brush point', 'Den Bodenkontakt finden'),
    goal: L('Ball position on slopes: the practice swing shows where the club touches down.', 'Ballposition im Hang: Der Probeschwung zeigt, wo der Schläger aufsetzt.'),
    level: 1,
    minutes: 8,
    place: 'course',
    balls: 10,
    setup: L('On any slope, without a ball first.', 'In einem beliebigen Hang, zuerst ohne Ball.'),
    steps: [
      L('Make 3 practice swings in your set-up for the slope and watch where the club brushes the grass.', 'Mach 3 Probeschwünge in deiner Hang-Ansprache und schau, wo der Schläger das Gras streift.'),
      L('Put the ball exactly there (usually: uphill further forward, downhill further back).', 'Leg den Ball genau dorthin (meist: bergauf weiter vorn, bergab weiter hinten).'),
      L('Hit the ball; count clean contacts.', 'Schlag den Ball; zähle saubere Treffer.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('clean contacts', 'saubere Treffer') },
    targets: { high: 5, mid: 7, low: 9 },
  },
  {
    id: 'hold-finish-slope',
    cat: 'slopes',
    name: L('Hold the finish on the slope', 'Finish im Hang halten'),
    goal: L('Balance before power: an 80 % swing you can hold for 3 seconds.', 'Gleichgewicht vor Kraft: ein 80-%-Schwung, den du 3 Sekunden halten kannst.'),
    level: 1,
    minutes: 8,
    place: 'course',
    balls: 10,
    setup: L('Any slope, a 7-iron.', 'Beliebiger Hang, ein Eisen 7.'),
    steps: [
      L('Swing at 80 % and hold the finish until the ball lands (about 3 s).', 'Mit 80 % schwingen und das Finish halten, bis der Ball landet (etwa 3 s).'),
      L('A shot only counts if you did not take a step.', 'Ein Schlag zählt nur, wenn du keinen Schritt gemacht hast.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('in balance', 'im Gleichgewicht') },
    targets: { high: 6, mid: 8, low: 9 },
  },
  {
    id: 'aim-for-slope',
    cat: 'slopes',
    name: L('Aim for the curve', 'Die Kurve einplanen'),
    goal: L('Trust the slope: aim off and let the ball curve back.', 'Dem Hang vertrauen: daneben zielen und den Ball zurückdrehen lassen.'),
    level: 2,
    minutes: 10,
    place: 'course',
    balls: 10,
    needs: ['tees-alignment'],
    setup: L('Sidehill lies. Lay an alignment stick along your feet, aimed 5–15 m away from the target (right above the feet, left below).', 'Seitliche Hanglagen. Leg einen Ausrichtungsstab entlang deiner Füße, 5–15 m neben das Ziel ausgerichtet (über den Füßen rechts, unter den Füßen links).'),
    steps: [
      L('Hit along the stick without steering the ball – the slope makes the curve.', 'Schlag entlang des Stabs, ohne den Ball zu lenken – der Hang macht die Kurve.'),
      L('Note how far the ball curved with which club – your slope chart.', 'Notiere, wie weit der Ball mit welchem Schläger gedreht hat – deine Hang-Tabelle.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('curved back to the target', 'zum Ziel zurückgedreht') },
    targets: { high: 4, mid: 6, low: 8 },
  },
  {
    id: 'below-feet-stay',
    cat: 'slopes',
    name: L('Below the feet: stay down', 'Unter den Füßen: unten bleiben'),
    goal: L('Keep the knee flex through impact – no standing up.', 'Die Kniebeugung durch den Treffmoment halten – kein Aufrichten.'),
    level: 2,
    minutes: 10,
    place: 'course',
    balls: 10,
    setup: L('Ball below the feet, a mid-iron, wide stance.', 'Ball unter den Füßen, ein mittleres Eisen, breiter Stand.'),
    steps: [
      L('Feel as if you sit on a high stool; keep that height until the ball is gone.', 'Fühl dich, als säßest du auf einem hohen Hocker; halte diese Höhe, bis der Ball weg ist.'),
      L('Short finish, arms swing, legs stay quiet.', 'Kurzes Finish, die Arme schwingen, die Beine bleiben ruhig.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('solid contacts', 'satte Treffer') },
    targets: { high: 5, mid: 7, low: 9 },
  },
  {
    id: 'slope-chips',
    cat: 'slopes',
    also: ['chipping'],
    name: L('Chips from slopes', 'Chips aus Hanglagen'),
    goal: L('Short game around a green on slopes – the most common situation on hilly courses.', 'Kurzes Spiel ums Grün aus Hanglagen – die häufigste Situation auf hügeligen Plätzen.'),
    level: 2,
    minutes: 15,
    place: 'chipping',
    balls: 16,
    setup: L('4 balls each: uphill, downhill, above and below the feet, around the practice green.', 'Je 4 Bälle: bergauf, bergab, über und unter den Füßen, ums Übungsgrün.'),
    steps: [
      L('Uphill: shoulders with the slope, land it further, it stops quickly.', 'Bergauf: Schultern mit dem Hang, weiter landen, er bleibt schnell liegen.'),
      L('Downhill: more loft, land it just onto the green, it runs a lot.', 'Bergab: mehr Loft, knapp aufs Grün landen, er rollt viel.'),
      L('Above the feet: grip down, aim right. Below: knees flexed, aim left.', 'Über den Füßen: kürzer greifen, rechts zielen. Unter den Füßen: Knie gebeugt, links zielen.'),
      L('Count balls within 2 m.', 'Zähle Bälle innerhalb 2 m.'),
    ],
    scoring: { kind: 'made', of: 16, unit: L('within 2 m', 'innerhalb 2 m') },
    targets: { high: 4, mid: 7, low: 10 },
    videos: [{ id: '8pTcXnDh5GU', title: 'Your Complete Uneven Lies Chip Technique', channel: 'MORE PARS', lang: 'en' }],
  },
  {
    id: 'slope-home-balance',
    cat: 'slopes',
    also: ['fitness'],
    name: L('Slope balance at home', 'Hang-Gleichgewicht zu Hause'),
    goal: L('Train the balance for slopes in the living room.', 'Das Gleichgewicht für Hanglagen im Wohnzimmer trainieren.'),
    level: 1,
    minutes: 8,
    place: 'home',
    needs: [L('a thick book or a step board', 'ein dickes Buch oder ein Stepbrett')],
    setup: L('Stand with the toes, then the heels, then the lead foot, then the trail foot on a thick book – four “slopes”.', 'Stell dich mit den Zehen, dann den Fersen, dann dem vorderen, dann dem hinteren Fuß auf ein dickes Buch – vier „Hänge“.'),
    steps: [
      L('In each position: set up as on the course and make 10 slow half swings without a ball (or with a foam ball).', 'In jeder Position: wie auf dem Platz ansprechen und 10 langsame halbe Schwünge ohne Ball (oder mit Schaumstoffball).'),
      L('Hold every finish for 3 seconds.', 'Jedes Finish 3 Sekunden halten.'),
    ],
    scoring: { kind: 'none' },
  },
];
