import type { Intent, PenaltyKind, Shot, SlopeLie, Strike } from '../types';
import { tr } from './i18n';

// What the player tells about a shot after the round (Sascha 22.10.2026, round check): how it was struck, what it was
// meant to do, the stance – all optional, one tap each in the shot's sheet. The bag's distances learn from good
// strikes only, the stats show the misses per club, an intended layup is no missed green.

export const STRIKES: { value: Strike; label: () => string }[] = [
  { value: 'good', label: () => tr('Good', 'Gut') },
  { value: 'fat', label: () => tr('Fat', 'Fett') },
  { value: 'thin', label: () => tr('Thin', 'Dünn') },
  { value: 'slice', label: () => 'Slice' },
  { value: 'hook', label: () => 'Hook' },
  { value: 'shank', label: () => 'Shank' },
];
export const strikeName = (s: Strike): string => STRIKES.find((x) => x.value === s)?.label() ?? s;

export const INTENTS: { value: Intent; label: () => string }[] = [
  { value: 'attack', label: () => tr('Went for it', 'Angegriffen') },
  { value: 'layup', label: () => tr('Laid up', 'Vorgelegt') },
  { value: 'recovery', label: () => tr('Punched out', 'Rausgespielt') },
];
export const intentName = (i: Intent): string => INTENTS.find((x) => x.value === i)?.label() ?? i;

export const SLOPES: { value: SlopeLie; label: () => string }[] = [
  { value: 'flat', label: () => tr('Flat', 'Eben') },
  { value: 'up', label: () => tr('Uphill', 'Bergauf') },
  { value: 'down', label: () => tr('Downhill', 'Bergab') },
  { value: 'above', label: () => tr('Ball above feet', 'Ball über den Füßen') },
  { value: 'below', label: () => tr('Ball below feet', 'Ball unter den Füßen') },
];
export const slopeName = (s: SlopeLie): string => SLOPES.find((x) => x.value === s)?.label() ?? s;

/** The kinds of penalty (Rules 17, 18, 19): water – drop or again; out of bounds and lost ball – stroke and distance
 *  (always again from the same spot); unplayable – drop or again. */
export const PENALTIES: { value: PenaltyKind; label: () => string; short: () => string }[] = [
  { value: 'water', label: () => tr('Water', 'Wasser'), short: () => tr('water', 'Wasser') },
  { value: 'ob', label: () => tr('Out of bounds', 'Aus'), short: () => tr('out of bounds', 'Aus') },
  { value: 'lost', label: () => tr('Lost', 'Verloren'), short: () => tr('lost ball', 'Ball verloren') },
  { value: 'unplayable', label: () => tr('Unplayable', 'Unspielbar'), short: () => tr('unplayable', 'unspielbar') },
];
export const penaltyName = (k: PenaltyKind | undefined): string | null => (k ? (PENALTIES.find((x) => x.value === k)?.short() ?? null) : null);

/** Stroke and distance by the rules: out of bounds and a lost ball are always played again from the same spot. */
export const alwaysAgain = (k: PenaltyKind | undefined): boolean => k === 'ob' || k === 'lost';
/** Played again from the same spot after this shot (out of bounds, lost ball, or water/unplayable chosen so). */
export const playedAgain = (s: Shot): boolean => s.penalty && (alwaysAgain(s.penaltyKind) || !!s.replay);
/** The shot after a water or unplayable penalty without playing again: played from a drop. */
export const fromDrop = (shots: Shot[], n: number): boolean => {
  const prev = shots[n - 1];
  return !!prev && prev.penalty && (prev.penaltyKind === 'water' || prev.penaltyKind === 'unplayable') && !prev.replay;
};
/** The shots that do not show the club's full distance: a mishit (fat, thin, shank). */
export const mishit = (s: Strike | undefined): boolean => s === 'fat' || s === 'thin' || s === 'shank';
