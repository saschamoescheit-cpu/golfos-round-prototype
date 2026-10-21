import type { Club, LngLat, Ring } from '../types';
import { layupInstead, pinStrategy, type PinPlan } from './pinstrategy';
import type { GreenGrid } from './greenread';
import { alongLine, profileAlong, bearingDeg, distanceM, distToLine, lineLength, pointAt, pointInRing, type HoleMapData } from './geo';
import { adviseClub, playsLike, type CarryBag, type Conditions, type PlaysLike } from './caddie';
import { crossSlopeAt, heightAt, obAdvice, slopeAdvice, type Samples } from './terrain';
import type { HoleNote } from './holenotes';
import { clubCode, sideWord, tr } from './i18n';
import { missCost } from './missmap';
import { teeStrategy } from './teestrategy';
import { spreadFactor } from './hcp';

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
  strategy?: PinPlan | null; // approaches: flag, middle of the green or short of the flag (feature 015)
  fairwaySide?: number; // the drive goes to this side of the fairway (+ right) to set up the next shot; 0 = moved, not said
  teePlan?: string | null; // tee strategy (feature 017): club and side by expected strokes, one sentence
  teeClub?: Club; // the club that sentence is about
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
  woods?: Ring[]; // where a ball is lost – the tee strategy
  note?: HoleNote;
  style?: PlayStyle;
  favourite?: number; // favourite approach distance in metres
  playing?: number | null; // playing handicap – the player's spread for the pin strategy
  grid?: GreenGrid | null; // heights of this green – uphill or downhill putts
}

export function aimPoint(input: AimInput): AimPoint {
  // The fairway side is a refinement: only when that plan works out clean – no recovery through trees, no bunker or
  // water at the landing or aim point, nothing the safety check had to move away from. Else the plan on the line.
  const withSide = aimPointOn(input, true);
  if (withSide.fairwaySide == null) return withSide;
  const bad = (p: LngLat) => [...input.data.bunkers, ...input.data.water].some((r) => pointInRing(p, r));
  const moved = withSide.reasons.some((r) => (Object.keys(ZONE_WORDS) as ZoneReason[]).some((k) => r === zoneText(k)));
  if (withSide.kind === 'recovery' || bad(withSide.landing) || bad(withSide.pos) || moved) return aimPointOn(input, false);
  return withSide;
}

