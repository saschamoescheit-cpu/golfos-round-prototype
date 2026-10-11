import type { Club, LngLat, Ring } from '../types';
import { alongLine, bearingDeg, distanceM, lineLength, pointAt, pointInRing, type HoleMapData } from './geo';
import { adviseClub, playsLike, type CarryBag, type Conditions } from './caddie';
import { crossSlopeAt, obAdvice, slopeAdvice } from './terrain';

// The caddie's aim point (feature 016): where to hit this shot, from where the player is now.
// Tee: the landing zone at the longest suitable carry. In reach of the green: the pin. Otherwise a layup.
// Moved sideways for wind, the player's tendency and a hanging fairway – never towards close out of bounds.
// Trees in the way (OSM woods): the caddie looks for a free line, shorter or more to the side, or a punch out.

export type AimKind = 'drive' | 'approach' | 'layup' | 'recovery';

export interface AimPoint {
  pos: LngLat;
  kind: AimKind;
  club: Club;
  distance: number; // metres from the player
  note: string | null; // e.g. "Trees in the way – play 20° right, 140 m"
}

function move(p: LngLat, bearing: number, m: number): LngLat {
  const r = (bearing * Math.PI) / 180;
  return [p[0] + (m * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (m * Math.cos(r)) / 111320];
}

/**
 * Trees block a shot near the player (low ball flight, first 40 m) and at the landing spot (last 8 m);
 * in between a normal shot flies over them.
 */
export function blocked(from: LngLat, to: LngLat, trees: Ring[] | undefined): boolean {
  if (!trees?.length) return false;
  const d = distanceM(from, to);
  const b = bearingDeg(from, to);
  const checks: number[] = [];
  for (let s = 6; s <= Math.min(40, d * 0.35); s += 4) checks.push(s);
  for (let s = Math.max(d - 8, 0); s <= d; s += 4) checks.push(s);
  return checks.some((s) => {
    const p = move(from, b, s);
    return trees.some((r) => pointInRing(p, r));
  });
}

export function aimPoint(o: {
  data: HoleMapData;
  from: LngLat;
  pin: LngLat;
  par: number;
  teeShot: boolean;
  bag: CarryBag;
  conditions: Conditions | null;
  heightDiff: number | null; // green minus player height
  tendency: Map<Club, number>;
  slopes?: [number, number][];
  boundary?: Ring[];
  trees?: Ring[];
}): AimPoint {
  const { data, from, pin } = o;
  const driverOk = o.teeShot && o.par >= 4;
  const clubs = o.bag.filter((b) => driverOk || b.club !== 'Dr');
  const longest = Math.max(...clubs.map((b) => b.carry));
  const toPin = playsLike(distanceM(from, pin), bearingDeg(from, pin), o.conditions, o.heightDiff);

  let base: LngLat;
  let kind: AimKind;
  if (toPin.playsLike <= longest + 5 && !(o.teeShot && o.par >= 4)) {
    base = pin;
    kind = 'approach';
  } else {
    // How far the longest club really flies in this direction (wind, temperature), then along the hole.
    const dir = bearingDeg(from, pin);
    const ratio = 100 / playsLike(100, dir, o.conditions, null).playsLike;
    const reach = longest * ratio;
    const total = lineLength(data.line);
    const along = Math.min(alongLine(data.line, from) + reach, total - 60);
    base = pointAt(data.line, Math.max(along, alongLine(data.line, from) + 30));
    kind = o.teeShot ? 'drive' : 'layup';
  }

  // Sideways: wind drift, own tendency, hanging fairway (not on the green); never towards close OB.
  const dist0 = distanceM(from, base);
  const pl = playsLike(dist0, bearingDeg(from, base), o.conditions, kind === 'approach' ? o.heightDiff : null);
  const club = adviseClub(pl.playsLike, o.bag, driverOk).club;
  const slope = kind === 'approach' ? 0 : (slopeAdvice(crossSlopeAt(o.slopes, alongLine(data.line, base)))?.aimM ?? 0);
  let side = Math.max(-20, Math.min(20, pl.aimM - (o.tendency.get(club) ?? 0) + slope));
  const ob = obAdvice(o.boundary, from, base);
  if (ob && ((side < 0 && ob.left <= 25) || (side > 0 && ob.right <= 25))) side = 0;
  let pos = Math.abs(side) >= 2 ? move(base, bearingDeg(from, base) + 90, side) : base;

  // Trees: keep the shot if the line is free; else the free line closest to the plan.
  let note: string | null = null;
  if (blocked(from, pos, o.trees)) {
    const b0 = bearingDeg(from, pos);
    const d0 = distanceM(from, pos);
    let best: { p: LngLat; score: number; ang: number; frac: number } | null = null;
    for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
      for (let ang = 0; ang <= 60; ang += 5) {
        for (const sgn of ang === 0 ? [1] : [1, -1]) {
          const p = move(from, b0 + sgn * ang, d0 * frac);
          if (blocked(from, p, o.trees) || (o.trees ?? []).some((r) => pointInRing(p, r))) continue;
          // Prefer: small angle, long shot, and staying near the hole (closer to the pin).
          const score = ang * 1.5 + (1 - frac) * 60 + Math.max(0, distanceM(p, pin) - distanceM(pos, pin)) * 0.2;
          if (!best || score < best.score) best = { p, score, ang: sgn * ang, frac };
        }
      }
    }
    if (best) {
      pos = best.p;
      kind = 'recovery';
      const dir = best.ang === 0 ? 'straight' : `${Math.abs(best.ang)}° ${best.ang > 0 ? 'right' : 'left'}`;
      note = `Trees in the way – play ${dir}, ${Math.round(distanceM(from, pos))} m`;
    } else note = 'Trees all around – punch out to the fairway';
  }
  const distance = distanceM(from, pos);
  const finalClub = kind === 'recovery' ? adviseClub(playsLike(distance, bearingDeg(from, pos), o.conditions, null).playsLike, o.bag, false).club : club;
  return { pos, kind, club: finalClub, distance, note };
}
