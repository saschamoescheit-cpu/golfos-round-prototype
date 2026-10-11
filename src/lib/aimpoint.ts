import type { Club, LngLat, Ring } from '../types';
import { alongLine, bearingDeg, distanceM, distToLine, lineLength, pointAt, pointInRing, type HoleMapData } from './geo';
import { adviseClub, playsLike, type CarryBag, type Conditions, type PlaysLike } from './caddie';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, type Samples } from './terrain';
import type { HoleNote } from './holenotes';
import { clubCode, sideWord, tr } from './i18n';

// The caddie's aim point (features 016/017): where to hit this shot, from where the player is now.
// Tee: the landing zone at the longest suitable carry. In reach of the green: the pin. Otherwise a layup that
// leaves the favourite distance. Moved sideways for wind, the player's tendency and a hanging fairway –
// never towards out of bounds. Trees in the way: a free line, shorter or more to the side, or a punch out.
// Heights from the terrain model along the hole make every distance "plays like".

export type AimKind = 'drive' | 'approach' | 'layup' | 'recovery';
export type PlayStyle = 'safe' | 'normal' | 'aggressive';

export interface AimPoint {
  pos: LngLat; // where to aim
  landing: LngLat; // where the ball should come to rest (wind, slope and tendency taken off)
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
      reasons.push(tr('middle of the green', 'Grünmitte'));
    }
  } else {
    const dir = bearingDeg(from, pin);
    const ratio = 100 / playsLike(100, dir, o.conditions, null).playsLike;
    if (driverOk && style === 'safe' && (obNote.obLeft || obNote.obRight) && clubs.length > 1) {
      longest = clubs[1].carry; // safe: one club less off the tee when out of bounds is close
      reasons.push(tr(`${clubs[1].club} for safety`, `${clubCode(clubs[1].club)} zur Sicherheit`));
    }
    const reach = longest * ratio;
    let along = Math.min(alongFrom + reach, total - 60);
    // Layup (not the tee shot on a par 4): leave the favourite distance if that is in reach.
    const fav = o.favourite ?? 90;
    if (!o.teeShot && total - fav > alongFrom + 30 && total - fav <= alongFrom + reach) {
      along = total - fav;
      reasons.push(tr(`leaves ${fav} m`, `lässt ${fav} m`));
    }
    base = pointAt(data.line, Math.max(along, alongFrom + 30));
    kind = o.teeShot ? 'drive' : 'layup';
  }

  // Sideways: wind drift, own tendency, hanging fairway – the aim point; the ball should end up at the landing spot.
  const dist0 = distanceM(from, base);
  const pl0 = playsLike(dist0, bearingDeg(from, base), o.conditions, hd(base));
  const club0 = adviseClub(pl0.playsLike, o.bag, driverOk).club;
  const hang = kind === 'approach' ? null : slopeAdvice(crossSlopeAt(o.slopes, alongLine(data.line, base)));
  const tend = o.tendency.get(club0) ?? 0;
  let side = Math.max(-15, Math.min(15, pl0.aimM - tend + (hang?.aimM ?? 0)));
  if (Math.abs(pl0.aimM) >= 2) reasons.push(tr('wind', 'Wind') + ` ${Math.abs(Math.round(pl0.aimM))} m ${sideWord(pl0.aimM > 0 ? 'right' : 'left')}`);
  if (Math.abs(tend) >= 3) reasons.push(tr(`your ${club0} goes`, `dein ${clubCode(club0)} geht`) + ` ${Math.abs(tend)} m ${sideWord(tend > 0 ? 'right' : 'left')}`);
  if (hang) reasons.push(tr('slope', 'Hang') + ` ${Math.abs(hang.aimM)} m ${sideWord(hang.aimM > 0 ? 'right' : 'left')}`);
  const dropMoves = () => {
    // Only say why the shot stays in the middle; the moves that were dropped would confuse.
    for (let k = reasons.length - 1; k >= 0; k--) if (/^(wind|your|slope|Wind|dein|Hang) /.test(reasons[k])) reasons.splice(k, 1);
  };
  // Hole notes (out of bounds the map does not know, no distance): never aim towards that side.
  if ((side < 0 && obNote.obLeft) || (side > 0 && obNote.obRight)) {
    const towards = side < 0 ? 'left' : 'right';
    side = 0;
    dropMoves();
    reasons.push(tr('centre – out of bounds', 'Mitte – Aus') + ` ${sideWord(towards)}`);
  }

  // Safety (feature 020, like a tour caddie): the landing spot is clear of water, bunkers and trees and stays
  // 20 m inside the course boundary – and so does the aim point, in case the wind does not bring the ball back.
  const zone = safeLanding({ from, base, side, kind, data, boundary: o.boundary, trees: o.trees });
  if (zone.reason && !(zone.k < 1 && zone.reason === 'ob')) reasons.push(zoneText(zone.reason));
  if (zone.k < 1 && Math.abs(side) >= 2) {
    const towards = side < 0 ? 'left' : 'right';
    dropMoves();
    if (zone.k > 0) reasons.push(tr('only', 'nur') + ` ${Math.round(Math.abs(side * zone.k))} m ${sideWord(towards)} – ` + tr('out of bounds', 'Aus'));
    else reasons.push(tr('centre – out of bounds', 'Mitte – Aus') + ` ${sideWord(towards)}`);
  }
  side *= zone.k;
  base = zone.landing;
  let pos = Math.abs(side) >= 2 ? move(base, bearingDeg(from, base) + 90, side) : base;

  // Trees: keep the shot if the line is free; else the free line closest to the plan (never into water or out).
  let note: string | null = null;
  const outside = (p: LngLat) => !!o.boundary?.length && !o.boundary.some((r) => pointInRing(p, r));
  const fromInside = !outside(from);
  if (blocked(from, pos, o.trees)) {
    const b0 = bearingDeg(from, pos);
    const d0 = distanceM(from, pos);
    let best: { p: LngLat; score: number; ang: number } | null = null;
    for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
      for (let ang = 0; ang <= 60; ang += 5) {
        for (const sgn of ang === 0 ? [1] : [1, -1]) {
          const p = move(from, b0 + sgn * ang, d0 * frac);
          if (blocked(from, p, o.trees) || (o.trees ?? []).some((r) => pointInRing(p, r))) continue;
          if (data.water.some((r) => pointInRing(p, r)) || (fromInside && outside(p))) continue;
          const score = ang * 1.5 + (1 - frac) * 60 + Math.max(0, distanceM(p, pin) - distanceM(pos, pin)) * 0.2;
          if (!best || score < best.score) best = { p, score, ang: sgn * ang };
        }
      }
    }
    if (best) {
      pos = best.p;
      kind = 'recovery';
      const dir = best.ang === 0 ? tr('straight', 'gerade') : `${Math.abs(best.ang)}° ${sideWord(best.ang > 0 ? 'right' : 'left')}`;
      note = tr(`Trees in the way – play ${dir}, ${Math.round(distanceM(from, pos))} m`, `Bäume im Weg – spiel ${dir}, ${Math.round(distanceM(from, pos))} m`);
    } else note = tr('Trees all around – punch out to the fairway', 'Rundum Bäume – flach zurück aufs Fairway');
  }
  const ob = obAdvice(o.boundary, from, base);
  const obLeft = obNote.obLeft || (ob != null && ob.left <= 25);
  const obRight = obNote.obRight || (ob != null && ob.right <= 25);
  const distance = distanceM(from, pos);
  const pl = playsLike(distance, bearingDeg(from, pos), o.conditions, kind === 'approach' ? hd(pin) : hd(pos));
  const club = adviseClub(pl.playsLike, o.bag, driverOk && kind === 'drive').club;
  // One wording everywhere: "Out of bounds 18 m left and right" – distance from the map, side from the hole notes.
  const sideText = (k: 'left' | 'right', known: boolean | undefined, m: number | undefined) => (known || m == null || !isFinite(m) ? sideWord(k) : `${Math.round(m)} m ${sideWord(k)}`);
  const obSides = [obLeft && sideText('left', obNote.obLeft, ob?.left), obRight && sideText('right', obNote.obRight, ob?.right), obNote.obLong && sideWord('long')].filter(Boolean);
  if (!note && obSides.length) note = tr('Out of bounds', 'Aus') + ' ' + obSides.join(tr(' and ', ' und '));
  return { pos, landing: kind === 'recovery' ? pos : base, kind, club, distance, pl, side, reasons, note };
}

