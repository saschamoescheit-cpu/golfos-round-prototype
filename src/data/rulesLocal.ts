import type { Rule } from './rulesOfGolf';
import { s } from './rulesOfGolfParts';
import { tr } from '../lib/i18n';

// The model local rules players meet most (Committee Procedures, Section 8) – in the app as rule "L", after the 25
// rules (Sascha 18.10.2026: all rules in the app). They apply only when the club has put them in force.
export const LOCAL_RULES: Rule = {
  n: 26,
  group: () => tr('Local rules (when the club uses them)', 'Platzregeln (wenn der Club sie nutzt)'),
  title: () => tr('The model local rules you meet most', 'Die häufigsten Muster-Platzregeln'),
  purpose: () => tr('A club may change some Rules for its course with local rules – they come first. Look at the scorecard or the notice board.', 'Ein Club kann mit Platzregeln einige Regeln für seinen Platz ändern – sie gehen vor. Sie stehen auf der Scorekarte oder am Aushang.'),
  sections: [
    s('E-5', 'Alternative to stroke and distance for lost ball or ball out of bounds', 'Alternative zu Schlag und Distanz bei verlorenem Ball oder Aus',
      ['Instead of going back, for two penalty strokes drop in the area between the point where the ball is estimated to be lost or went out and the fairway edge nearest to it, plus two club-lengths – not nearer the hole. Not for competitions of a high level.'],
      ['Statt zurückzugehen, mit zwei Strafschlägen im Bereich zwischen dem geschätzten Punkt, an dem der Ball verloren ging oder ins Aus flog, und dem nächstgelegenen Fairwayrand droppen, plus zwei Schlägerlängen – nicht näher zum Loch. Nicht für Turniere auf hohem Niveau.'],
      { keys: 'e5 verloren aus lost out of bounds fairway zwei strafschläge' }),
    s('E-3', 'Preferred lies (winter rules)', 'Besserlegen (Winterregel)',
      ['On closely mown areas (or the whole general area if stated) you may lift, clean and place your ball within one club-length (or a set distance), not nearer the hole, without penalty.'],
      ['Auf kurz gemähten Flächen (oder im ganzen Gelände, wenn so festgelegt) darf man den Ball straflos aufnehmen, reinigen und innerhalb einer Schlägerlänge (oder einer festgelegten Distanz) hinlegen, nicht näher zum Loch.'],
      { keys: 'besserlegen winterregel preferred lies lift clean place' }),
    s('E-2', 'Cleaning the ball', 'Ball reinigen',
      ['When the course is wet, you may lift and clean your ball in the general area and replace it.'],
      ['Bei nassem Platz darf man den Ball im Gelände aufnehmen, reinigen und zurücklegen.']),
    s('E-1', 'Dropping zones', 'Dropzonen',
      ['The committee may mark dropping zones as an extra relief option, e.g. at a penalty area; drop in the zone for the penalty of the Rule used.'],
      ['Die Spielleitung kann Dropzonen als zusätzliche Möglichkeit festlegen, z. B. an einer Penalty Area; man droppt in der Zone mit der Strafe der genutzten Regel.'],
      { keys: 'dropzone drop zone' }),
    s('F-5', 'Immovable obstructions close to putting greens', 'Unbewegliche Hemmnisse nahe am Grün',
      ['Free relief also when an immovable obstruction on or near the green (e.g. a sprinkler head) is on your line of play from a ball close to the green.'],
      ['Straflose Erleichterung auch dann, wenn ein unbewegliches Hemmnis am Grün (z. B. ein Sprinklerkopf) auf der Spiellinie eines Balls nahe am Grün liegt.'],
      { keys: 'sprinkler grün apron vorgrün' }),
    s('G-5', 'Distance-measuring devices', 'Entfernungsmesser', ['The committee may forbid distance-measuring devices for a competition.'], ['Die Spielleitung kann Entfernungsmesser für ein Turnier verbieten.'], { keys: 'laser gps app' }),
    s('F-2', 'Ground under repair', 'Boden in Ausbesserung', ['The committee marks areas such as damaged ground, new turf or protected areas as ground under repair – free relief (Rule 16.1), sometimes mandatory (no play zone).'], ['Die Spielleitung kennzeichnet beschädigten Boden, neuen Rasen oder geschützte Bereiche als Boden in Ausbesserung – straflose Erleichterung (Regel 16.1), manchmal Pflicht (Spielverbotszone).']),
  ],
};
