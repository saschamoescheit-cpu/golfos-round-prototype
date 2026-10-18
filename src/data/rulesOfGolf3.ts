import { tr } from '../lib/i18n';
import type { Rule } from './rulesOfGolf';
import { G, GENERAL, s } from './rulesOfGolfParts';

// Rules 20–25 (see rulesOfGolf.ts).
export const PART3: Rule[] = [
  {
    n: 20,
    group: G.procedures,
    title: () => tr('Resolving rules issues during round; rulings by referee and committee', 'Regelfragen während der Runde klären; Entscheidungen von Referee und Spielleitung'),
    purpose: () => tr('What to do when you are unsure how a rule applies – in stroke play you may play two balls.', 'Was man tun kann, wenn man unsicher ist, wie eine Regel gilt – im Zählspiel darf man zwei Bälle spielen.'),
    sections: [
      s('20.1', 'Resolving rules issues during round', 'Regelfragen während der Runde', ['Match play: settle it with your opponent or make a timely request for a ruling. Stroke play: if unsure, play two balls and report it to the committee before returning your scorecard.'], ['Lochspiel: mit dem Gegner klären oder rechtzeitig eine Entscheidung verlangen. Zählspiel: im Zweifel zwei Bälle spielen und es vor Abgabe der Scorekarte der Spielleitung melden.'], { keys: 'zwei bälle two balls zweifel doubt' }),
      s('20.2', 'Rulings on issues under the Rules', 'Regelentscheidungen', ['A referee’s ruling is final; the committee decides in the absence of a referee. Video evidence is limited by what can reasonably be seen with the naked eye.'], ['Die Entscheidung eines Referees ist endgültig; ohne Referee entscheidet die Spielleitung. Videobeweis zählt nur, soweit es mit bloßem Auge vernünftigerweise erkennbar war.']),
      s('20.3', 'Situations not covered by the Rules', 'Nicht geregelte Situationen', ['The committee decides in the spirit of the Rules.'], ['Die Spielleitung entscheidet im Sinne der Regeln.']),
    ],
  },
  {
    n: 21,
    group: G.forms,
    title: () => tr('Other forms of individual stroke play and match play', 'Andere Formen des Einzel-Zählspiels und Einzel-Lochspiels'),
    purpose: () => tr('Stableford, maximum score, par/bogey and three-ball match play.', 'Stableford, Maximum Score, Par/Bogey und Dreier-Lochspiel.'),
    sections: [
      s('21.1', 'Stableford', 'Stableford', ['Points per hole against a fixed score (usually net par): 0 for double bogey or worse, 1 bogey, 2 par, 3 birdie, 4 eagle, 5 albatross. Most points win; you may pick up once you cannot score a point.'], ['Punkte je Loch gegen ein festes Ergebnis (meist Netto-Par): 0 für Doppelbogey oder schlechter, 1 Bogey, 2 Par, 3 Birdie, 4 Eagle, 5 Albatross. Die meisten Punkte gewinnen; man darf aufnehmen, sobald kein Punkt mehr möglich ist.'], { keys: 'stableford punkte points aufnehmen pick up' }),
      s('21.2', 'Maximum score', 'Maximum Score', ['Your score on a hole is capped at the maximum set by the committee (e.g. double par or net double bogey).'], ['Das Ergebnis je Loch ist auf ein von der Spielleitung festgelegtes Maximum begrenzt (z. B. doppeltes Par oder Netto-Doppelbogey).'], { keys: 'maximum netto doppelbogey net double bogey handicap whs' }),
      s('21.3', 'Par/Bogey', 'Par/Bogey', ['Scored like match play against a fixed score per hole: won, lost or halved.'], ['Gewertet wie Lochspiel gegen ein festes Ergebnis je Loch: gewonnen, verloren oder geteilt.']),
      s('21.4', 'Three-ball match play', 'Dreier-Lochspiel', ['Each player plays two separate matches against the two others at the same time.'], ['Jeder spielt gleichzeitig zwei getrennte Lochspiele gegen die beiden anderen.']),
      s('21.5', 'Other forms of playing golf', 'Andere Spielformen', ['Formats like scramble or greensomes are not covered in detail; the committee adapts the Rules.'], ['Formate wie Scramble oder Greensome sind nicht im Detail geregelt; die Spielleitung passt die Regeln an.'], { keys: 'scramble greensome texas' }),
    ],
  },
  {
    n: 22,
    group: G.forms,
    title: () => tr('Foursomes (also known as alternate shot)', 'Vierer (auch Klassischer Vierer)'),
    purpose: () => tr('Two partners play one ball, striking it in turn.', 'Zwei Partner spielen einen Ball und schlagen abwechselnd.'),
    sections: [
      s('22.1', 'Overview of foursomes', 'Überblick', ['Two partners compete as a side with one ball.'], ['Zwei Partner spielen als Partei mit einem Ball.']),
      s('22.2', 'Either partner may act for side', 'Jeder Partner darf für die Partei handeln', ['Either partner may take actions for the side before a stroke (marking, dropping) – any breach counts for the side.'], ['Jeder Partner darf vor dem Schlag für die Partei handeln (markieren, droppen) – Verstöße zählen für die Partei.']),
      s('22.3', 'Side must alternate in making strokes', 'Abwechselnd schlagen', ['The partners alternate on every stroke; penalty strokes do not change the order. One partner tees off on the odd holes, the other on the even holes.'], ['Die Partner schlagen abwechselnd; Strafschläge ändern die Reihenfolge nicht. Ein Partner schlägt an den ungeraden Löchern ab, der andere an den geraden.'], { penalty: GENERAL }),
      s('22.4', 'Starting the round', 'Beginn der Runde', ['The side decides which partner starts.'], ['Die Partei entscheidet, wer beginnt.']),
      s('22.5', 'Partners may share clubs', 'Partner dürfen Schläger teilen', ['Partners may share clubs if together they have no more than 14.'], ['Partner dürfen Schläger teilen, wenn sie zusammen nicht mehr als 14 haben.']),
    ],
  },
  {
    n: 23,
    group: G.forms,
    title: () => tr('Four-ball', 'Vierball'),
    purpose: () => tr('Two partners each play their own ball; the better score counts for the side.', 'Zwei Partner spielen je ihren eigenen Ball; das bessere Ergebnis zählt für die Partei.'),
    sections: [
      s('23.1', 'Overview of four-ball', 'Überblick', ['Each partner plays their own ball; the lower score of the partners is the side’s score on the hole.'], ['Jeder Partner spielt seinen Ball; das niedrigere Ergebnis ist das Ergebnis der Partei am Loch.'], { keys: 'bestball better ball vierball fourball' }),
      s('23.2', 'Scoring in four-ball', 'Wertung im Vierball', ['In stroke play the partners’ scores must be clearly attributed on the scorecard.'], ['Im Zählspiel müssen die Ergebnisse auf der Scorekarte eindeutig den Partnern zugeordnet sein.']),
      s('23.3', 'When round starts and ends; when hole is completed', 'Beginn und Ende', ['A partner who cannot help the side may stop playing the hole.'], ['Ein Partner, der der Partei nicht mehr helfen kann, darf das Loch beenden.']),
      s('23.4', 'One or both partners may represent the side', 'Ein oder beide Partner vertreten die Partei', ['A side may be represented by one partner for all or part of the round.'], ['Eine Partei darf für die ganze oder einen Teil der Runde von einem Partner vertreten werden.']),
      s('23.5', 'Player’s actions affecting partner’s play', 'Handlungen mit Wirkung auf den Partner', ['You may take the same actions for your partner’s ball as your partner may (e.g. mark, lift).'], ['Man darf für den Ball des Partners dieselben Handlungen vornehmen wie der Partner (z. B. markieren, aufnehmen).']),
      s('23.6', 'Side’s order of play', 'Spielfolge der Partei', ['Partners may play in the order the side considers best.'], ['Die Partner dürfen in der Reihenfolge spielen, die für die Partei am besten ist.']),
      s('23.7', 'Partners may share clubs', 'Partner dürfen Schläger teilen', ['Allowed if together they have no more than 14 clubs.'], ['Erlaubt, wenn sie zusammen nicht mehr als 14 Schläger haben.']),
      s('23.8', 'When penalty applies to partner only or to both partners', 'Strafe für einen oder beide Partner', ['Usually a penalty applies to the partner who breached; it applies to the side when the breach helped the partner’s play.'], ['Meist trifft die Strafe nur den Partner, der verstoßen hat; der Partei, wenn der Verstoß dem Partner geholfen hat.']),
    ],
  },
  {
    n: 24,
    group: G.forms,
    title: () => tr('Team competitions', 'Mannschaftswettspiele'),
    purpose: () => tr('Teams of players or sides; advice from a team captain or coach.', 'Mannschaften aus Spielern oder Parteien; Rat von Kapitän oder Trainer.'),
    sections: [
      s('24.1', 'Overview of team competitions', 'Überblick', ['A team competition is played by teams; results are combined according to the terms of the competition.'], ['Ein Mannschaftswettspiel wird von Mannschaften gespielt; die Ergebnisse werden nach der Ausschreibung zusammengefasst.']),
      s('24.2', 'Terms of team competition', 'Ausschreibung', ['The committee sets the form of play and how team scores are calculated.'], ['Die Spielleitung legt die Spielform und die Mannschaftswertung fest.']),
      s('24.3', 'Team captain', 'Mannschaftskapitän', ['A team may have a captain who leads it and may give advice if the terms allow.'], ['Eine Mannschaft darf einen Kapitän haben, der sie führt und – wenn erlaubt – Rat geben darf.']),
      s('24.4', 'Advice allowed in team competition', 'Erlaubter Rat', ['The committee may allow up to two advice givers per team.'], ['Die Spielleitung kann bis zu zwei Ratgeber je Mannschaft erlauben.']),
    ],
  },
  {
    n: 25,
    group: G.disability,
    title: () => tr('Modifications for players with disabilities', 'Anpassungen für Spieler mit Behinderungen'),
    purpose: () => tr('Adjusted rules so that players with disabilities can play fairly with others.', 'Angepasste Regeln, damit Spieler mit Behinderungen fair mit anderen spielen können.'),
    sections: [
      s('25.1', 'Overview', 'Überblick', ['The modifications apply to all players in the categories below, also without a classification.'], ['Die Anpassungen gelten für alle Spieler der genannten Gruppen, auch ohne Klassifizierung.']),
      s('25.2', 'Players who are blind', 'Blinde Spieler', ['An assistant may help with alignment and stance, and the player may ground the club in a bunker.'], ['Ein Assistent darf bei Ausrichtung und Stand helfen; der Spieler darf im Bunker den Schläger aufsetzen.']),
      s('25.3', 'Players who are amputees', 'Spieler mit Amputationen', ['Prosthetic limbs are allowed when there is a medical reason, even if they might help the swing.'], ['Prothesen sind bei medizinischem Grund erlaubt, auch wenn sie beim Schwung helfen könnten.']),
      s('25.4', 'Players who use mobility devices', 'Spieler mit Mobilitätshilfen', ['A wheelchair, cart or other aid may be used; stance, the bunker rules and relief are adapted so the player can play with it, and an assistant may help.'], ['Rollstuhl, Cart oder andere Hilfen sind erlaubt; Stand, Bunkerregeln und Erleichterung sind so angepasst, dass man damit spielen kann, und ein Assistent darf helfen.']),
      s('25.5', 'Players with intellectual disabilities', 'Spieler mit geistigen Behinderungen', ['A supporter may help with applying the Rules.'], ['Ein Betreuer darf beim Anwenden der Regeln helfen.']),
      s('25.6', 'General provisions', 'Allgemeine Bestimmungen', ['The committee may adopt further modifications.'], ['Die Spielleitung kann weitere Anpassungen festlegen.']),
    ],
  },
];
