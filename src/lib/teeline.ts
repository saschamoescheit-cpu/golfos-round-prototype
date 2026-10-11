import { lineLength, shiftTee, teeDelta, type HoleMapData } from './geo';
import { TEES } from '../data/tees';

/** The hole line from the tee the player chose (feature 019): shifted forward or back by the scorecard lengths. */
export function holeForTee(d: HoleMapData | null, courseId: string, label: string, tee: string | null | undefined): HoleMapData | null {
  const t = TEES[courseId];
  if (!d || !t || !tee) return d;
  return shiftTee(d, teeDelta(t.holes[label], t.tees.indexOf(tee), lineLength(d.line)));
}
