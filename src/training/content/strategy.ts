import { L, type Category, type Drill } from '../types';

// Course management. Sources: Scott Fawcett – DECADE (shot dispersion, aim to avoid the big miss), Mark Broadie –
// Every Shot Counts (strokes gained, value of distance, the cost of penalties), Titleist / Michael Breed (plan the hole
// from the green backwards), Golf Sidekick (“way of the playa”), Sam Vickers (DECADE in practice). GolfOS Rounds:
// caddie, Birdiebook, tee strategy (spec 017).

export const strategy: Category = {
  id: 'strategy',
  name: L('Course management', 'Course Management'),
  short: L('Play your shot pattern, avoid the big number – save strokes without a new swing.', 'Mit deiner Streuung spielen, die großen Zahlen vermeiden – Schläge sparen ohne neuen Schwung.'),
  intro: L(
    'Course management is the fastest way to lower your score – it costs no new technique. The idea is simple: every player has a shot pattern (dispersion) – no two balls land in the same spot. Aim so that the whole pattern avoids the costly trouble (out of bounds, water, deep bunkers), and accept a miss on the safe side. Most double bogeys do not come from bad swings but from bad decisions.',
    'Course Management ist der schnellste Weg zu einem besseren Score – es kostet keine neue Technik. Die Idee ist einfach: Jeder Spieler hat eine Streuung – keine zwei Bälle landen an derselben Stelle. Ziele so, dass die ganze Streuung die teure Gefahr (Aus, Wasser, tiefe Bunker) vermeidet, und akzeptiere einen Fehler auf der sicheren Seite. Die meisten Doppelbogeys entstehen nicht aus schlechten Schwüngen, sondern aus schlechten Entscheidungen.',
  ),
  facts: [
    L('An average 15-handicap driver dispersion is about 50–60 m wide; a 150 m iron shot lands in an area of about 30 × 35 m.', 'Die Driver-Streuung eines durchschnittlichen Handicap-15-Spielers ist etwa 50–60 m breit; ein 150-m-Eisenschlag landet in einer Fläche von etwa 30 × 35 m.'),
    L('A penalty (water, out of bounds) costs on average about 1.5–2 strokes, a fairway bunker about 0.5, the rough about 0.3 (Broadie, strokes gained).', 'Ein Strafschlag (Wasser, Aus) kostet im Schnitt etwa 1,5–2 Schläge, ein Fairwaybunker etwa 0,5, das Rough etwa 0,3 (Broadie, Strokes Gained).'),
    L('DECADE (Scott Fawcett): tour players aim at the flag only when it is tucked away from trouble and they are close; otherwise at the centre of the green or the safe side.', 'DECADE (Scott Fawcett): Tour-Spieler zielen nur auf die Fahne, wenn sie weg von der Gefahr steckt und sie nah dran sind; sonst auf die Grünmitte oder die sichere Seite.'),
    L('A handicap 18 player who makes no double bogey plays around 85 – the “bogey plan”.', 'Ein Handicap-18-Spieler ohne Doppelbogey spielt um die 85 – der „Bogey-Plan“.'),
  ],
  sections: [
    {
      title: L('Know your pattern', 'Kenne deine Streuung'),
      text: [
        L(
          'Hit 20 balls with a club to one target and look at where they land: the area they cover is your pattern for that club. On the course you do not aim the ball, you aim the pattern. GolfOS Rounds learns your pattern per club from your rounds and the caddie uses it for its target point.',
          'Schlag 20 Bälle mit einem Schläger auf ein Ziel und schau, wo sie landen: Die Fläche, die sie abdecken, ist deine Streuung mit diesem Schläger. Auf dem Platz zielst du nicht den Ball, sondern die Streuung. GolfOS Rounds lernt deine Streuung je Schläger aus deinen Runden, und der Caddie nutzt sie für seinen Zielpunkt.',
        ),
      ],
      sketch: {
        view: 'top',
        w: 40,
        h: 60,
        items: [
          { k: 'rough', x: 0, y: 0, w: 40, h: 60 },
          { k: 'fairway', x: 12, y: 0, w: 16, h: 60 },
          { k: 'water', x: 29, y: 25, w: 11, h: 22, round: true },
          { k: 'ring', at: [17, 38], r: 10, fill: true, label: L('your pattern', 'deine Streuung') },
          { k: 'ball', at: [20, 2] },
          { k: 'path', pts: [[20, 2], [17, 38]], style: 'aim' },
          { k: 'text', at: [34.5, 36], t: L('water', 'Wasser'), size: 11 },
        ],
        caption: L('Aim so that the whole pattern stays away from the water – even if the centre is not in the middle of the fairway.', 'Ziele so, dass die ganze Streuung vom Wasser wegbleibt – auch wenn die Mitte nicht in der Fairwaymitte liegt.'),
      },
    },
    {
      title: L('Plan the hole backwards', 'Das Loch rückwärts planen'),
      points: [
        L('Where is the pin and where is the easy side of the green? From there: which approach distance do I want? From there: which tee shot?', 'Wo steckt die Fahne und wo ist die leichte Seite des Grüns? Von dort: Welche Annäherungsdistanz will ich? Von dort: Welcher Abschlag?'),
        L('Lay up to your favourite distance (e.g. 80 m with a full wedge) instead of to an awkward 40 m.', 'Lieber auf deine Lieblingsdistanz vorlegen (z. B. 80 m mit vollem Wedge) als auf unangenehme 40 m.'),
        L('On par 5s: a third shot with a wedge is often better than a long second shot over water.', 'Auf Par 5: Ein dritter Schlag mit dem Wedge ist oft besser als ein langer zweiter Schlag über Wasser.'),
      ],
    },
    {
      title: L('Simple rules', 'Einfache Regeln'),
      points: [
        L('From over 150 m: middle of the green.', 'Aus über 150 m: Grünmitte.'),
        L('Never short-side yourself: miss on the side with the most green.', 'Nie auf die kurze Seite verfehlen: auf der Seite mit dem meisten Grün verfehlen.'),
        L('Out of trouble: back to the fairway, the shortest safe way.', 'Aus der Gefahr: zurück aufs Fairway, auf dem kürzesten sicheren Weg.'),
        L('Take one club more on approach shots – most misses are short.', 'Bei Annäherungen einen Schläger mehr – die meisten Fehler sind zu kurz.'),
        L('Penalty side or bunker side? Choose the bunker; bunker or rough? Choose the rough.', 'Strafschlag-Seite oder Bunker-Seite? Wähle den Bunker; Bunker oder Rough? Wähle das Rough.'),
      ],
    },
    {
      title: L('Your personal par', 'Dein persönliches Par'),
      text: [
        L(
          'Add your handicap strokes to the course par: with playing handicap 18 every hole is a par 5 on a par 4. Plan each hole for your par – then a bogey is a par, and the double bogeys disappear. In Rounds the stroke dots on the hole bar show where you get a stroke.',
          'Rechne deine Vorgabeschläge zum Platz-Par: Mit Spielvorgabe 18 ist jedes Par 4 für dich ein Par 5. Plane jedes Loch für dein Par – dann ist ein Bogey ein Par, und die Doppelbogeys verschwinden. In Rounds zeigen die Punkte in der Lochleiste, wo du einen Vorgabeschlag bekommst.',
        ),
      ],
    },
    {
      title: L('Using the GolfOS caddie', 'Den GolfOS-Caddie nutzen'),
      points: [
        L('The caddie suggests club and target from your carry and your pattern, with wind, slope and temperature (“plays like”).', 'Der Caddie schlägt Schläger und Ziel aus deinem Carry und deiner Streuung vor, mit Wind, Höhenunterschied und Temperatur („spielt wie“).'),
        L('The Birdiebook shows each hole’s hazards and where not to miss.', 'Das Birdiebook zeigt die Hindernisse jedes Lochs und wo du nicht verfehlen darfst.'),
        L('After the round compare your decisions with the caddie’s in the review.', 'Nach der Runde vergleiche deine Entscheidungen mit denen des Caddies in der Nachbereitung.'),
      ],
    },
  ],
  faults: [
    {
      name: L('Attacking every flag', 'Jede Fahne angreifen'),
      looks: L('Short-sided, in bunkers and water around tucked pins.', 'Auf der kurzen Seite, in Bunkern und Wasser bei versteckten Fahnen.'),
      cause: L('Aiming at the flag regardless of the pattern.', 'Auf die Fahne zielen, ohne die Streuung zu bedenken.'),
      fix: L('Middle of the green from 150 m+, pattern drill.', 'Grünmitte ab 150 m, Streuungs-Übung.'),
      drills: ['decade-light', 'safe-target'],
    },
    {
      name: L('Doubling the trouble', 'Fehler verdoppeln'),
      looks: L('One bad shot becomes a triple bogey.', 'Ein schlechter Schlag wird zum Triple-Bogey.'),
      cause: L('The hero shot after a miss.', 'Der Heldenschlag nach einem Fehler.'),
      fix: L('Escape rule, bogey plan.', 'Rettungsregel, Bogey-Plan.'),
      drills: ['bogey-plan', 'escape-decision'],
    },
  ],
  videos: [
    { id: 'eIxgLuKybVo', title: 'Golf Course Management Strategy with Michael Breed', channel: 'Titleist', lang: 'en' },
    { id: 'XYWnxt5OAb4', title: 'Course Management Strategy Using Decade Golf', channel: 'Sam Vickers Golf Performance', lang: 'en' },
    { id: 'dbFu871N2jE', title: 'Holy Grail of Course Management in Golf', channel: 'Golf Sidekick', lang: 'en' },
    { id: 'k8sqrPDJg6c', title: 'Course Management vs. Shot Strategy in Golf', channel: 'Titleist', lang: 'en' },
    { id: 'bQDlKZv5IYg', title: 'Out-smart the golf course (course management tips)', channel: 'Kerrod Gray Golf', lang: 'en' },
    { id: 'TfJyD72ZV_M', title: 'Birdie more par 5s with this course management strategy', channel: 'Scratch Golf Tips', lang: 'en' },
  ],
  sources: [
    { label: 'DECADE Golf (Scott Fawcett)', url: 'https://decadegolf.com/' },
    { label: 'Mark Broadie – Every Shot Counts', url: 'https://www.everyshotcounts.com/' },
  ],
  see: ['mental', 'trouble', 'driver'],
};

