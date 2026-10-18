// More detail for the sections that have lettered parts in the rule book (Sascha 18.10.2026: "the details behind the
// points matter too") – appended to the section's text, in our own words. [English, German] per paragraph.
type Para = [string, string];

export const EXTRA: Record<string, Para[]> = {
  '1.3': [
    ['Two or more breaches between the same two events (e.g. two strokes) count as one penalty – the higher one if they differ.', 'Mehrere Verstöße zwischen zwei Ereignissen (z. B. zwei Schlägen) zählen als eine Strafe – die höhere, wenn sie verschieden sind.'],
  ],
  '3.3': [
    ['Your marker certifies your hole scores; you check them, sign and hand in the scorecard promptly. You are not responsible for adding up or for the handicap calculation done by the committee – but your handicap on the card must be right.', 'Der Zähler bestätigt die Lochergebnisse; man prüft sie, unterschreibt und gibt die Scorekarte zügig ab. Für das Addieren und die Vorgabeberechnung ist die Spielleitung verantwortlich – die eigene Vorgabe auf der Karte muss aber stimmen.'],
  ],
  '4.1': [
    ['You may not add clubs during the round to replace ones you started with, and you must not borrow a club from anyone playing on the course.', 'Während der Runde dürfen keine Schläger als Ersatz dazukommen, und man darf keinen Schläger von jemandem leihen, der auf dem Platz spielt.'],
    ['A club you damage in anger may not be replaced, but you may keep using it as damaged.', 'Ein im Ärger beschädigter Schläger darf nicht ersetzt, aber beschädigt weiter benutzt werden.'],
  ],
  '6.1': [
    ['If your ball falls off the tee before a stroke or you knock it off at address, re-tee it without penalty.', 'Fällt der Ball vor dem Schlag vom Tee oder stößt man ihn beim Ansprechen herunter, straflos wieder aufteen.'],
  ],
  '6.3': [
    ['You may change balls between holes. During a hole you may substitute a ball only when taking relief or when a Rule allows it (e.g. a cut or cracked ball).', 'Zwischen zwei Löchern darf man den Ball wechseln. Während eines Lochs nur beim Erleichterung-Nehmen oder wenn eine Regel es erlaubt (z. B. beschädigter Ball).'],
  ],
  '7.1': [
    ['If you damage the course while searching (e.g. trampling grass), there is no penalty as long as it is part of a fair search; you must not improve conditions on purpose.', 'Beschädigt man beim fairen Suchen den Platz (z. B. Gras niedertreten), ist das straflos; absichtlich verbessern darf man nichts.'],
  ],
  '8.1': [
    ['If you improve conditions in breach of the Rule you may restore them before the stroke and avoid the penalty – unless you bent or broke a growing thing, or moved a boundary object.', 'Hat man die Bedingungen regelwidrig verbessert, darf man sie vor dem Schlag wiederherstellen und so die Strafe vermeiden – außer man hat Wachsendes gebogen oder abgebrochen oder eine Grenzmarkierung bewegt.'],
  ],
  '9.4': [
    ['No penalty when you accidentally move your ball: while searching for it, on the putting green, while applying a Rule (e.g. marking), or because of an accident not caused by you.', 'Straflos, wenn man den Ball versehentlich bewegt: beim Suchen, auf dem Grün, beim Anwenden einer Regel (z. B. Markieren) oder durch einen nicht selbst verursachten Unfall.'],
  ],
  '10.2': [
    ['Your caddie may stand behind you on your line before your stance, but must move away once you begin taking your stance – also on the putting green.', 'Der Caddie darf vor dem Einnehmen des Stands auf der Linie hinter einem stehen, muss aber weggehen, sobald man den Stand einnimmt – auch auf dem Grün.'],
    ['You may not have someone shade you from the sun or shelter you from rain while making the stroke – you may do it yourself.', 'Niemand darf einen beim Schlag vor Sonne oder Regen schützen – selbst darf man das.'],
  ],
  '11.1': [
    ['If a ball played from outside the green comes to rest on a person or animal, drop it where it would have come to rest (on the green: place it).', 'Bleibt ein von außerhalb des Grüns gespielter Ball an einer Person oder einem Tier liegen, dort droppen, wo er liegen geblieben wäre (auf dem Grün: hinlegen).'],
  ],
  '12.2': [
    ['Allowed in a bunker: lean on a club, place clubs or equipment in the bunker, smooth sand to care for the course (not to improve the stroke), dig in with your feet for a stance.', 'Im Bunker erlaubt: sich auf einen Schläger stützen, Schläger oder Ausrüstung hineinlegen, Sand zur Platzpflege glätten (nicht um den Schlag zu verbessern), sich mit den Füßen eingraben für den Stand.'],
  ],
  '13.1': [
    ['If your ball or ball-marker on the green is accidentally moved by anyone, replace it without penalty.', 'Wird der Ball oder Ballmarker auf dem Grün von jemandem versehentlich bewegt, straflos zurücklegen.'],
    ['Wrong green: when your ball lies on a green other than the one of the hole played, or it interferes with your stance, you must take free relief off it.', 'Falsches Grün: Liegt der Ball auf einem anderen Grün als dem des gespielten Lochs oder behindert es den Stand, muss straflos Erleichterung genommen werden.'],
  ],
  '13.2': [
    ['Attended flagstick: deliberately letting your ball hit the person attending it or the flagstick held by them costs the general penalty; by accident there is no penalty.', 'Bediente Fahne: Lässt man den Ball absichtlich die bedienende Person oder die gehaltene Fahne treffen, gibt es die Grundstrafe; versehentlich ist es straflos.'],
    ['A ball resting against the flagstick in the hole is holed if any part of it is below the surface of the green.', 'Ein an der Fahne lehnender Ball ist eingelocht, wenn ein Teil unter der Oberfläche des Grüns ist.'],
  ],
  '14.2': [
    ['The original lie is altered (e.g. sand pressed): in a bunker re-create it as closely as possible; elsewhere place the ball on the nearest spot with the most similar lie within one club-length, not nearer the hole.', 'Ist die ursprüngliche Lage verändert (z. B. Sand plattgedrückt): im Bunker möglichst wiederherstellen; sonst an die nächste Stelle mit ähnlichster Lage innerhalb einer Schlägerlänge legen, nicht näher zum Loch.'],
  ],
  '14.3': [
    ['If the dropped ball touches a person or equipment before it hits the ground, drop again without penalty. If it hits someone after landing and still stops in the relief area, play it as it lies.', 'Berührt der gedroppte Ball vor dem Aufkommen eine Person oder Ausrüstung, straflos neu droppen. Trifft er erst nach dem Aufkommen jemanden und bleibt trotzdem im Erleichterungsbereich liegen, wird er gespielt, wie er liegt.'],
    ['The relief area is measured with your longest club except the putter, from the reference point the Rule gives (nearest point of complete relief, the point where the ball crossed the edge …).', 'Der Erleichterungsbereich wird mit dem längsten Schläger außer dem Putter gemessen, vom Bezugspunkt der jeweiligen Regel (nächstgelegener Punkt vollständiger Erleichterung, Kreuzungspunkt …).'],
  ],
  '15.2': [
    ['Movable obstructions in a penalty area or bunker may also be removed; if the ball moves, replace it without penalty.', 'Bewegliche Hemmnisse in Penalty Area oder Bunker dürfen ebenfalls entfernt werden; bewegt sich der Ball, straflos zurücklegen.'],
  ],
  '16.1': [
    ['Interference: the condition touches or holds your ball, physically interferes with your stance or area of swing, or – on the green only – is on your line of play. Mere interference with your line of play elsewhere gives no relief.', 'Behinderung: Der Zustand berührt oder enthält den Ball, behindert Stand oder Schwungraum körperlich oder liegt – nur auf dem Grün – auf der Puttlinie. Eine Behinderung der Spiellinie anderswo gibt keine Erleichterung.'],
    ['No relief when it is clearly unreasonable to play the ball (e.g. your ball is in a bush and a sprinkler head is under your foot) or when interference only exists because of an unusual stance or swing.', 'Keine Erleichterung, wenn es offensichtlich unvernünftig ist, den Ball zu spielen (z. B. Ball im Busch, Sprinklerkopf unter dem Fuß), oder wenn die Behinderung nur durch einen ungewöhnlichen Stand oder Schwung entsteht.'],
    ['Ball not found but known or virtually certain to be in an abnormal course condition: take relief from the point where it last crossed the edge of the condition.', 'Ball nicht gefunden, aber bekannt oder so gut wie sicher in einem ungewöhnlichen Platzverhältnis: Erleichterung vom Punkt, an dem er zuletzt die Grenze des Zustands gekreuzt hat.'],
  ],
  '16.3': [
    ['No relief when the ball is embedded in sand in a part of the general area not cut to fairway height or less, or when playing it is clearly unreasonable.', 'Keine Erleichterung, wenn der Ball in Sand in einem nicht kurz gemähten Teil des Geländes steckt oder wenn das Spielen offensichtlich unvernünftig ist.'],
  ],
  '17.1': [
    ['A ball is in a penalty area when any part of it touches the ground or anything inside the edge, or is above it. The edge extends up and down.', 'Ein Ball ist in einer Penalty Area, wenn ein Teil davon den Boden oder etwas innerhalb der Grenze berührt oder darüber ist. Die Grenze reicht nach oben und unten.'],
    ['Playing it as it lies: you may ground your club, touch the water or ground and take practice swings – the same as in the general area.', 'Spielen, wie er liegt: Schläger aufsetzen, Wasser oder Boden berühren und Probeschwünge sind erlaubt – wie im Gelände.'],
    ['Ball not found but known or virtually certain to be in the penalty area: take relief from the point where it last crossed the edge. Not virtually certain: it is a lost ball (Rule 18.2).', 'Ball nicht gefunden, aber bekannt oder so gut wie sicher in der Penalty Area: Erleichterung vom Punkt, an dem er zuletzt die Grenze gekreuzt hat. Nicht so gut wie sicher: verlorener Ball (Regel 18.2).'],
  ],
  '18.2': [
    ['A ball is out of bounds only when all of it lies outside the boundary edge. The inside edge of the white stakes or line marks the boundary.', 'Ein Ball ist nur im Aus, wenn er ganz außerhalb der Grenze liegt. Die Innenkante der weißen Pfosten oder Linie ist die Grenze.'],
  ],
  '18.3': [
    ['Announce it clearly (“provisional ball”). Playing another ball without saying so makes it the ball in play under stroke and distance.', 'Deutlich ankündigen („provisorischer Ball“). Wer einen weiteren Ball ohne Ansage spielt, hat damit den Ball im Spiel mit Schlag und Distanz.'],
    ['You may keep playing the provisional ball until you reach the area where the original is likely to be; once it is played from a point nearer the hole than that area, it becomes the ball in play.', 'Man darf den provisorischen Ball weiterspielen, bis man den Bereich erreicht, in dem der ursprüngliche vermutlich liegt; wird er von näher am Loch gespielt, wird er zum Ball im Spiel.'],
  ],
  '19.2': [
    ['Back-on-the-line: pick a reference point on the line from the hole through the ball (any distance back); drop within one club-length of it, not nearer the hole.', 'Linie zurück: einen Bezugspunkt auf der Linie Loch–Ball wählen (beliebig weit zurück); innerhalb einer Schlägerlänge davon droppen, nicht näher zum Loch.'],
  ],
  '20.1': [
    ['In stroke play announce that you play two balls and which one you want to count if the Rules allow it, and report the facts to the committee before returning your scorecard – otherwise disqualification.', 'Im Zählspiel ankündigen, dass man zwei Bälle spielt und welcher zählen soll, wenn die Regeln es erlauben, und es vor Abgabe der Scorekarte der Spielleitung melden – sonst Disqualifikation.'],
  ],
  '4.2': [
    ['A ball that breaks into pieces from a stroke: the stroke does not count – play another ball without penalty from where that stroke was made.', 'Zerbricht der Ball durch einen Schlag in Stücke, zählt der Schlag nicht – straflos einen anderen Ball von dort spielen, wo der Schlag gemacht wurde.'],
  ],
  '4.3': [
    ['Allowed: weather information, the Rules, your own notes and data from earlier rounds, gloves, a towel. Not allowed in a competition: a device that recommends a club or a line of play – like the caddie in this app. Distances are fine.', 'Erlaubt: Wetterinfos, die Regeln, eigene Notizen und Daten aus früheren Runden, Handschuhe, Handtuch. Im Turnier nicht erlaubt: ein Gerät, das Schläger oder Spiellinie empfiehlt – wie der Caddie dieser App. Entfernungen sind in Ordnung.'],
  ],
  '5.6': [
    ['The committee may set a pace of play policy with time limits. A group that has lost its place should close the gap or let the group behind play through.', 'Die Spielleitung kann Richtzeiten für das Spieltempo festlegen. Eine Gruppe, die den Anschluss verloren hat, schließt auf oder lässt die nachfolgende Gruppe durchspielen.'],
  ],
  '5.7': [
    ['Signals: one long tone means stop immediately; three short tones mean a normal suspension – you may finish the hole you are playing; two short tones mean play resumes.', 'Signale: ein langer Ton heißt sofort aufhören; drei kurze Töne heißen normale Unterbrechung – das laufende Loch darf zu Ende gespielt werden; zwei kurze Töne heißen weiterspielen.'],
    ['When play resumes, continue from where you stopped; if you lifted the ball, replace it (or another ball) on the marked spot.', 'Beim Fortsetzen dort weiterspielen, wo unterbrochen wurde; wurde der Ball aufgenommen, ihn (oder einen anderen) an die markierte Stelle zurücklegen.'],
  ],
  '6.2': [
    ['A tee must not be longer than 101.6 mm. Do not move the tee-markers to improve your stance or swing (general penalty).', 'Ein Tee darf höchstens 101,6 mm lang sein. Die Abschlagmarkierungen nicht bewegen, um Stand oder Schwung zu verbessern (Grundstrafe).'],
    ['A ball in play that is still in the teeing area after a stroke (e.g. a topped shot) may be lifted and teed up again without penalty.', 'Bleibt der Ball nach einem Schlag noch im Abschlag liegen (z. B. getoppt), darf man ihn straflos aufnehmen und wieder aufteen.'],
  ],
  '6.4': [
    ['Match play: on the first tee the draw decides the honour, later the winner of the last hole has it (a halved hole keeps the honour). Stroke play: the lowest score on the last hole (net score in a net competition).', 'Lochspiel: am ersten Abschlag entscheidet das Los, danach hat der Gewinner des letzten Lochs die Ehre (bei geteiltem Loch bleibt sie). Zählspiel: das niedrigste Ergebnis am letzten Loch (netto im Nettowettspiel).'],
    ['A provisional ball or another ball from the tee is played after everyone else has played their first stroke.', 'Ein provisorischer oder weiterer Ball vom Abschlag wird gespielt, nachdem alle anderen ihren ersten Schlag gemacht haben.'],
  ],
  '7.2': [
    ['A ball may not be assumed to be yours just because of where it lies. If you cannot identify it, it is lost – so put your own mark on your ball before the round.', 'Ein Ball gilt nicht allein wegen seiner Fundstelle als der eigene. Kann man ihn nicht erkennen, ist er verloren – deshalb den Ball vor der Runde mit einem eigenen Zeichen versehen.'],
  ],
  '7.3': [
    ['You may lift the ball only if you reasonably believe it could be yours; you no longer need to tell anyone beforehand.', 'Aufnehmen darf man nur, wenn man vernünftigerweise annimmt, es könnte der eigene Ball sein; vorher Bescheid sagen muss man nicht mehr.'],
  ],
  '10.1': [
    ['Do not make a stroke with your feet deliberately on either side of, or touching, the line of play or its extension behind the ball.', 'Nicht mit absichtlich beidseits der Spiellinie (oder ihrer Verlängerung hinter dem Ball) gestellten Füßen schlagen und nicht auf ihr stehen.'],
    ['Do not hit a moving ball – except a ball falling off the tee, one moving in water in a penalty area, or one that starts moving after the backswing began.', 'Keinen sich bewegenden Ball schlagen – außer einen vom Tee fallenden Ball, einen im Wasser einer Penalty Area treibenden oder einen, der sich erst nach Beginn des Rückschwungs bewegt.'],
  ],
  '10.3': [
    ['Your caddie may mark and lift your ball on the green without asking you; elsewhere only with your permission. Your caddie may not decide that the ball is unplayable or take relief (drop) for you.', 'Auf dem Grün darf der Caddie den Ball ohne Rückfrage markieren und aufnehmen, anderswo nur mit Erlaubnis. Den Ball für unspielbar erklären oder für einen droppen darf der Caddie nicht.'],
  ],
  '12.1': [
    ['A ball on soil or grass inside the bunker without touching sand is not in the bunker; a wall or face of grass or soil is not part of it.', 'Ein Ball auf Erde oder Gras innerhalb des Bunkers, der keinen Sand berührt, ist nicht im Bunker; Wände oder Kanten aus Gras oder Erde gehören nicht dazu.'],
  ],
  '14.1': [
    ['Lifting without marking, marking wrongly or playing with the ball-marker still in place: one penalty stroke.', 'Ohne Markieren aufnehmen, falsch markieren oder mit liegengelassenem Ballmarker spielen: ein Strafschlag.'],
  ],
  '14.5': [
    ['When correcting the mistake you may also change to another relief option or another Rule.', 'Beim Korrigieren darf man auch eine andere Erleichterungsmöglichkeit oder eine andere Regel wählen.'],
  ],
  '14.7': [
    ['A serious breach means a significant advantage, e.g. a much shorter shot. To correct it, finish the hole with a ball played from the right place; the strokes and penalties with the wrong ball count.', 'Schwerwiegend heißt: deutlicher Vorteil, z. B. ein viel kürzerer Schlag. Zur Korrektur das Loch mit einem Ball vom richtigen Ort beenden; die Schläge und Strafen mit dem falschen Ball zählen mit.'],
  ],
  '15.1': [
    ['Loose impediments are natural objects that are not fixed: stones, leaves, twigs, insects, worms, dung, casts. Sand and loose soil count only on the green; dew, frost and water never.', 'Lose hinderliche Naturstoffe sind lose Naturdinge: Steine, Blätter, Zweige, Insekten, Würmer, Dung, Erdhäufchen. Sand und lose Erde zählen nur auf dem Grün dazu; Tau, Reif und Wasser nie.'],
  ],
  '18.1': [
    ['You may do this at any time, for any reason – e.g. after a bad shot. The original ball is then no longer in play.', 'Das geht jederzeit und ohne Grund – z. B. nach einem schlechten Schlag. Der ursprüngliche Ball ist dann nicht mehr im Spiel.'],
  ],
  '19.1': [
    ['You do not have to find the ball to declare it unplayable – but without the ball only stroke and distance is left.', 'Man muss den Ball nicht finden, um ihn für unspielbar zu erklären – ohne gefundenen Ball bleibt aber nur Schlag und Distanz.'],
  ],
  '21.1': [
    ['If you pick up or do not hole out, you score zero points on that hole – no disqualification.', 'Nimmt man auf oder locht nicht ein, gibt es an diesem Loch null Punkte – keine Disqualifikation.'],
  ],
  '21.2': [
    ['If you do not hole out, you get the maximum score for that hole.', 'Wer ein Loch nicht beendet, bekommt das Maximum für dieses Loch.'],
  ],
  '22.3': [
    ['If the wrong partner plays: general penalty; correct it with the right partner from where the wrong stroke was made (in stroke play before the next tee, otherwise disqualification).', 'Spielt der falsche Partner: Grundstrafe; mit dem richtigen Partner vom Ort des falschen Schlags korrigieren (im Zählspiel vor dem nächsten Abschlag, sonst Disqualifikation).'],
  ],
};

