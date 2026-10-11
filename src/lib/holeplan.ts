import type { LngLat, Ring } from '../types';
import { bearingDeg, centroid, distanceM, pointAt, pointInRing, lineLength, type HoleMapData } from './geo';
import { missCost } from './missmap';
import { hazardWord, sideWord, tr } from './i18n';

// Hole plan for the AI caddie (feature 009): instead of a map full of dots, one sentence per shot –
// where a miss is cheap and what to avoid. Built from the course map (green, bunkers, water) and the
// "where not to miss" costs. Clubs with a birdie book could add their own notes later.

type Side = 'short' | 'long' | 'left' | 'right';
const SIDE_DEG: Record<Side, number> = { short: 180, long: 0, left: 270, right: 90 };

function move(p: LngLat, bearing: number, m: number): LngLat {
  const r = (bearing * Math.PI) / 180;
  const dLat = (m * Math.cos(r)) / 111320;
  const dLon = (m * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180));
  return [p[0] + dLon, p[1] + dLat];
}

function reason(p: LngLat, data: HoleMapData): string {
  if (data.water.some((r: Ring) => pointInRing(p, r))) return 'water';
  if (data.bunkers.some((r: Ring) => pointInRing(p, r))) return 'bunker';
  return 'rough';
}

/** Radius of the green (from its outline, else 12 m). */
function greenRadius(data: HoleMapData): number {
  if (!data.green) return 12;
  const c = centroid(data.green);
  return data.green.reduce((s, q) => s + distanceM(c, q), 0) / data.green.length;
}

export interface ApproachPlan {
  best: Side;
  avoid: { side: Side; why: string }[];
  text: string;
}

/** Around the green, seen from where the player hits (shot direction = player → pin). */
export function approachPlan(data: HoleMapData, from: LngLat, pin: LngLat): ApproachPlan {
  const dir = bearingDeg(from, pin);
  const rg = greenRadius(data);
  const sides = (Object.keys(SIDE_DEG) as Side[]).map((side) => {
    // Per side: just off the green (+7 m) and a bit further (+18 m, e.g. water in front), each at 0° and ±25°.
    const pts = [rg + 7, rg + 18].flatMap((r) => [-25, 0, 25].map((d) => move(data.greenCenter, dir + SIDE_DEG[side] + d, r)));
    const costs = pts.map((p) => missCost(p, pin, data));
    const worst = pts[costs.indexOf(Math.max(...costs))];
    return { side, cost: costs.reduce((a, b) => a + b, 0) / costs.length, worst: Math.max(...costs), why: reason(worst, data) };
  });
  // Best miss = cheapest on average; avoid = sides with a bunker or water (worst point) clearly above the best.
  const best = sides.slice().sort((a, b) => a.cost - b.cost || a.worst - b.worst)[0];
  const avoid = sides.filter((s) => s.worst >= Math.max(0.5, best.worst + 0.2)).sort((a, b) => b.worst - a.worst);
  const text =
    avoid.length === 0
      ? tr('Misses around the green cost about the same – aim for the middle.', 'Fehlschläge ums Grün kosten etwa gleich viel – spiel auf die Mitte.')
      : tr('Best miss', 'Bester Fehlschlag') +
        `: ${sideWord(best.side)}. ` +
        tr('Avoid', 'Vermeide') +
        ` ${avoid.map((a) => `${sideWord(a.side)} (${hazardWord(a.why)})`).join(', ')}.`;
  return { best: best.side, avoid: avoid.map((a) => ({ side: a.side, why: a.why })), text };
}

/** The tee plan when both sides of the landing zone are fine. */
export const openText = (): string => tr('Landing zone is open on both sides.', 'Die Landezone ist auf beiden Seiten offen.');

/** Tee shot on a par 4/5: which side of the landing zone is safer (landing at the driver carry). */
export function teePlan(data: HoleMapData, driverCarry: number): string {
  const along = Math.min(driverCarry, lineLength(data.line) - 80);
  if (along < 120) return '';
  const land = pointAt(data.line, along);
  const dir = bearingDeg(pointAt(data.line, along - 20), land);
  const side = (deg: number) => {
    const pts = [15, 25].map((m) => move(land, dir + deg, m));
    const cost = Math.max(...pts.map((p) => missCost(p, data.greenCenter, data)));
    return { cost, why: reason(pts[pts.map((p) => missCost(p, data.greenCenter, data)).indexOf(cost)], data) };
  };
  const left = side(270);
  const right = side(90);
  if (Math.abs(left.cost - right.cost) < 0.2)
    return left.cost >= 0.5
      ? tr(`Tight landing zone (${left.why} both sides) – club down for the fairway.`, `Enge Landezone (${hazardWord(left.why)} auf beiden Seiten) – einen Schläger kürzer fürs Fairway.`)
      : openText();
  return left.cost < right.cost
    ? tr(`Favour the left side – right: ${right.why}.`, `Spiel eher links – rechts: ${hazardWord(right.why)}.`)
    : tr(`Favour the right side – left: ${left.why}.`, `Spiel eher rechts – links: ${hazardWord(left.why)}.`);
}

/** Width of the mapped fairway across the hole at `along` metres from the tee (null when no fairway there). */
export function fairwayWidth(data: HoleMapData, along: number): number | null {
  if (!data.fairways.length) return null;
  const c = pointAt(data.line, along);
  const b = bearingDeg(pointAt(data.line, Math.max(0, along - 10)), c);
  const inFw = (p: LngLat) => data.fairways.some((r) => pointInRing(p, r));
  if (!inFw(c)) return null;
  let left = 0;
  let right = 0;
  for (let m = 1; m <= 60 && inFw(move(c, b - 90, m)); m++) left = m;
  for (let m = 1; m <= 60 && inFw(move(c, b + 90, m)); m++) right = m;
  return left + right + 1;
}
