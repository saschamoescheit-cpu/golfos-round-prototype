import { tr } from '../lib/i18n';
import { G, GENERAL, s } from './rulesOfGolfParts';
import { PART2 } from './rulesOfGolf2';
import { PART3 } from './rulesOfGolf3';
import { LOCAL_RULES } from './rulesLocal';

export { ALL_DEFINITIONS as DEFINITIONS } from './rulesDefinitions';

// The Rules of Golf (R&A and USGA, edition 2023) in the structure of the official rule book – the 25 rules in their
// groups, every rule with its sections – each explained in our own words (Sascha 18.10.2026: "the official R&A rules
// fully integrated, with a search" – all in the app, no link out). The official wording is copyrighted by R&A/USGA
// (German edition: DGV), so it is told in our own words. Local rules of the club come first.

export interface RuleSection {
  id: string; // "14.3"
  title: () => string;
  text: () => string[];
  /** The penalty for breaching it, when there is one. */
  penalty?: () => string;
  /** Words players search for that are not in the text (German and English). */
  keys?: string;
}
export interface Rule {
  n: number;
  group: () => string;
  title: () => string;
  purpose: () => string;
  sections: RuleSection[];
}


const PART1: Rule[] = [
  // ---------------- 1–4 Fundamentals ----------------
  {
    n: 1,
    group: G.basics,
    title: () => tr('The game, player conduct and the Rules', 'Das Spiel, Verhalten der Spieler und die Regeln'),
    purpose: () => tr('The central principles: play the course as you find it and the ball as it lies, act in the spirit of the game, and know the Rules.', 'Die Grundsätze: den Platz spielen, wie man ihn vorfindet, den Ball, wie er liegt, im Geist des Spiels handeln und die Regeln kennen.'),
    sections: [
      s('1.1', 'The game of golf', 'Das Golfspiel',
        ['Golf is played by striking a ball with a club from the teeing area into the hole on the putting green, in as few strokes as possible.'],
        ['Golf wird gespielt, indem man einen Ball mit einem Schläger vom Abschlag bis ins Loch auf dem Grün schlägt – mit möglichst wenigen Schlägen.']),
      s('1.2', 'Standards of player conduct', 'Verhaltensstandards',
        ['Act with integrity, show consideration for others and take good care of the course. The committee may set a code of conduct with its own penalties; serious misconduct can lead to disqualification.'],
        ['Integer handeln, Rücksicht auf andere nehmen und den Platz pflegen. Die Spielleitung kann einen Verhaltenskodex mit eigenen Strafen festlegen; schweres Fehlverhalten kann zur Disqualifikation führen.'],
        { keys: 'etikette etiquette verhalten conduct disqualifikation' }),
      s('1.3', 'Playing by the Rules', 'Nach den Regeln spielen',
        ['Players are responsible for applying the Rules to themselves and calling penalties on themselves. Agreeing to ignore a Rule or penalty you know applies means disqualification.', 'Penalties: one stroke, the general penalty (two strokes / loss of hole) or disqualification. Breaches by the same act usually count once.'],
        ['Jeder Spieler wendet die Regeln selbst an und ruft Strafen gegen sich selbst aus. Wer vereinbart, eine bekannte Regel oder Strafe nicht anzuwenden, wird disqualifiziert.', 'Strafen: ein Strafschlag, die Grundstrafe (zwei Schläge / Lochverlust) oder Disqualifikation. Mehrere Verstöße durch dieselbe Handlung zählen meist nur einmal.'],
        { keys: 'strafe penalty grundstrafe general penalty' }),
    ],
  },
  {
    n: 2,
    group: G.basics,
    title: () => tr('The course', 'Der Platz'),
    purpose: () => tr('The five areas of the course and the objects and conditions that can affect play.', 'Die fünf Bereiche des Platzes und die Gegenstände und Zustände, die das Spiel beeinflussen können.'),
    sections: [
      s('2.1', 'Course boundaries and out of bounds', 'Grenzen des Platzes und Aus',
        ['Out of bounds is everything outside the boundary set by the committee, usually marked with white stakes or lines. A ball is out when all of it is outside the boundary.'],
        ['Aus ist alles außerhalb der von der Spielleitung festgelegten Grenze, meist mit weißen Pfosten oder Linien markiert. Ein Ball ist im Aus, wenn er ganz außerhalb der Grenze liegt.'],
        { keys: 'aus out of bounds weiße pfosten white stakes' }),
      s('2.2', 'Defined areas of the course', 'Die festgelegten Bereiche des Platzes',
        ['The general area, the teeing area of the hole you play, all penalty areas, all bunkers and the putting green of the hole you play. Your ball is always in exactly one of them.'],
        ['Das Gelände, der Abschlag des gespielten Lochs, alle Penalty Areas, alle Bunker und das Grün des gespielten Lochs. Der Ball liegt immer in genau einem dieser Bereiche.'],
        { keys: 'gelände general area fairway rough bereich' }),
      s('2.3', 'Objects or conditions that can interfere with play', 'Gegenstände und Zustände, die das Spiel behindern können',
        ['Loose impediments, movable and immovable obstructions and abnormal course conditions – some allow free relief (Rules 15 and 16).'],
        ['Lose hinderliche Naturstoffe, bewegliche und unbewegliche Hemmnisse sowie ungewöhnliche Platzverhältnisse – einige erlauben straflose Erleichterung (Regeln 15 und 16).']),
      s('2.4', 'No play zones', 'Spielverbotszonen',
        ['Parts of the course where play is not allowed. You must take relief when your ball is in one or it interferes with your stance or swing.'],
        ['Teile des Platzes, in denen nicht gespielt werden darf. Liegt der Ball darin oder behindert die Zone Stand oder Schwung, muss Erleichterung genommen werden.'],
        { keys: 'spielverbotszone no play zone biotop' }),
    ],
  },
  {
    n: 3,
    group: G.basics,
    title: () => tr('The competition', 'Das Turnier'),
    purpose: () => tr('Match play or stroke play, gross or net, and how the result is decided.', 'Lochspiel oder Zählspiel, brutto oder netto, und wie das Ergebnis entschieden wird.'),
    sections: [
      s('3.1', 'Central elements of every competition', 'Grundelemente jedes Turniers',
        ['Play either match play or stroke play; play individually or with a partner; scores are gross or net (with handicap strokes).'],
        ['Gespielt wird Lochspiel oder Zählspiel, allein oder mit Partner; gewertet brutto oder netto (mit Vorgabeschlägen).']),
      s('3.2', 'Match play', 'Lochspiel',
        ['Each hole is won, lost or halved; the match is won by leading by more holes than remain. Concessions of a stroke, hole or the match are final. Tell your opponent your strokes taken when asked, and any penalty you incur.'],
        ['Jedes Loch wird gewonnen, verloren oder geteilt; das Spiel gewinnt, wer mehr Löcher vorn liegt, als noch zu spielen sind. Geschenkte Schläge, Löcher oder das Spiel gelten endgültig. Auf Nachfrage die eigene Schlagzahl nennen und Strafen dem Gegner mitteilen.'],
        { keys: 'lochspiel matchplay schenken concede' }),
      s('3.3', 'Stroke play', 'Zählspiel',
        ['The lowest total score wins. Hole out on every hole – otherwise, if not corrected before the next tee, you are disqualified. A marker records the scores; you certify and return your scorecard. A score lower than actual means disqualification; a higher score stands.'],
        ['Die niedrigste Gesamtschlagzahl gewinnt. Jedes Loch muss zu Ende gespielt werden – sonst Disqualifikation, wenn nicht vor dem nächsten Abschlag korrigiert. Ein Zähler notiert die Ergebnisse; man bestätigt und reicht die Scorekarte ein. Ein zu niedriges Ergebnis führt zur Disqualifikation, ein zu hohes bleibt stehen.'],
        { keys: 'zählspiel strokeplay scorekarte scorecard unterschrift sign zähler marker' }),
    ],
  },
  {
    n: 4,
    group: G.basics,
    title: () => tr('The player’s equipment', 'Ausrüstung des Spielers'),
    purpose: () => tr('Which clubs and balls are allowed, how many clubs, and which devices may be used.', 'Welche Schläger und Bälle erlaubt sind, wie viele Schläger, und welche Hilfsmittel genutzt werden dürfen.'),
    sections: [
      s('4.1', 'Clubs', 'Schläger',
        ['Only conforming clubs; a club damaged during the round may still be used or repaired, not replaced unless you did not cause the damage. At most 14 clubs.'],
        ['Nur regelkonforme Schläger; ein während der Runde beschädigter Schläger darf weiter benutzt oder repariert, aber nur ersetzt werden, wenn man den Schaden nicht selbst verursacht hat. Höchstens 14 Schläger.'],
        { penalty: () => tr('Too many clubs: in match play the match is adjusted by one hole per hole breached (max. two); in stroke play two strokes per hole (max. four).', 'Zu viele Schläger: im Lochspiel wird der Spielstand je Loch um ein Loch angepasst (höchstens zwei); im Zählspiel zwei Strafschläge je Loch (höchstens vier).'), keys: '14 schläger clubs bag zu viele' }),
      s('4.2', 'Balls', 'Bälle',
        ['Only conforming balls. A ball that is cut or cracked during the hole may be replaced; scuffs or scratches are not enough.'],
        ['Nur regelkonforme Bälle. Ein während des Lochs geschnittener oder gesprungener Ball darf ersetzt werden; Kratzer reichen nicht.'],
        { keys: 'ball beschädigt cracked' }),
      s('4.3', 'Use of equipment', 'Gebrauch von Ausrüstung',
        ['Distance information is allowed (rangefinder, GPS – like this app) unless a local rule bans it. Not allowed: measuring slope with a device during a competition round where banned, artificial aids for swing or alignment, or getting advice from a device.'],
        ['Entfernungsangaben sind erlaubt (Laser, GPS – wie diese App), außer eine Platzregel verbietet es. Nicht erlaubt: Hilfsmittel, die künstlich bei Schwung oder Ausrichtung helfen, oder Beratung durch ein Gerät; Höhenmessung nur, wenn die Spielleitung es zulässt.'],
        { penalty: GENERAL, keys: 'entfernungsmesser rangefinder laser gps app handy phone' }),
    ],
  },
  // ---------------- 5–6 Round and hole ----------------
  {
    n: 5,
    group: G.round,
    title: () => tr('Playing the round', 'Spielen der Runde'),
    purpose: () => tr('When the round starts and ends, practice, pace of play and stopping play.', 'Wann die Runde beginnt und endet, Üben, Spieltempo und Unterbrechen.'),
    sections: [
      s('5.1', 'Meaning of round', 'Bedeutung der Runde', ['18 or fewer holes in the order set by the committee.'], ['18 oder weniger Löcher in der von der Spielleitung festgelegten Reihenfolge.']),
      s('5.2', 'Practising on the course before or between rounds', 'Üben auf dem Platz vor oder zwischen Runden',
        ['In match play you may practise on the course before a round; in stroke play not on the competition day (unless the committee allows).'],
        ['Im Lochspiel darf man vor der Runde auf dem Platz üben; im Zählspiel am Turniertag nicht (außer die Spielleitung erlaubt es).'],
        { penalty: GENERAL }),
      s('5.3', 'Starting and ending the round', 'Beginn und Ende der Runde',
        ['Start at your starting time – up to five minutes late costs the general penalty on the first hole, more than five minutes means disqualification.'],
        ['Pünktlich zur Startzeit beginnen – bis zu fünf Minuten zu spät kostet die Grundstrafe am ersten Loch, mehr als fünf Minuten führt zur Disqualifikation.'],
        { keys: 'startzeit tee time zu spät late' }),
      s('5.4', 'Playing in groups', 'Spielen in Gruppen', ['Stay in your group for the whole round unless the committee changes it.'], ['Die ganze Runde in der eigenen Gruppe bleiben, außer die Spielleitung ändert es.']),
      s('5.5', 'Practising during the round or while play is stopped', 'Üben während der Runde oder einer Unterbrechung',
        ['No practice strokes during play of a hole. Between holes a few chips or putts near the green just played or the next tee are allowed.'],
        ['Keine Übungsschläge während des Spielens eines Lochs. Zwischen zwei Löchern sind ein paar Chips oder Putts am gerade gespielten Grün oder am nächsten Abschlag erlaubt.'],
        { penalty: GENERAL, keys: 'üben practice probeschwung' }),
      s('5.6', 'Unreasonable delay; prompt pace of play', 'Unzumutbare Verzögerung; zügiges Spiel',
        ['Play at a prompt pace – take no more than 40 seconds for a stroke when you are able to play, and play out of turn in stroke play ("ready golf") when it is safe.'],
        ['Zügig spielen – höchstens 40 Sekunden für einen Schlag, wenn man spielen kann, und im Zählspiel „Ready Golf“ spielen, wenn es sicher ist.'],
        { penalty: () => tr('Unreasonable delay: one stroke, then the general penalty, then disqualification.', 'Unzumutbare Verzögerung: ein Strafschlag, dann Grundstrafe, dann Disqualifikation.'), keys: 'spieltempo pace slow play ready golf 40 sekunden' }),
      s('5.7', 'Stopping play; resuming play', 'Spiel unterbrechen und fortsetzen',
        ['Stop immediately when the committee suspends play for danger (lightning). You may stop yourself if you reasonably believe there is danger. Mark the ball when you stop.'],
        ['Sofort aufhören, wenn die Spielleitung wegen Gefahr (Gewitter) unterbricht. Man darf selbst unterbrechen, wenn man vernünftigerweise Gefahr annimmt. Beim Unterbrechen den Ball markieren.'],
        { keys: 'gewitter blitz lightning unterbrechung suspension' }),
    ],
  },
  {
    n: 6,
    group: G.round,
    title: () => tr('Playing a hole', 'Spielen eines Lochs'),
    purpose: () => tr('Starting from the teeing area, playing the same ball, the order of play and holing out.', 'Vom Abschlag beginnen, denselben Ball spielen, die Spielfolge und das Einlochen.'),
    sections: [
      s('6.1', 'Starting play of a hole', 'Beginnen eines Lochs',
        ['Play from inside the teeing area: between the tee markers and up to two club-lengths behind them. Your feet may be outside.'],
        ['Vom Abschlag spielen: zwischen den Abschlagmarkierungen und bis zu zwei Schlägerlängen dahinter. Die Füße dürfen außerhalb stehen.'],
        { penalty: () => tr('Outside the teeing area: in match play the opponent may cancel the stroke; in stroke play two strokes and play again from inside it.', 'Außerhalb des Abschlags: im Lochspiel darf der Gegner den Schlag annullieren; im Zählspiel zwei Strafschläge und erneut vom Abschlag spielen.'), keys: 'abschlag tee markierungen schlägerlängen' }),
      s('6.2', 'Playing ball from teeing area', 'Ball vom Abschlag spielen',
        ['The ball may be teed on a conforming tee or played from the ground. You may improve conditions in the teeing area (press down grass, remove dew).'],
        ['Der Ball darf aufgeteet oder vom Boden gespielt werden. Im Abschlag darf man die Bedingungen verbessern (Gras niederdrücken, Tau entfernen).'],
        { keys: 'tee aufteen' }),
      s('6.3', 'Ball used in play of a hole', 'Ball beim Spielen eines Lochs',
        ['Hole out with the ball played from the tee unless a Rule allows a substitute. Playing a wrong ball costs the general penalty – correct it by playing the right ball.'],
        ['Mit dem vom Abschlag gespielten Ball einlochen, außer eine Regel erlaubt einen Ersatzball. Ein falscher Ball kostet die Grundstrafe – den Fehler korrigieren, indem man den richtigen Ball spielt.'],
        { penalty: GENERAL, keys: 'falscher ball wrong ball ersatzball substitute' }),
      s('6.4', 'Order of play when playing a hole', 'Spielfolge',
        ['The ball farthest from the hole plays first; honour on the tee goes to the lowest score on the last hole. In stroke play ready golf is encouraged; in match play the opponent may cancel a stroke played out of turn.'],
        ['Wer am weitesten vom Loch entfernt ist, spielt zuerst; die Ehre am Abschlag hat das beste Ergebnis am letzten Loch. Im Zählspiel ist Ready Golf erwünscht; im Lochspiel darf der Gegner einen Schlag außer der Reihe annullieren.'],
        { keys: 'reihenfolge order honour ehre' }),
      s('6.5', 'Completing play of a hole', 'Beenden eines Lochs', ['A hole is completed when the ball is holed (or the stroke, hole or match is conceded in match play).'], ['Ein Loch ist beendet, wenn der Ball eingelocht ist (oder im Lochspiel geschenkt wurde).']),
    ],
  },
  // ---------------- 7–11 Playing the ball ----------------
  {
    n: 7,
    group: G.ball,
    title: () => tr('Ball search: finding and identifying ball', 'Ballsuche: Ball finden und identifizieren'),
    purpose: () => tr('How you may search for your ball and identify it – and that there is no penalty for moving it accidentally while searching.', 'Wie man den Ball suchen und identifizieren darf – und dass es straflos ist, ihn dabei versehentlich zu bewegen.'),
    sections: [
      s('7.1', 'How to fairly search for ball', 'Fair suchen',
        ['You may move sand and loose impediments and touch grass to find the ball, but not improve your lie, stance or swing beyond what is needed. You have three minutes to search.'],
        ['Man darf Sand und lose Naturstoffe bewegen und Gras berühren, um den Ball zu finden, aber dabei nicht Lage, Stand oder Schwung verbessern. Für die Suche hat man drei Minuten.'],
        { keys: 'suchen suche drei minuten 3 minutes search' }),
      s('7.2', 'How to identify ball', 'Ball identifizieren', ['By seeing it come to rest, by your identification mark, or by its brand, model and number.'], ['Man erkennt den eigenen Ball, indem man ihn liegen bleiben sieht, an der eigenen Markierung oder an Marke, Modell und Nummer.']),
      s('7.3', 'Lifting ball to identify it', 'Ball zum Identifizieren aufnehmen',
        ['Mark the spot first and clean the ball only as much as needed to identify it, then replace it.'],
        ['Erst die Stelle markieren, den Ball nur so weit reinigen wie nötig, dann zurücklegen.'],
        { penalty: () => tr('One stroke if you lift without marking or clean it more than needed.', 'Ein Strafschlag, wenn man ohne Markieren aufnimmt oder mehr als nötig reinigt.') }),
      s('7.4', 'Ball accidentally moved in trying to find or identify it', 'Ball beim Suchen versehentlich bewegt', ['No penalty – replace it on its original spot (estimated if not known).'], ['Straflos – an die ursprüngliche Stelle zurücklegen (geschätzt, wenn nicht bekannt).']),
    ],
  },
  {
    n: 8,
    group: G.ball,
    title: () => tr('Course played as it is found', 'Den Platz spielen, wie er vorgefunden wird'),
    purpose: () => tr('You must not improve the conditions affecting your stroke – lie, area of stance or swing, line of play, relief area.', 'Man darf die Bedingungen für den Schlag nicht verbessern – Lage, Stand- und Schwungraum, Spiellinie, Erleichterungsbereich.'),
    sections: [
      s('8.1', 'Player’s actions that improve conditions affecting the stroke', 'Handlungen, die die Bedingungen verbessern',
        ['Not allowed: moving or bending growing things, pressing down the ground, removing sand or loose soil (except on the green), creating or removing irregularities. Allowed: fairly taking your stance, grounding the club lightly, removing loose impediments and movable obstructions.'],
        ['Nicht erlaubt: Wachsendes bewegen oder biegen, Boden niederdrücken, Sand oder lose Erde entfernen (außer auf dem Grün), Unebenheiten schaffen oder beseitigen. Erlaubt: fair den Stand einnehmen, den Schläger leicht aufsetzen, lose Naturstoffe und bewegliche Hemmnisse entfernen.'],
        { penalty: GENERAL, keys: 'lage verbessern improve lie zweig ast' }),
      s('8.2', 'Altering conditions for where your ball will come to rest', 'Bedingungen für die spätere Lage verändern', ['You must not deliberately alter conditions where your ball may come to rest after the stroke.'], ['Man darf nicht absichtlich die Bedingungen dort verändern, wo der Ball nach dem Schlag liegen bleiben könnte.'], { penalty: GENERAL }),
      s('8.3', 'Altering conditions for another player', 'Bedingungen für einen anderen Spieler verändern', ['You must not deliberately alter conditions to affect another player’s stroke.'], ['Man darf nicht absichtlich die Bedingungen für den Schlag eines anderen Spielers verändern.'], { penalty: GENERAL }),
    ],
  },
  {
    n: 9,
    group: G.ball,
    title: () => tr('Ball played as it lies; ball at rest lifted or moved', 'Ball spielen, wie er liegt; Ball in Ruhe aufgenommen oder bewegt'),
    purpose: () => tr('Play the ball as it lies; what happens if it is lifted or moved by you, an opponent, an outside influence or natural forces.', 'Den Ball spielen, wie er liegt; was gilt, wenn er von einem selbst, dem Gegner, einem äußeren Einfluss oder Naturkräften bewegt wird.'),
    sections: [
      s('9.1', 'Ball played as it lies', 'Ball spielen, wie er liegt', ['Play the ball from where it lies. If it moves during the backswing or stroke after it started moving, play it as it is – no replacing.'], ['Den Ball von dort spielen, wo er liegt. Bewegt er sich, nachdem der Rückschwung begonnen hat, wird er so gespielt – kein Zurücklegen.']),
      s('9.2', 'Deciding whether ball moved and what caused it to move', 'Hat sich der Ball bewegt – und warum?', ['A ball only moved if that is known or virtually certain. Wind, water or gravity are natural forces; you, your opponent or an outside influence are other causes.'], ['Ein Ball hat sich nur bewegt, wenn das bekannt oder so gut wie sicher ist. Wind, Wasser oder Schwerkraft sind Naturkräfte; man selbst, der Gegner oder ein äußerer Einfluss sind andere Ursachen.']),
      s('9.3', 'Ball moved by natural forces', 'Ball durch Naturkräfte bewegt', ['Play it from its new spot without penalty. Exception: if it moves after you have lifted and replaced it on the green, replace it on its original spot.'], ['Straflos von der neuen Stelle spielen. Ausnahme: auf dem Grün nach Aufnehmen und Zurücklegen – dann an die ursprüngliche Stelle zurücklegen.'], { keys: 'wind ball bewegt sich moved' }),
      s('9.4', 'Ball lifted or moved by player', 'Ball vom Spieler aufgenommen oder bewegt', ['If you cause your ball to move (except when allowed, e.g. while searching or on the green), replace it.'], ['Bewegt man den eigenen Ball (außer wo erlaubt, z. B. beim Suchen oder auf dem Grün), muss er zurückgelegt werden.'], { penalty: () => tr('One stroke.', 'Ein Strafschlag.') }),
      s('9.5', 'Ball lifted or moved by opponent in match play', 'Ball im Lochspiel vom Gegner bewegt', ['Replace it; the opponent gets one penalty stroke unless an exception applies.'], ['Zurücklegen; der Gegner erhält einen Strafschlag, außer eine Ausnahme greift.']),
      s('9.6', 'Ball lifted or moved by outside influence', 'Ball durch äußeren Einfluss bewegt', ['No penalty – replace it on its original spot (estimated if not known).'], ['Straflos – an die ursprüngliche Stelle zurücklegen (geschätzt, wenn unbekannt).'], { keys: 'tier hund dog bird vogel anderer spieler' }),
      s('9.7', 'Ball-marker lifted or moved', 'Ballmarker aufgenommen oder bewegt', ['No penalty if the marker is moved before the ball is replaced – put the ball or marker back.'], ['Straflos, wenn der Marker vor dem Zurücklegen bewegt wird – Ball oder Marker zurücklegen.']),
    ],
  },
  {
    n: 10,
    group: G.ball,
    title: () => tr('Preparing for and making a stroke; advice and help; caddies', 'Auf einen Schlag vorbereiten und ausführen; Beratung und Hilfe; Caddies'),
    purpose: () => tr('How to make a stroke, what advice is allowed, and what a caddie may do.', 'Wie ein Schlag ausgeführt wird, welche Beratung erlaubt ist und was ein Caddie darf.'),
    sections: [
      s('10.1', 'Making a stroke', 'Einen Schlag ausführen', ['Strike the ball fairly with the head of the club – no pushing, scraping or spooning. Anchoring the club against the body is not allowed.'], ['Den Ball ordentlich mit dem Schlägerkopf treffen – nicht schieben, kratzen oder schaufeln. Den Schläger am Körper zu verankern ist verboten.'], { penalty: GENERAL, keys: 'verankern anchoring besenstiel' }),
      s('10.2', 'Advice and other help', 'Beratung und andere Hilfe',
        ['During a round you may not give advice to anyone in the competition except your partner, or ask for advice from anyone except your caddie and partner. Public information (rules, distances) is not advice. No one may stand behind you on your line while you take your stance.'],
        ['Während der Runde darf man niemandem im Turnier außer dem Partner Rat geben und nur Caddie und Partner um Rat fragen. Öffentliche Informationen (Regeln, Entfernungen) sind kein Rat. Beim Einnehmen des Stands darf niemand hinter einem auf der Linie stehen.'],
        { penalty: GENERAL, keys: 'rat advice tipp helfen' }),
      s('10.3', 'Caddies', 'Caddies', ['One caddie at a time may carry your clubs, give advice and help (e.g. search, mark and lift the ball on the green). You are responsible for the caddie’s breaches.'], ['Ein Caddie zur Zeit darf die Schläger tragen, Rat geben und helfen (z. B. suchen, den Ball auf dem Grün markieren und aufnehmen). Für Verstöße des Caddies ist man selbst verantwortlich.'], { keys: 'caddie' }),
    ],
  },
  {
    n: 11,
    group: G.ball,
    title: () => tr('Ball in motion accidentally hits person, animal or object; deliberate actions to affect ball in motion', 'Ball in Bewegung trifft versehentlich Person, Tier oder Gegenstand; absichtliche Handlungen, um den Ball zu beeinflussen'),
    purpose: () => tr('What happens when a moving ball hits someone or something – and that you must not deliberately stop or deflect it.', 'Was gilt, wenn ein Ball in Bewegung jemanden oder etwas trifft – und dass man ihn nicht absichtlich aufhalten oder ablenken darf.'),
    sections: [
      s('11.1', 'Ball in motion accidentally hits person or outside influence', 'Ball trifft versehentlich Person oder äußeren Einfluss',
        ['No penalty for anyone – play the ball as it lies. Exception: a stroke from the putting green that hits a person, animal or movable obstruction there (or another ball at rest on the green) is replayed – in stroke play two strokes when it hits another ball.'],
        ['Straflos für alle – den Ball spielen, wie er liegt. Ausnahme: ein Schlag vom Grün, der dort eine Person, ein Tier oder ein bewegliches Hemmnis trifft, wird wiederholt; trifft er dort einen anderen ruhenden Ball, gibt es im Zählspiel zwei Strafschläge.'],
        { keys: 'trifft hits person sich selbst eigene tasche fahne' }),
      s('11.2', 'Ball in motion deliberately deflected or stopped by person', 'Ball absichtlich abgelenkt oder aufgehalten', ['Nobody may deliberately deflect or stop a moving ball. The stroke is replayed or the ball is placed where it would have come to rest.'], ['Niemand darf einen Ball in Bewegung absichtlich ablenken oder aufhalten. Der Schlag wird wiederholt oder der Ball dorthin gelegt, wo er liegen geblieben wäre.'], { penalty: GENERAL }),
      s('11.3', 'Deliberately moving objects or altering conditions to affect ball in motion', 'Gegenstände absichtlich entfernen, um den rollenden Ball zu beeinflussen', ['While a ball is in motion, do not remove obstructions, the flagstick or loose impediments to affect where it ends up (except the attended flagstick and other balls on the green).'], ['Solange ein Ball rollt, dürfen keine Hemmnisse, Fahne oder losen Naturstoffe entfernt werden, um seinen Lauf zu beeinflussen (außer die bediente Fahne und andere Bälle auf dem Grün).'], { penalty: GENERAL }),
    ],
  },
];

export const RULES_OF_GOLF: Rule[] = [...PART1, ...PART2, ...PART3, LOCAL_RULES];
