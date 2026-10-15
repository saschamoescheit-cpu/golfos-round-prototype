import { L, type Category, type Drill } from '../types';

// Fairway woods and hybrids. Sources: Callaway (Harris English: ball off the front heel), TaylorMade (Tommy Fleetwood:
// brush the turf), Kerrod Gray, Mark Crossfield, Danny Maude (topping woods), Today’s Golfer.

export const woods: Category = {
  id: 'woods',
  name: L('Fairway woods & hybrids', 'Fairwayhölzer & Hybride'),
  short: L('Sweep the ball off the grass – no tops, no chunks.', 'Den Ball vom Gras fegen – kein Toppen, kein Fett.'),
  intro: L(
    'Fairway woods and hybrids are the long clubs from the ground: for long par 5s, long par 3s and as a safer club off the tee. Unlike irons you do not hit down on the ball: the club sweeps along the grass and picks the ball off it, with a very shallow angle. Most amateurs top them because they try to lift the ball – or hit them fat because they swing too steep.',
    'Fairwayhölzer und Hybride sind die langen Schläger vom Boden: für lange Par 5, lange Par 3 und als sichererer Schläger vom Abschlag. Anders als bei Eisen schlägst du nicht nach unten auf den Ball: Der Schläger fegt am Gras entlang und nimmt den Ball mit, in sehr flachem Winkel. Die meisten Amateure toppen sie, weil sie den Ball heben wollen – oder treffen sie fett, weil sie zu steil schwingen.',
  ),
  facts: [
    L('Hybrids are easier to hit than long irons (4- and 5-iron) for most amateurs: wider sole, lower centre of gravity, higher flight.', 'Hybride sind für die meisten Amateure leichter zu treffen als lange Eisen (Eisen 4 und 5): breitere Sohle, tieferer Schwerpunkt, höherer Flug.'),
    L('The attack angle with a fairway wood from the ground is close to 0° (level) – a brush of the grass, at most a thin divot.', 'Der Anstellwinkel mit dem Fairwayholz vom Boden liegt nahe 0° (waagrecht) – ein Streifen über das Gras, höchstens ein dünnes Divot.'),
    L('A 3-wood from the fairway is one of the hardest clubs; a 5-wood or 7-wood flies almost as far for most amateurs and is much easier.', 'Ein Holz 3 vom Fairway ist einer der schwersten Schläger; ein Holz 5 oder 7 fliegt bei den meisten Amateuren fast genauso weit und ist viel leichter.'),
  ],
  sections: [
    {
      title: L('Set-up', 'Ansprache'),
      points: [
        L('Ball about two ball-widths inside the lead heel (fairway wood), slightly further back for a hybrid.', 'Ball etwa zwei Ballbreiten innerhalb der vorderen Ferse (Fairwayholz), beim Hybrid etwas weiter hinten.'),
        L('Stance a little wider than shoulder width; weight 50:50.', 'Stand etwas breiter als schulterbreit; Gewicht 50:50.'),
        L('Sole the club flat on the ground; hands level with the ball (not ahead as with irons).', 'Die Sohle flach auf den Boden; Hände auf Höhe des Balls (nicht davor wie bei Eisen).'),
      ],
    },
    {
      title: L('The swing: sweep', 'Der Schwung: fegen'),
      text: [
        L(
          'Think of a wide, round swing: low and slow away from the ball, a full turn, and through the ball the club brushes the grass like a broom. Do not try to lift the ball – the loft does it. Keep the chest over the ball through impact and finish fully. With hybrids a slightly steeper, more iron-like strike is fine.',
          'Denk an einen weiten, runden Schwung: flach und langsam vom Ball weg, eine volle Drehung, und durch den Ball streift der Schläger das Gras wie ein Besen. Versuch nicht, den Ball zu heben – das macht der Loft. Halte die Brust im Treffmoment über dem Ball und schwing voll aus. Beim Hybrid ist ein etwas steilerer, eisenähnlicher Treffmoment in Ordnung.',
        ),
      ],
    },
    {
      title: L('When to take a wood', 'Wann ein Holz nehmen'),
      points: [
        L('Good lie in the fairway and a large target in front: yes.', 'Gute Lage auf dem Fairway und ein großes Ziel davor: ja.'),
        L('Ball sitting down in the rough, a narrow green with water: rather a hybrid or a lay-up with an iron.', 'Ball tief im Rough, ein schmales Grün mit Wasser: lieber Hybrid oder Vorlegen mit Eisen.'),
        L('Off the tee on tight holes: a 3-wood or hybrid in play beats a driver in the trees.', 'Vom Abschlag auf engen Löchern: Holz 3 oder Hybrid im Spiel schlägt Driver im Wald.'),
      ],
    },
  ],
  faults: [
    {
      name: L('Topping', 'Toppen'),
      looks: L('The ball rolls along the ground.', 'Der Ball rollt am Boden entlang.'),
      cause: L('Trying to lift the ball, standing up, ball too far forward.', 'Den Ball heben wollen, Aufrichten, Ball zu weit vorn.'),
      fix: L('Sweep drill with a tee, brush the grass, chest over the ball.', 'Fege-Übung mit Tee, das Gras streifen, Brust über dem Ball.'),
      drills: ['woods-sweep', 'tee-low-wood'],
    },
    {
      name: L('Fat (chunked) woods', 'Fette Hölzer'),
      looks: L('Big divot, short.', 'Großes Divot, kurz.'),
      cause: L('Too steep, as with an iron; weight back.', 'Zu steil, wie mit dem Eisen; Gewicht hinten.'),
      fix: L('Wide, flat takeaway; brush, not dig.', 'Weites, flaches Ausholen; fegen, nicht graben.'),
      drills: ['woods-sweep', 'brush-five'],
    },
  ],
  videos: [
    { id: '81sEbGUnvLk', title: 'Tommy Fleetwood’s key to hitting fairway woods off the deck', channel: 'TaylorMade Golf', lang: 'en' },
    { id: 'CDWX251oPBU', title: 'No Tops, No Fats! The secret to hitting fairway woods off the deck', channel: 'Kerrod Gray Golf', lang: 'en' },
    { id: 'tmiJ_yrUESo', title: 'How to hit a fairway wood off the deck', channel: 'Mark Crossfield', lang: 'en' },
    { id: 'Qz8ORUBE3fY', title: 'Stop topping your woods – learn to hit a wood off the ground', channel: 'Danny Maude', lang: 'en' },
    { id: 'AoJoIhSF59s', title: 'How to hit fairway woods off the deck', channel: 'Today’s Golfer', lang: 'en' },
  ],
  see: ['driver', 'irons', 'strategy'],
};

