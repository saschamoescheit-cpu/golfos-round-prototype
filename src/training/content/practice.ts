import { L, type Category, type Drill } from '../types';

// How to practise. Sources: motor learning research (blocked vs random practice, contextual interference), US Golf
// TV / GOLFTEC / TPI (block vs random in golf), Cordie Walker, Jonesy Golf (range sessions), Mark Broadie (where the
// strokes are lost), Anders Ericsson (deliberate practice).

export const practice: Category = {
  id: 'practice',
  name: L('How to practise', 'Richtig trainieren'),
  short: L('Block and random practice, games with scores, the right split of your time.', 'Block- und Zufallstraining, Spiele mit Ergebnis, die richtige Zeitaufteilung.'),
  intro: L(
    'Most golfers practise the way they enjoy – drivers on the range – and play the way they did not practise. Good practice has a goal, feedback and pressure. Use block practice (many balls, one shot) for a technical change, then random practice (every ball different) to make it hold on the course. And spend your time where you lose strokes: most amateurs lose more around and on the greens than with the driver.',
    'Die meisten Golfer üben so, wie es Spaß macht – Driver auf der Range – und spielen so, wie sie nicht geübt haben. Gutes Training hat ein Ziel, eine Rückmeldung und Druck. Nutze Blocktraining (viele Bälle, ein Schlag) für eine technische Änderung, dann Zufallstraining (jeder Ball anders), damit sie auf dem Platz hält. Und verbringe die Zeit dort, wo du Schläge verlierst: Die meisten Amateure verlieren rund ums Grün und auf dem Grün mehr als mit dem Driver.',
  ),
  facts: [
    L('Motor learning research: random practice feels worse during practice but is remembered and transferred better.', 'Forschung zum motorischen Lernen: Zufallstraining fühlt sich beim Üben schlechter an, wird aber besser behalten und übertragen.'),
    L('A common split for amateurs: about 50 % short game and putting, 30 % approach, 20 % tee shots.', 'Eine gängige Aufteilung für Amateure: etwa 50 % kurzes Spiel und Putten, 30 % Annäherung, 20 % Abschläge.'),
    L('Short focused sessions (30–45 minutes) 2–3 times a week beat one long session.', 'Kurze, fokussierte Einheiten (30–45 Minuten) 2–3-mal pro Woche schlagen eine lange Einheit.'),
    L('Count and log results – without numbers you do not know whether you are getting better.', 'Ergebnisse zählen und notieren – ohne Zahlen weißt du nicht, ob du besser wirst.'),
  ],
  sections: [
    {
      title: L('Two modes: train and test', 'Zwei Modi: trainieren und testen'),
      points: [
        L('Train mode (block): one technical point, many repetitions, slow is fine, mirror/video/sticks.', 'Trainingsmodus (Block): ein Technikpunkt, viele Wiederholungen, langsam ist okay, Spiegel/Video/Stäbe.'),
        L('Test mode (random): change club and target every ball, full routine, count the result.', 'Testmodus (zufällig): Schläger und Ziel bei jedem Ball wechseln, volle Routine, Ergebnis zählen.'),
        L('End every session in test mode – that is what the course is like.', 'Jede Einheit im Testmodus beenden – so ist der Platz.'),
      ],
    },
    {
      title: L('A 60-minute session', 'Eine 60-Minuten-Einheit'),
      points: [
        L('5 min warm-up.', '5 Min Aufwärmen.'),
        L('15 min putting: start line, length, short putts under pressure.', '15 Min Putten: Startlinie, Länge, kurze Putts unter Druck.'),
        L('15 min chipping and pitching with landing targets.', '15 Min Chippen und Pitchen mit Landezielen.'),
        L('15 min full swing: one technical drill, then targets.', '15 Min voller Schwung: eine Technik-Übung, dann Ziele.'),
        L('10 min game: up-and-down or range round.', '10 Min Spiel: Up-and-down oder Range-Runde.'),
      ],
    },
    {
      title: L('Use your data', 'Nutze deine Daten'),
      text: [
        L(
          'GolfOS Rounds shows where you lose strokes (strokes gained, putts, greens, up-and-down). Training turns that into a plan (“From your rounds”) and logs your drill results – after a few weeks you see on the progress page whether your weak spot improves.',
          'GolfOS Rounds zeigt, wo du Schläge verlierst (Strokes Gained, Putts, Grüns, Up-and-down). Training macht daraus einen Plan („Aus deinen Runden“) und protokolliert deine Übungsergebnisse – nach ein paar Wochen siehst du im Verlauf, ob deine Schwäche besser wird.',
        ),
      ],
    },
    {
      title: L('Winter and home practice', 'Winter- und Heimtraining'),
      points: [
        L('Putting mat and mirror: start line every evening (10 minutes).', 'Puttmatte und Spiegel: jeden Abend Startlinie (10 Minuten).'),
        L('Chips into a basket with foam balls.', 'Chips mit Schaumstoffbällen in einen Korb.'),
        L('Slow-motion swings in front of a mirror, mobility and speed training.', 'Zeitlupenschwünge vor dem Spiegel, Beweglichkeit und Speed-Training.'),
        L('Net and launch monitor – almost a range at home.', 'Netz und Launch Monitor – fast eine Range zu Hause.'),
      ],
    },
  ],
  faults: [
    {
      name: L('Machine-gunning range balls', 'Range-Bälle im Akkord'),
      looks: L('100 balls in 30 minutes, always the same club, no target.', '100 Bälle in 30 Minuten, immer derselbe Schläger, kein Ziel.'),
      cause: L('Practice as exercise, not as training.', 'Training als Bewegung, nicht als Üben.'),
      fix: L('Routine for every ball, change target and club, count.', 'Routine für jeden Ball, Ziel und Schläger wechseln, zählen.'),
      drills: ['range-round', 'one-ball-range'],
    },
    {
      name: L('Only practising strengths', 'Nur Stärken üben'),
      looks: L('Driver every time, putting never.', 'Jedes Mal Driver, nie Putten.'),
      cause: L('It is more fun.', 'Es macht mehr Spaß.'),
      fix: L('Split the time by the statistics; plans from your rounds.', 'Zeit nach der Statistik aufteilen; Pläne aus deinen Runden.'),
      drills: ['stats-round'],
    },
  ],
  videos: [
    { id: 'YZ7-iFn73fs', title: 'Block vs random practice', channel: 'US GOLF TV', lang: 'en' },
    { id: 'nUpsR1wETrg', title: 'Should golfers ever use blocked practice?', channel: 'TPI – Titleist Performance Institute', lang: 'en' },
    { id: 'KxwHcaoPBMY', title: 'Golf practice techniques: block vs random practice explained', channel: 'Cordie Walker GolfWell', lang: 'en' },
    { id: 'Cd7aqjK_uSk', title: 'Short game: block vs random practice', channel: 'Brett Silvernail Golf', lang: 'en' },
    { id: 'i5OAPb-VJ8U', title: 'How to practice golf on the driving range', channel: 'Jonesy Golf', lang: 'en' },
    { id: 'dpQMNY1wVHA', title: 'Random practice drill', channel: 'GOLFTEC', lang: 'en' },
  ],
  sources: [
    { label: 'PMC – blocked vs random practice (motor learning study)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10781129/' },
    { label: 'Mark Broadie – Every Shot Counts', url: 'https://www.everyshotcounts.com/' },
  ],
  see: ['mental', 'strategy', 'fitness'],
};