function aimPointOn(input: AimInput, useSide: boolean): AimPoint {
  // A tee is never in the woods: a wood area that contains the tee (generously mapped in OSM) does not block it.
  const o = input.teeShot && input.trees ? { ...input, trees: input.trees.filter((r) => !pointInRing(input.from, r)) } : input;
  const { data, from, pin } = o;
  const style = o.style ?? 'normal';
  const driverOk = o.teeShot && o.par >= 4;
  const clubs = o.bag.filter((b) => driverOk || b.club !== 'Dr').sort((a, b) => b.carry - a.carry);
  const total = lineLength(data.line);
  const alongFrom = alongLine(data.line, from);
  // Heights from the terrain model along the hole (player near the line only).
  const hFrom = distToLine(from, data.line) <= 40 ? heightAt(o.slopes, profileAlong(data, from)) : null;
  const hAt = (p: LngLat) => (distToLine(p, data.line) <= 40 ? heightAt(o.slopes, profileAlong(data, p)) : null);
  const hd = (p: LngLat) => {
    const h = hAt(p);
    return hFrom != null && h != null ? h - hFrom : null;
  };
  const reasons: string[] = [];
  let fairwaySideM: number | undefined;
  let teePlanText: string | null = null;
  let teeClub: Club | undefined;
  let teeSide = 0;

  // Hazards around the landing zone → the safe style clubs down off the tee.
  const obNote = o.note ?? {};
  let longest = clubs[0]?.carry ?? 200;
  const toPin = playsLike(distanceM(from, pin), bearingDeg(from, pin), o.conditions, hd(pin));
  const reachMargin = style === 'aggressive' ? 10 : style === 'safe' ? -10 : 5;

  let base: LngLat;
  let kind: AimKind;
  let strategy: PinPlan | null = null;
  if (toPin.playsLike <= longest + reachMargin && !driverOk) {
    base = pin;
    kind = 'approach';
    // Flag, middle of the green or short of the flag: what costs the fewest strokes with this player's spread.
    strategy = pinStrategy({ from, pin, data, distM: toPin.playsLike, playing: o.playing ?? null, style, grid: o.grid ?? null });
    if (strategy) base = strategy.aim;
    // A long shot at the green: would a lay-up to the favourite distance cost fewer strokes? (feature 017)
    const fav = Math.min(200, Math.max(30, o.favourite || 90));
    const lu = strategy ? layupInstead({ from, pin, data, distM: toPin.playsLike, favourite: fav, playing: o.playing ?? null, style }) : null;
    if (lu) {
      base = lu.aim;
      kind = 'layup';
      strategy = null;
      reasons.push(lu.text);
    }
    else if (style === 'safe' && o.data.green && distanceM(pin, o.data.greenCenter) > 6) {
      base = o.data.greenCenter; // safe: middle of the green, not the flag
      reasons.push(tr('middle of the green', 'Grünmitte'));
    }
  } else {
    const dir = bearingDeg(from, pin);
    const ratio = 100 / playsLike(100, dir, o.conditions, null).playsLike;
    // Tee strategy (feature 017): the club and side with the fewest expected strokes for this player.
    const ts = driverOk && distanceM(from, data.tee) < 30 ? teeStrategy({ data, par: o.par, bag: o.bag, playing: o.playing ?? null, style, conditions: o.conditions, boundary: o.boundary, trees: o.trees, woods: o.woods, slopes: o.slopes, note: obNote }) : null;
    if (ts) {
      teePlanText = ts.text;
      teeClub = ts.club;
      teeSide = ts.side;
      if (ts.carry < longest) longest = ts.carry;
    } else if (driverOk && style === 'safe' && (obNote.obLeft || obNote.obRight) && clubs.length > 1) {
      longest = clubs[1].carry; // safe: one club less off the tee when out of bounds is close
      reasons.push(tr(`${clubs[1].club} for safety`, `${clubCode(clubs[1].club)} zur Sicherheit`));
    }
    const reach = longest * ratio;
    let along = Math.min(alongFrom + reach, total - 60);
    // Layup (not the tee shot on a par 4): leave the favourite distance if that is in reach.
    const fav = Math.min(200, Math.max(30, o.favourite || 90)); // 30–200 m, whatever was typed
    if (!o.teeShot && total - fav > alongFrom + 30 && total - fav <= alongFrom + reach) {
      along = total - fav;
      // a flat lie for the next shot (Sascha's Hetzenhof notes, 4A: "level with the fairway bunkers, no downslope"):
      // within 25 m shorter or 5 m longer, the spot where the ground is least steep (across and along the line)
      const steep = (a: number) => {
        const off = o.data.along0 ?? 0;
        const c = crossSlopeAt(o.slopes, a + off);
        const h0 = heightAt(o.slopes, a + off - 5);
        const h1 = heightAt(o.slopes, a + off + 5);
        if (c == null || h0 == null || h1 == null) return null;
        return Math.hypot(c, ((h1 - h0) / 10) * 100);
      };
      const here = steep(along);
      if (here != null && here >= 4) {
        let best = { a: along, v: here };
        for (let a = along - 25; a <= along + 5 && a <= alongFrom + reach; a += 5) {
          if (a < alongFrom + 30) continue;
          const v = steep(a);
          if (v != null && v < best.v) best = { a, v };
        }
        if (here - best.v >= 2) along = best.a;
      }
      const leaves = Math.round((total - along) / 5) * 5;
      reasons.push(tr(`leaves ${leaves} m`, `lässt ${leaves} m`) + (along !== total - fav ? tr(' – flat lie', ' – ebene Lage') : ''));
    }
    base = pointAt(data.line, Math.max(along, alongFrom + 30));
    kind = o.teeShot ? 'drive' : 'layup';
    // The tee strategy chose a side (away from out of bounds, water …): that one. Otherwise: which side of the
    // fairway sets up the next shot best (dogleg left → right side, trees at the corner …).
    if (teeSide !== 0) {
      const at = alongLine(data.line, base);
      base = move(base, bearingDeg(pointAt(data.line, Math.max(0, at - 20)), base) + 90, teeSide);
    }
    const fs = useSide && teeSide === 0 ? fairwaySide({ from, base, pin, data, trees: o.trees }) : null;
    if (fs) base = fs.landing;
    if (fs) fairwaySideM = fs.side; // 0: moved towards the fairway middle, not worth saying
    if (fs && fs.side !== 0) {
      const right = fs.side > 0;
      reasons.push(
        fs.why === 'line'
          ? tr(`${right ? 'right' : 'left'} side of the fairway – clear line to the green`, `${right ? 'rechte' : 'linke'} Fairwayseite – freie Linie aufs Grün`)
          : tr(`${right ? 'right' : 'left'} side of the fairway – opens up the dogleg`, `${right ? 'rechte' : 'linke'} Fairwayseite – öffnet das Dogleg`),
      );
    }
  }

  // Sideways: wind drift, own tendency, hanging fairway – the aim point; the ball should end up at the landing spot.
  const dist0 = distanceM(from, base);
  const pl0 = playsLike(dist0, bearingDeg(from, base), o.conditions, hd(base));
  const club0 = adviseClub(pl0.playsLike, o.bag, driverOk).club;
  const hang = kind === 'approach' ? null : slopeAdvice(crossSlopeAt(o.slopes, profileAlong(data, base)));
  const tend = o.tendency.get(club0) ?? 0;
  let side = Math.max(-15, Math.min(15, pl0.aimM - tend + (hang?.aimM ?? 0)));
  if (Math.abs(pl0.aimM) >= 2) reasons.push(tr('wind', 'Wind') + ` ${Math.abs(Math.round(pl0.aimM))} m ${sideWord(pl0.aimM > 0 ? 'right' : 'left')}`);
  if (Math.abs(tend) >= 3) reasons.push(tr(`your ${club0} goes`, `dein ${clubCode(club0)} geht`) + ` ${Math.abs(tend)} m ${sideWord(tend > 0 ? 'right' : 'left')}`);
  if (hang) reasons.push(tr('slope', 'Hang') + ` ${Math.abs(hang.aimM)} m ${sideWord(hang.aimM > 0 ? 'right' : 'left')}`);
  // "Centre" is wrong when the landing spot already sits on one side of the fairway (dogleg, clear line): then the
  // aim just goes no further towards the out of bounds.
  const keepOff = (towards: 'left' | 'right') =>
    (fairwaySideM !== 0 && fairwaySideM != null) || teeSide !== 0
      ? tr(`no further ${towards} – out of bounds`, `nicht weiter ${sideWord(towards)} – Aus`)
      : tr('centre – out of bounds', 'Mitte – Aus') + ` ${sideWord(towards)}`;
  const dropMoves = () => {
    // Only say why the shot stays in the middle; the moves that were dropped would confuse.
    for (let k = reasons.length - 1; k >= 0; k--) if (/^(wind|your|slope|Wind|dein|Hang) /.test(reasons[k])) reasons.splice(k, 1);
  };
  // Hole notes (out of bounds the map does not know, no distance): never aim towards that side.
  if ((side < 0 && obNote.obLeft) || (side > 0 && obNote.obRight)) {
    const towards = side < 0 ? 'left' : 'right';
    side = 0;
    dropMoves();
    reasons.push(keepOff(towards));
  }

  // Safety (feature 020, like a tour caddie): the landing spot is clear of water, bunkers and trees and stays
  // 20 m inside the course boundary – and so does the aim point, in case the wind does not bring the ball back.
  const zone = safeLanding({ from, base, side, kind, data, boundary: o.boundary, trees: o.trees });
  if (zone.reason && !(zone.k < 1 && zone.reason === 'ob')) reasons.push(zoneText(zone.reason));
  if (zone.k < 1 && Math.abs(side) >= 2) {
    const towards = side < 0 ? 'left' : 'right';
    dropMoves();
    if (zone.k > 0) reasons.push(tr('only', 'nur') + ` ${Math.round(Math.abs(side * zone.k))} m ${sideWord(towards)} – ` + tr('out of bounds', 'Aus'));
    else reasons.push(keepOff(towards));
  }
  side *= zone.k;
  base = zone.landing;
  let pos = Math.abs(side) >= 2 ? move(base, bearingDeg(from, base) + 90, side) : base;

  // Trees: keep the shot if the line is free; else the free line closest to the plan (never into water or out).
  let note: string | null = null;
  const outside = (p: LngLat) => !!o.boundary?.length && !o.boundary.some((r) => pointInRing(p, r));
  const fromInside = !outside(from);
  // not from the tee: the hole is laid out to be played from there – a tee box cut into the wood would otherwise read
  // as "trees in the way" (Sascha 21.10.2026, Frielinghausen 3: a GW to 81 m on a 202 m par 3); the landing spot is
  // kept clear of trees above
  if (!o.teeShot && blocked(from, pos, o.trees)) {
    const b0 = bearingDeg(from, pos);
    const d0 = distanceM(from, pos);
    let best: { p: LngLat; score: number; ang: number } | null = null;
    for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
      for (let ang = 0; ang <= 60; ang += 5) {
        for (const sgn of ang === 0 ? [1] : [1, -1]) {
          const p = move(from, b0 + sgn * ang, d0 * frac);
          if (blocked(from, p, o.trees) || (o.trees ?? []).some((r) => pointInRing(p, r))) continue;
          if (data.water.some((r) => pointInRing(p, r)) || (fromInside && outside(p))) continue;
          // keep clear of out of bounds like every landing spot (feature 020): never closer than 10 m, prefer 20 m
          const gap = fromInside && o.boundary?.length ? Math.min(...o.boundary.map((r) => distToLine(p, r))) : Infinity;
          if (gap < 10) continue;
          // a punch out into a bunker is no way out: only when nothing else is free
          const sand = data.bunkers.some((r) => pointInRing(p, r)) ? 200 : 0;
          const score = ang * 1.5 + (1 - frac) * 60 + Math.max(0, distanceM(p, pin) - distanceM(pos, pin)) * 0.2 + Math.max(0, SAFETY.obMarginM - gap) * 3 + sand;
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
  // Said only when it is in play for this shot (like a caddie): the boundary within 2.5 × the player's sideways
  // spread (+5 m) – a 40 m pitch never hears about out of bounds 27 m away. Known only from a hole note (no
  // distance): from 120 m on.
  const k = spreadFactor(o.playing);
  const reach = 2.5 * (0.065 * distance + 2) * k + 5;
  const inPlay = (m: number | undefined, known: boolean | undefined) => (m != null && isFinite(m) ? m <= reach : !!known && distance >= 120);
  const obSides = [
    obLeft && inPlay(ob?.left, obNote.obLeft) && sideText('left', obNote.obLeft, ob?.left),
    obRight && inPlay(ob?.right, obNote.obRight) && sideText('right', obNote.obRight, ob?.right),
    obNote.obLong && distance >= 120 && sideWord('long'),
  ].filter(Boolean);
  if (!note && obSides.length) note = tr('Out of bounds', 'Aus') + ' ' + obSides.join(tr(' and ', ' und '));
  return { pos, landing: kind === 'recovery' ? pos : base, kind, club, distance, pl, side, reasons, note, strategy, fairwaySide: fairwaySideM, teePlan: teePlanText, teeClub };
}

/**
 * Which side of the fairway (Sascha, 13.10.2026: "dogleg left – the ball belongs on the right side").
 * Caddie rule: on a dogleg the drive goes to the outside of the corner – it opens the angle into the green and
 * keeps the corner (trees, rough) out of the next shot; the more the hole turns, the further out (≈ 3 m + 0.3 m
 * per degree). The rule gives way to the lie around the spot (a drive scatters about ±10 m: bunker, water, rough)
 * and to trees in the line of the next shot (they stop a low start and the last metres; a high shot flies over
 * the middle) – a side with a clear line wins on straight holes too. Keeps 5 m from the fairway edge.
 * Null = stay in the middle.
 */
export function fairwaySide(o: { from: LngLat; base: LngLat; pin: LngLat; data: HoleMapData; trees?: Ring[] }): { landing: LngLat; side: number; why: 'line' | 'dogleg' } | null {
  const { data, pin } = o;
  const b = bearingDeg(o.from, o.base);
  const across = (s: number) => move(o.base, b + 90, s);
  const fw = nearRings(data.fairways, o.base, 80);
  const inFw = (p: LngLat) => fw.some((r) => pointInRing(p, r));
  let lo = -12;
  let hi = 12;
  if (fw.length) {
    if (!inFw(o.base)) return null; // off the fairway: the safe landing search brings it back
    lo = 0;
    hi = 0;
    while (lo > -40 && inFw(across(lo - 2))) lo -= 2;
    while (hi < 40 && inFw(across(hi + 2))) hi += 2;
    lo += 5;
    hi -= 5;
  }
  if (hi - lo < 6) return null;
  // Where the next shot goes: the pin when in reach, else 200 m on along the hole (par 5).
  const alongBase = alongLine(data.line, o.base);
  const next = distanceM(o.base, pin) <= 230 ? pin : pointAt(data.line, Math.min(lineLength(data.line), alongBase + 200));
  // How the hole turns at the landing spot – along the hole line, not from where the player stands (from the side
  // of a straight hole the line to the green would look like a dogleg).
  const lineDir = bearingDeg(pointAt(data.line, Math.max(0, alongBase - 30)), pointAt(data.line, alongBase));
  const turn = ((bearingDeg(o.base, next) - lineDir + 540) % 360) - 180; // < 0: the hole turns left
  // Measured from the middle of the fairway (the hole line need not run through it).
  const mid = (lo + hi) / 2;
  const dogleg = Math.abs(turn) >= 15;
  const want = dogleg ? mid - Math.sign(turn) * (3 + 0.3 * Math.abs(turn)) : 0;
  const toNext = distanceM(o.base, next);
  const trees = nearRings(o.trees, move(o.base, bearingDeg(o.base, next), toNext / 2), toNext / 2 + 40);
  const inTrees = (p: LngLat) => trees.some((r) => pointInRing(p, r));
  const rate = (s: number) => {
    const l = across(s);
    const d = distanceM(l, next);
    const br = bearingDeg(l, next);
    let line = 0;
    for (let k = 8; k < d - 5; k += 6) if (inTrees(move(l, br, k))) line += k < 50 || k > d - 25 ? 0.12 : 0.03;
    line = Math.min(line, 0.8);
    const lie = ([-10, 0, 10].reduce((sum, x) => sum + missCost(across(s + x), pin, data), 0) * 0.6) / 3;
    return { cost: line + lie + (dogleg ? 0.012 : 0.006) * Math.abs(s - want), line };
  };
  const centreS = Math.max(lo, Math.min(hi, 0));
  const centre = rate(centreS);
  let best = { s: centreS, ...centre };
  // never onto a bunker, water or trees that lie inside the mapped fairway
  const bad = [...nearRings(data.bunkers, o.base, 60), ...nearRings(data.water, o.base, 60), ...nearRings(o.trees, o.base, 60)];
  for (let s = lo; s <= hi; s += 2) {
    if (bad.some((r) => pointInRing(across(s), r))) continue;
    const r = rate(s);
    if (r.cost < best.cost) best = { s, ...r };
  }
  if (Math.abs(best.s - centreS) < 3 || centre.cost - best.cost < (dogleg ? 0.01 : 0.02)) return null;
  const why = best.line < centre.line - 0.02 ? 'line' : 'dogleg';
  // Said only when the spot really is on one side of the fairway – and for a dogleg only on its outside.
  const side = best.s - mid;
  if (Math.abs(side) < 3 || (why === 'dogleg' && Math.sign(side) !== -Math.sign(turn))) return { landing: across(best.s), side: 0, why };
  return { landing: across(best.s), side, why };
}

/** Why the landing spot moved. */
export type ZoneReason = 'water' | 'waterPast' | 'ob' | 'trees' | 'bunker' | 'fairway';
const ZONE_WORDS: Record<ZoneReason, true> = { water: true, waterPast: true, ob: true, trees: true, bunker: true, fairway: true };
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
  // near the plan first; nothing safe there (Son Gual 6 into a strong wind: water fills the landing zone) → lay up further
  for (const ring of [{ as: [0, -10, -20, -30, -45], sw: 20 }, { as: [-60, -75, -90], sw: 32 }]) {
    if (best) break;
    for (const a of ring.as) {
      if (d + a < 40) continue;
      for (let s = -ring.sw; s <= ring.sw; s += 4) {
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
  }
  if (!best) return { landing: o.base, k: obGap(aimAt(o.base, 1)) < SAFETY.obMarginM ? 0 : 1, reason: null };
  const moved = distanceM(best.l, o.base) >= 3;
  const why = problem(o.base) ?? (fairways.length && o.kind === 'drive' && !inAny(o.base, fairways) ? 'fairway' : null);
  return { landing: best.l, k: best.k, reason: moved ? why : null };
}
