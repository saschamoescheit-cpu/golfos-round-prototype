import type { Flight, Intent, PenaltyKind, Shot, SlopeLie, Strike } from '../types';
import { tr } from './i18n';

// What the player tells about a shot after the round (Sascha 22.10.2026, round check): how it was struck, what it was
// meant to do, the stance – all optional, one tap each in the shot's sheet. The bag's distances learn from good
// strikes only, the stats show the misses per club, an intended layup is no missed green.

/** The contact (Sascha 23.10.2026: slice and hook are flights, they moved to FLIGHTS). */
export const STRIKES: { value: Strike; label: () => string }[] = [
  { value: 'good', label: () => tr('Good', 'Gut') },
  { value: 'fat', label: () => tr('Fat', 'Fett') },
  { value: 'thin', label: () => tr('Thin', 'Dünn') },
  { value: 'topped', label: () => tr('Topped', 'Getoppt') }, // Sascha 24.10.2026
  { value: 'toe', label: () => tr('Toe', 'Spitze') }, // Sascha 24.10.2026 evening
  { value: 'heel', label: () => tr('Heel', 'Hacke') },
  { value: 'shank', label: () => 'Shank' },
];
export const strikeName = (s: Strike): string => (s === 'slice' ? 'Slice' : s === 'hook' ? 'Hook' : (STRIKES.find((x) => x.value === s)?.label() ?? s));

/** The nine flights (ball flight laws), row by row: starting left, straight, right – curving left, not, right
 *  (for a right-hander; a left-hander's are the mirror image, the names stay). */
export const FLIGHTS: { value: Flight; label: () => string; start: number; curve: number; shape?: boolean }[] = [
  { value: 'pullHook', label: () => 'Pull Hook', start: -1, curve: -1 },
  { value: 'pull', label: () => 'Pull', start: -1, curve: 0 },
  { value: 'pullSlice', label: () => 'Pull Slice', start: -1, curve: 1 },
  { value: 'hook', label: () => 'Hook', start: 0, curve: -1 },
  { value: 'straight', label: () => tr('Straight', 'Gerade'), start: 0, curve: 0 },
  { value: 'slice', label: () => 'Slice', start: 0, curve: 1 },
  { value: 'pushHook', label: () => 'Push Hook', start: 1, curve: -1 },
  { value: 'push', label: () => 'Push', start: 1, curve: 0 },
  { value: 'pushSlice', label: () => 'Push Slice', start: 1, curve: 1 },
  // the two played shapes (Sascha 24.10.2026): a little beside the line, curving back onto it – no miss off the line
  { value: 'draw', label: () => 'Draw', start: 1, curve: -0.8, shape: true },
  { value: 'fade', label: () => 'Fade', start: -1, curve: 0.8, shape: true },
];
/** The flights that end on the target line: straight and the two shapes. */
export const onLine = (f: Flight): boolean => f === 'straight' || f === 'draw' || f === 'fade';
export const flightName = (f: Flight): string => FLIGHTS.find((x) => x.value === f)?.label() ?? f;
/** A shot's flight – also from a shot checked before 23.10.2026, where "slice"/"hook" was set as the strike. */
export const flightOf = (s: { flight?: Flight; strike?: Strike }): Flight | undefined =>
  s.flight ?? (s.strike === 'slice' ? 'slice' : s.strike === 'hook' ? 'hook' : undefined);

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
export const mishit = (s: Strike | undefined): boolean => s === 'fat' || s === 'thin' || s === 'topped' || s === 'toe' || s === 'heel' || s === 'shank';
