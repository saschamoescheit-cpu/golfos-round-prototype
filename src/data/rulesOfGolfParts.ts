import { getLang, tr } from '../lib/i18n';
import type { RuleSection } from './rulesOfGolf';

// Shared helpers of the rule book (rulesOfGolf.ts, rulesOfGolf2.ts, rulesOfGolf3.ts).
export const G = {
  basics: () => tr('Fundamentals of the game', 'Grundlagen des Spiels'),
  round: () => tr('Playing the round and a hole', 'Spielen der Runde und eines Lochs'),
  ball: () => tr('Playing the ball', 'Ball spielen'),
  bunkersGreens: () => tr('Specific rules for bunkers and putting greens', 'Sonderregeln für Bunker und Grüns'),
  lift: () => tr('Lifting and returning a ball to play', 'Ball aufnehmen und wieder ins Spiel bringen'),
  free: () => tr('Free relief', 'Straflose Erleichterung'),
  penaltyRelief: () => tr('Penalty relief', 'Erleichterung mit Strafschlag'),
  procedures: () => tr('Procedures for players and the committee when issues arise', 'Vorgehen für Spieler und Spielleitung in strittigen Fällen'),
  forms: () => tr('Other forms of play', 'Andere Spielformen'),
  disability: () => tr('Modifications for players with disabilities', 'Anpassungen für Spieler mit Behinderungen'),
};
export const GENERAL = () => tr('General penalty: loss of hole in match play, two strokes in stroke play.', 'Grundstrafe: Lochverlust im Lochspiel, zwei Strafschläge im Zählspiel.');
export const ONE = () => tr('One penalty stroke.', 'Ein Strafschlag.');
export const s = (id: string, en: string, de: string, textEn: string[], textDe: string[], extra: Partial<RuleSection> = {}): RuleSection => ({
  id,
  title: () => tr(en, de),
  text: () => (getLang() === 'de' ? textDe : textEn),
  ...extra,
});