export const practiceDrills: Drill[] = [
  {
    id: 'range-round',
    cat: 'practice',
    also: ['strategy', 'driver', 'irons'],
    name: L('Play a round on the range', 'Eine Runde auf der Range spielen'),
    goal: L('Random practice like on the course: every ball a new club and target.', 'Zufallstraining wie auf dem Platz: jeder Ball ein neuer Schläger und ein neues Ziel.'),
    level: 1,
    minutes: 30,
    place: 'range',
    balls: 30,
    setup: L('Picture your home course hole by hole (Rounds course preview helps).', 'Stell dir deinen Heimatplatz Loch für Loch vor (die Platzvorschau in Rounds hilft).'),
    steps: [
      L('Hole 1: tee shot with the club you play there, then the approach club for the distance that is left.', 'Loch 1: Abschlag mit dem Schläger, den du dort spielst, dann der Annäherungsschläger für die Restdistanz.'),
      L('Judge each shot: fairway/green yes or no. Missed green: imagine a chip (or play it on the short-game area).', 'Beurteile jeden Schlag: Fairway/Grün ja oder nein. Grün verfehlt: einen Chip vorstellen (oder im Kurzspielbereich spielen).'),
      L('Play 9 or 18 holes and count fairways + greens.', 'Spiel 9 oder 18 Löcher und zähle Fairways + Grüns.'),
    ],
    scoring: { kind: 'points', max: 32, unit: L('fairways + greens (18 holes)', 'Fairways + Grüns (18 Löcher)') },
    targets: { high: 10, mid: 15, low: 21, tour: 26 },
  },
  {
    id: 'one-ball-range',
    cat: 'practice',
    also: ['mental'],
    name: L('One ball at a time', 'Immer nur ein Ball'),
    goal: L('Slow down: one ball, full routine, then walk back.', 'Langsamer werden: ein Ball, volle Routine, dann zurückgehen.'),
    level: 1,
    minutes: 20,
    place: 'range',
    balls: 20,
    setup: L('Put the basket 5 m behind you.', 'Stell den Korb 5 m hinter dich.'),
    steps: [
      L('Fetch one ball, go through your routine behind the ball, hit, judge it – then fetch the next.', 'Hol einen Ball, geh hinter dem Ball durch deine Routine, schlag, beurteile ihn – dann den nächsten holen.'),
      L('Rate every shot 0–2 (miss, ok, very good). Score = sum.', 'Bewerte jeden Schlag mit 0–2 (Fehler, okay, sehr gut). Ergebnis = Summe.'),
    ],
    scoring: { kind: 'points', max: 40, unit: L('points', 'Punkte') },
    targets: { high: 14, mid: 20, low: 26 },
  },
  {
    id: 'block-then-random',
    cat: 'practice',
    name: L('Block, then random', 'Erst Block, dann zufällig'),
    goal: L('Learn a change and make it hold.', 'Eine Änderung lernen und sie halten lassen.'),
    level: 2,
    minutes: 30,
    place: 'range',
    balls: 40,
    setup: L('Pick one technical point (e.g. from the Coach module or a fault in this library).', 'Wähle einen Technikpunkt (z. B. aus dem Coach-Modul oder einen Fehler aus dieser Bibliothek).'),
    steps: [
      L('Block: 20 balls with one club and the drill for your point – slowly, with feedback (sticks, video).', 'Block: 20 Bälle mit einem Schläger und der Übung für deinen Punkt – langsam, mit Rückmeldung (Stäbe, Video).'),
      L('Random: 20 balls, every ball a different club and target, full routine, the point only as a feeling.', 'Zufällig: 20 Bälle, jeder Ball ein anderer Schläger und ein anderes Ziel, volle Routine, der Punkt nur als Gefühl.'),
      L('Count good shots in the random part.', 'Zähle gute Schläge im zufälligen Teil.'),
    ],
    scoring: { kind: 'made', of: 20, unit: L('good shots (random part)', 'gute Schläge (zufälliger Teil)') },
    targets: { high: 8, mid: 11, low: 14 },
  },
  {
    id: 'pre-round-25',
    cat: 'practice',
    also: ['fitness', 'putting'],
    name: L('25-minute pre-round routine', '25-Minuten-Routine vor der Runde'),
    goal: L('Warm up – do not practise – before a round.', 'Vor der Runde aufwärmen – nicht üben.'),
    level: 1,
    minutes: 25,
    place: 'range',
    balls: 25,
    setup: L('Arrive 40 minutes before your tee time.', 'Komm 40 Minuten vor der Startzeit.'),
    steps: [
      L('5 min: dynamic warm-up (see Fitness).', '5 Min: dynamisches Aufwärmen (siehe Fitness).'),
      L('10 min range: 5 wedges, 5 7-irons, 3 hybrids/woods, 3 drivers, then 3 balls with your first-tee club and routine.', '10 Min Range: 5 Wedges, 5 Eisen 7, 3 Hybride/Hölzer, 3 Driver, dann 3 Bälle mit dem Schläger für den ersten Abschlag und Routine.'),
      L('3 min chipping: a few chips to feel the turf.', '3 Min Chippen: ein paar Chips, um den Boden zu fühlen.'),
      L('7 min putting: star putting to the fringe (speed), then short putts through a gate – finish with a holed putt.', '7 Min Putten: Sternputten zum Grünrand (Tempo), dann kurze Putts durch ein Tor – mit einem gelochten Putt aufhören.'),
    ],
    scoring: { kind: 'none' },
  },
  {
    id: 'two-ball-nine',
    cat: 'practice',
    also: ['strategy'],
    name: L('Two balls, 9 holes', 'Zwei Bälle, 9 Löcher'),
    goal: L('Play an extra ball on a quiet practice round – twice the experience.', 'Bei einer ruhigen Übungsrunde einen zweiten Ball spielen – doppelte Erfahrung.'),
    level: 1,
    minutes: 90,
    place: 'course',
    balls: 2,
    setup: L('Only when the course is quiet and nobody waits behind you.', 'Nur wenn der Platz ruhig ist und niemand hinter dir wartet.'),
    steps: [
      L('Ball 1 as on a normal round. Ball 2: try the shot you would not normally play (e.g. lay-up, other club, other side).', 'Ball 1 wie bei einer normalen Runde. Ball 2: den Schlag probieren, den du normalerweise nicht spielen würdest (z. B. Vorlegen, anderer Schläger, andere Seite).'),
      L('Write both scores – what did the alternative bring?', 'Notiere beide Scores – was hat die Alternative gebracht?'),
    ],
    scoring: { kind: 'none' },
  },
  {
    id: 'weekly-log',
    cat: 'practice',
    name: L('Weekly check', 'Wochen-Check'),
    goal: L('Once a week: the same three tests, logged – your progress in numbers.', 'Einmal pro Woche: dieselben drei Tests, protokolliert – dein Fortschritt in Zahlen.'),
    level: 1,
    minutes: 30,
    place: 'chipping',
    setup: L('Pick three tests: e.g. Clock drill (putting), Up-and-down challenge (chipping), Three distances (irons).', 'Wähle drei Tests: z. B. Uhr-Übung (Putten), Up-and-down-Challenge (Chippen), Drei Distanzen (Eisen).'),
    steps: [
      L('Do the three tests at the start of a session, before practising.', 'Mach die drei Tests zu Beginn einer Einheit, vor dem Üben.'),
      L('Enter the results in the drills – the Progress tab shows your best and your trend.', 'Trag die Ergebnisse bei den Übungen ein – der Verlauf zeigt Bestwert und Trend.'),
    ],
    scoring: { kind: 'none' },
  },
];
