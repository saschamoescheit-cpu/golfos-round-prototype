import type { LngLat, Ring } from '../types';
import { distanceM, type HoleMapData } from './geo';
import { holeForTee } from './teeline';
import { TEES } from '../data/tees';

// The first shot of a hole not on the tee chosen for the round (Sascha 04.11.2026 on Hetzenhof 2B: "played from the red
// tee – the app should notice by my GPS and ask in the round check whether I played from red instead of yellow, or
// dropped the ball for the water"). The check asks; the player says which it was.

/** Off the chosen tee by at least this much – closer is the same tee box. */
const OFF_M = 25;
/** On another tee: its spot by the scorecard lengths within this much. */
const ON_OTHER_M = 18;

export interface TeeQuestion {
  /** the tee chosen for the round */
  chosen: string;
  /** where it is on this hole */
  chosenAt: LngLat;
  /** how far the first shot is from it, in metres */
  off: number;
  /** the other tee the first shot was played from – null: none fits (a drop, perhaps) */
  other: string | null;
}

/**
 * Was the hole's first shot played from another tee? `first` is where the first shot was hit from, `base` the hole as
 * mapped (not yet shifted to a tee). Null when it was the chosen tee, or nothing can be told (no tees known, no spot).
 */
export function teeQuestion(first: LngLat | null | undefined, base: HoleMapData | null, courseId: string, label: string, chosen: string | null | undefined, teeBoxes: Ring[] = []): TeeQuestion | null {
  const t = TEES[courseId];
  if (!first || !base || !chosen || !t || !t.tees.includes(chosen)) return null;
  const chosenAt = holeForTee(base, courseId, label, chosen, teeBoxes)?.tee;
  if (!chosenAt) return null;
  const off = distanceM(first, chosenAt);
  if (off < OFF_M) return null;
  // the first shot nearer the green than the chosen tee: a forward tee or a drop ahead – not a ball played back
  const toGreen = (p: LngLat) => distanceM(p, base.greenCenter);
  if (toGreen(first) >= toGreen(chosenAt) - 10) return null;
  let best: { tee: string; d: number } | null = null;
  for (const [n, tee] of t.tees.entries()) {
    if (tee === chosen || t.holes[label]?.[n] == null) continue;
    const at = holeForTee(base, courseId, label, tee, teeBoxes)?.tee;
    if (!at) continue;
    const d = distanceM(first, at);
    if (!best || d < best.d) best = { tee, d };
  }
  return { chosen, chosenAt, off: Math.round(off), other: best && best.d <= ON_OTHER_M ? best.tee : null };
}