/** Why the landing spot moved. */
export type ZoneReason = 'water' | 'waterPast' | 'ob' | 'trees' | 'bunker' | 'fairway';
export const zoneText = (r: ZoneReason): string =>
  ({
    water: tr('clear of the water', 'weg vom Wasser'),
    waterPast: tr('short of the water', 'vor dem Wasser'),
    ob: tr('away from out of bounds', 'weg vom Aus'),
    trees: tr('clear of the trees', 'weg von den Bäumen'),
    bunker: tr('clear of the bunker', 'weg vom Bunker'),
    fairway: tr('onto the fairway', 'aufs Fairway'),
  })[r];

/** Distances the caddie keeps from trouble (feature 020; Chris to confirm). */
export const SAFETY = { obMarginM: 20, waterPastM: 15, waterShortM: 12 };

/** Rings whose bounding box comes within `m` metres of p (keeps the search fast on big courses). */
function nearRings(rings: Ring[] | undefined, p: LngLat, m: number): Ring[] {
  if (!rings?.length) return [];
  const dLat = m / 111320;
  const dLon = m / (111320 * Math.cos((p[1] * Math.PI) / 180));
  return rings.filter((r) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const q of r) {
      if (q[0] < minX) minX = q[0];
      if (q[0] > maxX) maxX = q[0];
      if (q[1] < minY) minY = q[1];
      if (q[1] > maxY) maxY = q[1];
    }
    return p[0] >= minX - dLon && p[0] <= maxX + dLon && p[1] >= minY - dLat && p[1] <= maxY + dLat;
  });
}

