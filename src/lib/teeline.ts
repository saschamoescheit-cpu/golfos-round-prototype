import type { LngLat, Ring } from '../types';
import { alongLine, bearingDeg, centroid, distanceM, lineLength, pointInRing, shiftTee, teeDelta, type HoleMapData } from './geo';
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
  if (delta > 2) {
    const shifted = shiftTee(d, delta);
    return forwardTee(d, L - delta, shifted.tee) ?? shifted;
  }
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
    return { ...d, line, tee: best.c, along0: (d.along0 ?? 0) - distanceM(best.c, start) };
  }
  return shiftTee(d, Math.max(delta, -30));
}

/**
 * A tee ahead of where the line starts (Sascha 28.10.2026, 4B Hetzenhof: "the tee was not shown" – yellow lies 106 m
 * ahead and 37 m beside the line; moved along the line the tee stood 48 m off it). The point moved along the line stays
 * when it lies on a tee box (within 8 m); otherwise the hole's own box nearest to it whose line to the green fits the
 * scorecard within 25 m – nearest, so a box of another colour with a similar length is not taken. None: null.
 */
function forwardTee(d: HoleMapData, want: number, shifted: LngLat): HoleMapData | null {
  const boxes = d.tees ?? [];
  const edge = (r: Ring) => (pointInRing(shifted, r) ? 0 : Math.min(...r.map((q) => distanceM(q, shifted))));
  if (boxes.some((r) => edge(r) <= 8)) return null;
  let best: { line: LngLat[]; c: LngLat; a: number; near: number } | null = null;
  for (const box of boxes) {
    const c = centroid(box);
    const a = alongLine(d.line, c);
    if (a < 15) continue; // the box the line starts from
    // the line on from the box: the points of the hole line beyond it
    let s = 0;
    const rest: LngLat[] = [];
    for (let k = 1; k < d.line.length; k++) {
      s += distanceM(d.line[k - 1], d.line[k]);
      if (s > a + 10) rest.push(d.line[k]);
    }
    if (!rest.length) continue;
    const line = [c, ...rest];
    if (Math.abs(lineLength(line) - want) > 25) continue;
    const near = edge(box);
    if (!best || near < best.near) best = { line, c, a, near };
  }
  return best ? { ...d, line: best.line, tee: best.c, along0: (d.along0 ?? 0) + best.a } : null;
}