export const strategyDrills: Drill[] = [
  {
    id: 'decade-light',
    cat: 'strategy',
    also: ['practice'],
    name: L('Measure your pattern', 'Deine Streuung messen'),
    goal: L('See your shot pattern with one club – the base of every target decision.', 'Deine Streuung mit einem Schläger sehen – die Basis jeder Zielentscheidung.'),
    level: 1,
    minutes: 20,
    place: 'range',
    balls: 20,
    needs: ['garmin-r10', L('or a range with clear targets', 'oder eine Range mit klaren Zielen')],
    setup: L('7-iron and driver, one target each.', 'Eisen 7 und Driver, je ein Ziel.'),
    steps: [
      L('10 balls with each club, full routine, always the same target.', 'Je 10 Bälle mit jedem Schläger, volle Routine, immer dasselbe Ziel.'),
      L('Estimate (or read on the launch monitor) the width and depth of the area where the balls landed (leave out the worst ball).', 'Schätze (oder lies am Launch Monitor) Breite und Tiefe der Fläche, wo die Bälle gelandet sind (ohne den schlechtesten Ball).'),
      L('Write down: 7-iron … m wide, driver … m wide – and think of it on the next tee.', 'Notiere: Eisen 7 … m breit, Driver … m breit – und denk am nächsten Abschlag daran.'),
    ],
    scoring: { kind: 'meters', unit: L('m wide with the 7-iron (less is better)', 'm breit mit Eisen 7 (weniger ist besser)'), lower: true },
    targets: { high: 45, mid: 35, low: 25, tour: 15 },
    videos: [{ id: 'XYWnxt5OAb4', title: 'Course Management Strategy Using Decade Golf', channel: 'Sam Vickers Golf Performance', lang: 'en' }],
  },
  {
    id: 'safe-target',
    cat: 'strategy',
    name: L('Name the target and the miss', 'Ziel und Fehler benennen'),
    goal: L('Before each shot: where is the target – and which miss do I accept?', 'Vor jedem Schlag: Wo ist das Ziel – und welchen Fehler akzeptiere ich?'),
    level: 1,
    minutes: 15,
    place: 'range',
    balls: 15,
    setup: L('On the range imagine a hole with trouble on one side (e.g. water right).', 'Stell dir auf der Range ein Loch mit Gefahr auf einer Seite vor (z. B. Wasser rechts).'),
    steps: [
      L('Say out loud: “Target the left edge of the flag, miss left is fine.”', 'Sag laut: „Ziel linker Rand der Fahne, Fehler links ist okay.“'),
      L('Hit. Did the ball end on the accepted side or on target? Then it counts.', 'Schlag. Ist der Ball auf der akzeptierten Seite oder am Ziel gelandet? Dann zählt er.'),
      L('On the course: play 9 holes with the caddie’s safe style and compare the score.', 'Auf dem Platz: 9 Löcher mit dem sicheren Stil des Caddies spielen und den Score vergleichen.'),
    ],
    scoring: { kind: 'made', of: 15, unit: L('on target or safe side', 'am Ziel oder sichere Seite') },
    targets: { high: 9, mid: 11, low: 13 },
  },
  {
    id: 'nine-hole-plan',
    cat: 'strategy',
    name: L('Plan 9 holes before the round', '9 Löcher vor der Runde planen'),
    goal: L('A game plan from the sofa: tee club, target, lay-up distance for each hole.', 'Ein Spielplan vom Sofa: Abschlagschläger, Ziel, Vorlegedistanz für jedes Loch.'),
    level: 1,
    minutes: 20,
    place: 'home',
    needs: [L('GolfOS Rounds: course preview and Birdiebook', 'GolfOS Rounds: Platzvorschau und Birdiebook')],
    setup: L('Open the course preview of your next course in Rounds.', 'Öffne in Rounds die Platzvorschau deines nächsten Platzes.'),
    steps: [
      L('For each hole: where is the big danger? Which club off the tee keeps the pattern away from it?', 'Für jedes Loch: Wo ist die große Gefahr? Welcher Schläger vom Abschlag hält die Streuung davon fern?'),
      L('Which approach distance do you want – and where do you lay up on par 5s?', 'Welche Annäherungsdistanz willst du – und wohin legst du auf Par 5 vor?'),
      L('Write your plan in the hole notes; on the course just follow it.', 'Schreib deinen Plan in die Lochnotizen; auf dem Platz folgst du ihm einfach.'),
      L('After the round: on how many holes did you stick to the plan?', 'Nach der Runde: Auf wie vielen Löchern hast du dich an den Plan gehalten?'),
    ],
    scoring: { kind: 'made', of: 9, unit: L('holes as planned', 'Löcher wie geplant') },
    targets: { high: 5, mid: 6, low: 8 },
  },
  {
    id: 'bogey-plan',
    cat: 'strategy',
    also: ['mental'],
    name: L('The bogey plan', 'Der Bogey-Plan'),
    goal: L('Play every hole for your personal par – no double bogeys.', 'Jedes Loch auf dein persönliches Par spielen – keine Doppelbogeys.'),
    level: 1,
    minutes: 120,
    place: 'course',
    setup: L('A round (9 or 18 holes). Mark on the scorecard which holes are “par 5” for you (stroke holes).', 'Eine Runde (9 oder 18 Löcher). Markiere auf der Scorekarte, welche Löcher für dich „Par 5“ sind (Vorgabelöcher).'),
    steps: [
      L('On stroke holes: plan three shots to the green, no risk.', 'Auf Vorgabelöchern: drei Schläge bis aufs Grün planen, kein Risiko.'),
      L('After a bad shot: back into play, accept the bogey.', 'Nach einem schlechten Schlag: zurück ins Spiel, das Bogey akzeptieren.'),
      L('Count the holes without double bogey or worse.', 'Zähle die Löcher ohne Doppelbogey oder schlechter.'),
    ],
    scoring: { kind: 'made', of: 18, unit: L('holes without double bogey', 'Löcher ohne Doppelbogey') },
    targets: { high: 11, mid: 14, low: 16 },
  },
  {
    id: 'favourite-distance',
    cat: 'strategy',
    also: ['pitching'],
    name: L('Find your favourite distance', 'Deine Lieblingsdistanz finden'),
    goal: L('Which distance gets you closest? Lay up to it.', 'Aus welcher Distanz kommst du am nächsten? Dorthin vorlegen.'),
    level: 1,
    minutes: 25,
    place: 'range',
    balls: 25,
    setup: L('Targets at 40, 60, 80, 100 and 120 m.', 'Ziele bei 40, 60, 80, 100 und 120 m.'),
    steps: [
      L('5 balls to each target; estimate the average distance to the target.', '5 Bälle auf jedes Ziel; schätze den durchschnittlichen Abstand zum Ziel.'),
      L('The distance with the smallest average gap (relative to the length) is your favourite distance – save it in My bag.', 'Die Distanz mit der kleinsten durchschnittlichen Abweichung (im Verhältnis zur Länge) ist deine Lieblingsdistanz – speichere sie in Mein Bag.'),
    ],
    scoring: { kind: 'none' },
  },
  {
    id: 'worst-ball',
    cat: 'strategy',
    also: ['mental', 'practice'],
    name: L('Worst-ball game', 'Schlechtester-Ball-Spiel'),
    goal: L('Play two balls and always continue with the worse one – builds consistency and a safe game.', 'Zwei Bälle spielen und immer mit dem schlechteren weiter – baut Konstanz und ein sicheres Spiel auf.'),
    level: 3,
    minutes: 90,
    place: 'course',
    balls: 2,
    setup: L('A quiet practice round, 9 holes.', 'Eine ruhige Übungsrunde, 9 Löcher.'),
    steps: [
      L('Hit two balls each time, pick the worse result and play both from there.', 'Schlag jedes Mal zwei Bälle, nimm das schlechtere Ergebnis und spiel beide von dort.'),
      L('Putt out both putts – both must go in.', 'Beide Putts zu Ende spielen – beide müssen fallen.'),
      L('Write the score. It shows which shots you can really rely on.', 'Notiere den Score. Er zeigt, auf welche Schläge du dich wirklich verlassen kannst.'),
    ],
    scoring: { kind: 'strokes', unit: L('strokes for 9 holes', 'Schläge für 9 Löcher') },
  },
  {
    id: 'stats-round',
    cat: 'strategy',
    also: ['practice'],
    name: L('Know your numbers', 'Kenne deine Zahlen'),
    goal: L('Track 5 rounds in Rounds and let the statistics show your biggest weakness.', '5 Runden in Rounds erfassen und die Statistik deine größte Schwäche zeigen lassen.'),
    level: 1,
    minutes: 10,
    place: 'course',
    setup: L('Record fairways, greens, putts and penalties in Rounds (or check the shots afterwards).', 'Fairways, Grüns, Putts und Strafschläge in Rounds erfassen (oder die Schläge danach prüfen).'),
    steps: [
      L('After 5 rounds open Stats: strokes gained and focus areas.', 'Nach 5 Runden die Statistik öffnen: Strokes Gained und Schwerpunkte.'),
      L('Training shows “From your rounds” on the library page – train exactly that.', 'Training zeigt „Aus deinen Runden“ auf der Wissen-Seite – genau das trainieren.'),
    ],
    scoring: { kind: 'none' },
  },
];