/**
 * Landing spot near `base` that is clear of water, bunkers and trees and at least 20 m inside the course
 * boundary – the aim point (`side` metres to the side) too, and it is not in water, a bunker or trees. Prefers small moves sideways, then a shorter club;
 * on drives it prefers the fairway. Approaches keep the pin and only limit the aim towards out of bounds.
 * Returns the landing spot, how much of the sideways aim survives (k) and why the spot moved.
 */
export function safeLanding(o: { from: LngLat; base: LngLat; side: number; kind: AimKind; data: HoleMapData; boundary?: Ring[]; trees?: Ring[] }): { landing: LngLat; k: number; reason: ZoneReason | null } {
  const R = 90;
  const water = nearRings(o.data.water, o.base, R);
  const bunkers = nearRings(o.data.bunkers, o.base, R);
  const fairways = nearRings(o.data.fairways, o.base, R);
  const trees = nearRings(o.trees, o.base, R);
  const bound = o.boundary ?? [];
  const inAny = (p: LngLat, rings: Ring[]) => rings.some((r) => pointInRing(p, r));
  const fromInside = !bound.length || inAny(o.from, bound);
  const obGap = (p: LngLat) => (!bound.length || !fromInside ? Infinity : inAny(p, bound) ? Math.min(...bound.map((r) => distToLine(p, r))) : -1);
  const aimAt = (l: LngLat, k: number) => (Math.abs(o.side * k) >= 2 ? move(l, bearingDeg(o.from, l) + 90, o.side * k) : l);

  if (o.kind === 'approach') {
    // The pin stays; the aim may not go closer than 20 m to out of bounds (or than the pin itself is).
    const need = Math.min(SAFETY.obMarginM, obGap(o.base));
    for (const k of [1, 0.5, 0]) {
      const aim = aimAt(o.base, k);
      if (obGap(aim) >= need && !inAny(aim, water)) return { landing: o.base, k, reason: null };
    }
    return { landing: o.base, k: 0, reason: null };
  }

  const problem = (l: LngLat): ZoneReason | null => {
    const b = bearingDeg(o.from, l);
    if (inAny(l, water)) return 'water';
    if (inAny(move(l, b, SAFETY.waterPastM), water)) return 'waterPast';
    if (obGap(l) < SAFETY.obMarginM) return 'ob';
    if (inAny(l, trees)) return 'trees';
    if (inAny(l, bunkers)) return 'bunker';
    return null;
  };
  let best: { l: LngLat; k: number; cost: number } | null = null;
  const d = distanceM(o.from, o.base);
  const b0 = bearingDeg(o.from, o.base);
  for (const a of [0, -10, -20, -30, -45]) {
    if (d + a < 40) continue;
    for (let s = -20; s <= 20; s += 4) {
      const l = move(move(o.from, b0, d + a), b0 + 90, s);
      if (problem(l)) continue;
      for (const k of [1, 0.5, 0]) {
        // The aim point too: on a slope the ball lands there and only then rolls to the landing spot.
        const aim = aimAt(l, k);
        if (obGap(aim) < SAFETY.obMarginM || inAny(aim, water) || inAny(aim, bunkers) || inAny(aim, trees)) continue;
        let cost = Math.abs(s) + Math.abs(a) * 0.8 + Math.abs(o.side) * (1 - k) * 0.7;
        if (fairways.length && o.kind === 'drive' && !inAny(l, fairways)) cost += 10;
        if (inAny(move(l, bearingDeg(o.from, l), -SAFETY.waterShortM), water)) cost += 8;
        if (!best || cost < best.cost) best = { l, k, cost };
        break; // the largest k that is safe
      }
    }
  }
  if (!best) return { landing: o.base, k: obGap(aimAt(o.base, 1)) < SAFETY.obMarginM ? 0 : 1, reason: null };
  const moved = distanceM(best.l, o.base) >= 3;
  const why = problem(o.base) ?? (fairways.length && o.kind === 'drive' && !inAny(o.base, fairways) ? 'fairway' : null);
  return { landing: best.l, k: best.k, reason: moved ? why : null };
}
