import type { LngLat, Ring } from '../types';
import { bearingDeg, centroid, distanceM, lineLength, shiftTee, teeDelta, type HoleMapData } from './geo';
import { TEES } from '../data/tees';

/**
 * The hole line from the tee the player chose (feature 019): shifted forward or back by the scorecard lengths.
 * Going back (feature 025): the line starts at the mapped tee box behind it whose length fits the scorecard –
 * a straight extension would run into the woods on a dogleg (Alcanada 13). Without a fitting box at most 30 m.
 */
export function holeForTee(d: HoleMapData | null, courseId: string, label: string, tee: string | null | undefined, teeBoxes: Ring[] = []): HoleMapData | null {
  const t = TEES[courseId];
  if (!d || !t || !tee) return d;
  const L = lineLength(d.line);
  const delta = teeDelta(t.holes[label], t.tees.indexOf(tee), L);
  if (delta >= -2) return shiftTee(d, delta);
  const want = L - delta;
  const start = d.line[0];
  const back = bearingDeg(d.line[1], start); // direction behind the tee
  let best: { c: LngLat; err: number } | null = null;
  for (const box of teeBoxes) {
    const c = centroid(box);
    const dist = distanceM(c, start);
    if (dist < 8 || dist > 160) continue;
    const off = Math.abs(((bearingDeg(start, c) - back + 540) % 360) - 180); // 0 = straight behind
    if (off > 70) continue;
    const err = Math.abs(lineLength([c, ...d.line]) - want);
    if (!best || err < best.err) best = { c, err };
  }
  if (best && best.err <= 25) {
    const line = [best.c, ...d.line];
    return { ...d, line, tee: best.c };
  }
  return shiftTee(d, Math.max(delta, -30));
}