// Words players search for that the text does not use (a cart path, "second ball", stakes …) – they lead to the right
// section first.
export const KEYS: Record<string, string> = {
  '16.1': 'cartweg weg straße sprinkler pfütze wasser zeitweiliges cart path road puddle casual water',
  '17.1': 'wasser teich bach see graben gelbe pfähle rote pfähle gelb rot water pond lake creek ditch yellow red stakes',
  '2.1': 'weiße pfähle zaun mauer grenze white stakes fence wall boundary',
  '18.2': 'weiße pfähle verloren lost white stakes',
  '18.3': 'zweiter ball second ball',
  '20.1': 'zweiter ball zwei bälle second ball two balls',
  '4.1': 'schläger kaputt zerbrochen 15 schläger zu viele broken club too many clubs',
  '4.2': 'ball zerbrochen kaputt gesprungen broken ball cracked',
  '3.3': 'unterschreiben unterschrift handicap vorgabe sign signature',
  '5.5': 'putten üben chippen übungsschlag practice putt chip',
  '19.1': 'baum busch wurzel zaun mauer tree bush root fence wall',
  '19.2': 'baum busch wurzel tree bush root',
  '16.2': 'schlange bienen wespen alligator snake bees wasps',
  '15.1': 'blätter steine äste zweige leaves stones twigs',
};