export const woodsDrills: Drill[] = [
  {
    id: 'woods-sweep',
    cat: 'woods',
    name: L('Sweep the tee', 'Den Tee wegfegen'),
    goal: L('A shallow strike: the club sweeps a low tee out from under the ball.', 'Ein flacher Treffmoment: Der Schläger fegt einen tiefen Tee unter dem Ball weg.'),
    level: 1,
    minutes: 12,
    place: 'range',
    balls: 20,
    needs: [L('short tees', 'kurze Tees')],
    setup: L('Tee the ball very low (just above the grass) for the fairway wood.', 'Ball sehr tief aufteen (knapp über dem Gras) fürs Fairwayholz.'),
    steps: [
      L('Hit so that the tee flies out but no divot is taken.', 'Schlag so, dass der Tee mitfliegt, aber kein Divot entsteht.'),
      L('After 10 balls: put the ball on the grass and keep the same feeling.', 'Nach 10 Bällen: Ball aufs Gras legen und dasselbe Gefühl behalten.'),
    ],
    scoring: { kind: 'made', of: 20, unit: L('swept cleanly', 'sauber gefegt') },
    targets: { high: 10, mid: 13, low: 16 },
    videos: [{ id: '81sEbGUnvLk', title: 'Tommy Fleetwood’s key to hitting fairway woods off the deck', channel: 'TaylorMade Golf', lang: 'en' }],
  },
  {
    id: 'tee-low-wood',
    cat: 'woods',
    name: L('Tee height ladder', 'Tee-Höhen-Leiter'),
    goal: L('From teed up to the ground in three steps.', 'In drei Stufen vom Tee auf den Boden.'),
    level: 1,
    minutes: 10,
    place: 'range',
    balls: 15,
    setup: L('5 balls on a normal tee, 5 on a very low tee, 5 on the grass.', '5 Bälle auf normalem Tee, 5 auf sehr tiefem Tee, 5 auf dem Gras.'),
    steps: [
      L('Same swing for all 15 – only the ball gets lower.', 'Gleicher Schwung für alle 15 – nur der Ball wird tiefer.'),
      L('Count solid shots off the grass.', 'Zähle satte Schläge vom Gras.'),
    ],
    scoring: { kind: 'made', of: 5, unit: L('solid from the grass', 'satt vom Gras') },
    targets: { high: 2, mid: 3, low: 4 },
  },
  {
    id: 'brush-five',
    cat: 'woods',
    name: L('Five brushes, one ball', 'Fünfmal fegen, ein Ball'),
    goal: L('Find the bottom of the swing before you hit.', 'Den tiefsten Punkt finden, bevor du schlägst.'),
    level: 1,
    minutes: 8,
    place: 'range',
    balls: 10,
    setup: L('Next to the ball.', 'Neben dem Ball.'),
    steps: [
      L('5 practice swings that brush the grass at the same spot – listen for the “swish”.', '5 Probeschwünge, die das Gras an derselben Stelle streifen – hör auf das „Wusch“.'),
      L('Step to the ball and repeat the same brush. 10 balls.', 'Zum Ball treten und dasselbe Streifen wiederholen. 10 Bälle.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('solid contacts', 'satte Treffer') },
    targets: { high: 5, mid: 7, low: 9 },
  },
  {
    id: 'hybrid-tee-down',
    cat: 'woods',
    also: ['irons'],
    name: L('Hybrid instead of long iron', 'Hybrid statt langem Eisen'),
    goal: L('Compare your hybrid and your long iron – keep the one that lands more greens.', 'Hybrid und langes Eisen vergleichen – den behalten, der mehr Grüns trifft.'),
    level: 1,
    minutes: 15,
    place: 'range',
    balls: 20,
    setup: L('A target at your hybrid distance. Hybrid and the 4- or 5-iron.', 'Ein Ziel in deiner Hybrid-Distanz. Hybrid und Eisen 4 oder 5.'),
    steps: [
      L('Alternate 10 balls each.', 'Abwechselnd je 10 Bälle.'),
      L('Count balls within 15 m of the target for each club.', 'Zähle für jeden Schläger die Bälle innerhalb 15 m ums Ziel.'),
      L('The winner goes in the bag.', 'Der Sieger kommt ins Bag.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('hybrid within 15 m', 'Hybrid innerhalb 15 m') },
    targets: { high: 3, mid: 5, low: 7 },
  },
  {
    id: 'wood-off-tee',
    cat: 'woods',
    also: ['driver', 'strategy'],
    name: L('3-wood or driver? The tee test', 'Holz 3 oder Driver? Der Abschlag-Test'),
    goal: L('Learn which club keeps you in play more often.', 'Lernen, welcher Schläger dich öfter im Spiel hält.'),
    level: 2,
    minutes: 20,
    place: 'range',
    balls: 20,
    needs: ['tees-alignment'],
    setup: L('Mark a 30 m wide “fairway” on the range with two targets.', 'Markiere auf der Range mit zwei Zielen ein 30 m breites „Fairway“.'),
    steps: [
      L('10 drivers, 10 3-woods (or hybrids), alternating.', '10 Driver, 10 Holz 3 (oder Hybrid), abwechselnd.'),
      L('Count fairways for each and estimate the average distance.', 'Zähle für jeden die Fairways und schätze die durchschnittliche Länge.'),
      L('On tight holes play the club that hits more fairways if the distance difference is under 20 m.', 'Auf engen Löchern den Schläger spielen, der mehr Fairways trifft, wenn der Längenunterschied unter 20 m liegt.'),
    ],
    scoring: { kind: 'made', of: 10, unit: L('3-wood fairways', 'Holz-3-Fairways') },
    targets: { high: 4, mid: 6, low: 7 },
  },
];
