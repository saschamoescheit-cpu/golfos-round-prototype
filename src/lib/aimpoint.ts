import type { Club, LngLat, Ring } from '../types';
import { alongLine, bearingDeg, distanceM, distToLine, lineLength, pointAt, pointInRing, type HoleMapData } from './geo';
import { adviseClub, playsLike, type CarryBag, type Conditions, type PlaysLike } from './caddie';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, type Samples } from './terrain';
import type { HoleNote } from './holenotes';

// The caddie's aim point (features 016/017): where to hit this shot, from where the player is now.
// Tee: the landing zone at the longest suitable carry. In reach of the green: the pin. Otherwise a layup that
// leaves the favourite distance. Moved sideways for wind, the player's tendency and a hanging fairway –
// never towards out of bounds. Trees in the way: a free line, shorter or more to the side, or a punch out.
// Heights from the terrain model along the hole make every distance "plays like".

export type AimKind = 'drive' | 'approach' | 'layup' | 'recovery';
export type PlayStyle = 'safe' | 'normal' | 'aggressive';

export interface AimPoint {
  pos: LngLat;
  kind: AimKind;
  club: Club;
  distance: number; // metres from the player
  pl: PlaysLike; // plays-like to the aim point (wind, temperature, height)
  side: number; // metres moved sideways (+ right) for wind/tendency/slope
  reasons: string[]; // why the point is where it is, short
  note: string | null; // trees, out of bounds …
}

export function move(p: LngLat, bearing: number, m: number): LngLat {
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

export interface AimInput {
  data: HoleMapData;
  from: LngLat;
  pin: LngLat;
  par: number;
  teeShot: boolean;
  bag: CarryBag;
  conditions: Conditions | null;
  tendency: Map<Club, number>;
  slopes?: Samples;
  boundary?: Ring[];
  trees?: Ring[];
  note?: HoleNote;
  style?: PlayStyle;
  favourite?: number; // favourite approach distance in metres
}

export function aimPoint(o: AimInput): AimPoint {
  const { data, from, pin } = o;
  const style = o.style ?? 'normal';
  const driverOk = o.teeShot && o.par >= 4;
  const clubs = o.bag.filter((b) => driverOk || b.club !== 'Dr').sort((a, b) => b.carry - a.carry);
  const total = lineLength(data.line);
  const alongFrom = alongLine(data.line, from);
  // Heights from the terrain model along the hole (player near the line only).
  const hFrom = distToLine(from, data.line) <= 40 ? heightAt(o.slopes, alongFrom) : null;
  const hAt = (p: LngLat) => (distToLine(p, data.line) <= 40 ? heightAt(o.slopes, alongLine(data.line, p)) : null);
  const hd = (p: LngLat) => {
    const h = hAt(p);
    return hFrom != null && h != null ? h - hFrom : null;
  };
  const reasons: string[] = [];

  // Hazards around the landing zone → the safe style clubs down off the tee.
  const obNote = o.note ?? {};
  let longest = clubs[0]?.carry ?? 200;
  const toPin = playsLike(distanceM(from, pin), bearingDeg(from, pin), o.conditions, hd(pin));
  const reachMargin = style === 'aggressive' ? 10 : style === 'safe' ? -10 : 5;

  let base: LngLat;
  let kind: AimKind;
  if (toPin.playsLike <= longest + reachMargin && !driverOk) {
    base = pin;
    kind = 'approach';
    if (style === 'safe' && o.data.green && distanceM(pin, o.data.greenCenter) > 6) {
      base = o.data.greenCenter; // safe: middle of the green, not the flag
      reasons.push('middle of the green');
    }
  } else {
    const dir = bearingDeg(from, pin);
    const ratio = 100 / playsLike(100, dir, o.conditions, null).playsLike;
    if (driverOk && style === 'safe' && (obNote.obLeft || obNote.obRight) && clubs.length > 1) {
      longest = clubs[1].carry; // safe: one club less off the tee when out of bounds is close
      reasons.push(`${clubs[1].club} for safety`);
    }
    const reach = longest * ratio;
    let along = Math.min(alongFrom + reach, total - 60);
    // Layup (not the tee shot on a par 4): leave the favourite distance if that is in reach.
    const fav = o.favourite ?? 90;
    if (!o.teeShot && total - fav > alongFrom + 30 && total - fav <= alongFrom + reach) {
      along = total - fav;
      reasons.push(`leaves ${fav} m`);
    }
    base = pointAt(data.line, Math.max(along, alongFrom + 30));
    kind = o.teeShot ? 'drive' : 'layup';
  }

  // Sideways: wind drift, own tendency, hanging fairway; never towards out of bounds (map or hole notes).
  const dist0 = distanceM(from, base);
  const pl0 = playsLike(dist0, bearingDeg(from, base), o.conditions, hd(base));
  const club0 = adviseClub(pl0.playsLike, o.bag, driverOk).club;
  const hang = kind === 'approach' ? null : slopeAdvice(crossSlopeAt(o.slopes, alongLine(data.line, base)));
  const tend = o.tendency.get(club0) ?? 0;
  let side = Math.max(-15, Math.min(15, pl0.aimM - tend + (hang?.aimM ?? 0)));
  if (Math.abs(pl0.aimM) >= 2) reasons.push(`wind ${Math.abs(Math.round(pl0.aimM))} m ${pl0.aimM > 0 ? 'right' : 'left'}`);
  if (Math.abs(tend) >= 3) reasons.push(`your ${club0} goes ${Math.abs(tend)} m ${tend > 0 ? 'right' : 'left'}`);
  if (hang) reasons.push(`slope ${Math.abs(hang.aimM)} m ${hang.aimM > 0 ? 'right' : 'left'}`);
  const ob = obAdvice(o.boundary, from, base);
  const obLeft = obNote.obLeft || (ob != null && ob.left <= 25);
  const obRight = obNote.obRight || (ob != null && ob.right <= 25);
  if ((side < 0 && obLeft) || (side > 0 && obRight)) {
    const towards = side < 0 ? 'left' : 'right';
    side = 0;
    // Only say why the shot stays in the middle; the moves that were dropped would confuse.
    for (let k = reasons.length - 1; k >= 0; k--) if (/^(wind|your|slope) /.test(reasons[k])) reasons.splice(k, 1);
    reasons.push(`centre – out of bounds ${towards}`);
  }
  let pos = Math.abs(side) >= 2 ? move(base, bearingDeg(from, base) + 90, side) : base;

  // Trees: keep the shot if the line is free; else the free line closest to the plan.
  let note: string | null = null;
  if (blocked(from, pos, o.trees)) {
    const b0 = bearingDeg(from, pos);
    const d0 = distanceM(from, pos);
    let best: { p: LngLat; score: number; ang: number } | null = null;
    for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
      for (let ang = 0; ang <= 60; ang += 5) {
        for (const sgn of ang === 0 ? [1] : [1, -1]) {
          const p = move(from, b0 + sgn * ang, d0 * frac);
          if (blocked(from, p, o.trees) || (o.trees ?? []).some((r) => pointInRing(p, r))) continue;
          const score = ang * 1.5 + (1 - frac) * 60 + Math.max(0, distanceM(p, pin) - distanceM(pos, pin)) * 0.2;
          if (!best || score < best.score) best = { p, score, ang: sgn * ang };
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
  const pl = playsLike(distance, bearingDeg(from, pos), o.conditions, kind === 'approach' ? hd(pin) : hd(pos));
  const club = adviseClub(pl.playsLike, o.bag, driverOk && kind === 'drive').club;
  const obSides = [obLeft && 'left', obRight && 'right', obNote.obLong && 'long'].filter(Boolean);
  if (!note && obSides.length) note = `Out of bounds ${obSides.join(' and ')}${obNote.obLeft || obNote.obRight || obNote.obLong ? '' : ' (likely)'}`;
  return { pos, kind, club, distance, pl, side, reasons, note };
}
